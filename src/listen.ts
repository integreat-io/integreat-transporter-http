import debugFn from 'debug'
import { actionFromRequest } from './utils/request.js'
import {
  dataFromResponse,
  statusCodeFromResponse,
  normalizeHeaders,
} from './utils/response.js'
import type http from 'http'
import type { Server } from 'http'
import type {
  Dispatch,
  Action,
  Response,
  Headers,
  Ident,
  AuthenticateExternal,
} from 'integreat'
import type {
  Connection,
  ConnectionIncomingOptions,
  HandlerCase,
  PortHandlers,
} from './types.js'

const debug = debugFn('integreat:transporter:http')
const debugHeaders = debugFn('integreat:transporter:http:headers')

const matchesHostname = (hostname: unknown, patterns: string[]) =>
  patterns.length === 0
    ? 1
    : typeof hostname === 'string' && patterns.includes(hostname)
      ? 10000
      : 0

const matchPattern = (path: string) =>
  function matchPattern(score: number, pattern: string) {
    const isMatch =
      path.startsWith(pattern) &&
      (path.length === pattern.length ||
        ['/', '?', '#'].includes(pattern[path.length]))
    return isMatch && pattern.length > score ? pattern.length : score
  }

function matchesPath(path: unknown, patterns: string[]) {
  if (patterns.length === 0 || patterns.includes('/')) {
    // We don't need any further checks if the pattern is empty or contains '/'
    return 1 // The smallest match score
  }

  return typeof path === 'string'
    ? patterns.reduce(matchPattern(path.toLowerCase()), 0)
    : 0
}

// Will match the action agains incoming options and return a score based
// on how well it matches. Matching paths gives a score based on the length
// of the path pattern. Matching hostnames give a score of 10000 to make
// sure we never match on paths without a hostname when there are matching
// incoming options _with_ hostname.
function actionMatchesOptions(
  action: Action,
  options: ConnectionIncomingOptions,
) {
  const hostScore = matchesHostname(action.payload.hostname, options.host)
  const pathScore =
    hostScore > 0 ? matchesPath(action.payload.path, options.path) : 0
  return pathScore > 0 ? hostScore + pathScore : 0
}
const lowerCaseActionPath = (action: Action): Action => ({
  ...action,
  payload: {
    ...action.payload,
    path:
      typeof action.payload.path === 'string'
        ? action.payload.path.toLowerCase()
        : undefined,
  },
})

const setIdentAndSourceService = (
  action: Action,
  ident?: Ident,
  sourceService?: string,
) =>
  typeof sourceService === 'string'
    ? {
        ...action,
        payload: {
          ...action.payload,
          sourceService,
        },
        meta: { ...action.meta, ident },
      }
    : { ...action, meta: { ...action.meta, ident } }

function respond(
  res: http.ServerResponse,
  statusCode: number,
  responseData?: string,
  responseHeaders?: Headers,
) {
  try {
    const headers = normalizeHeaders(responseHeaders)
    res
      .writeHead(statusCode, {
        'content-type': 'application/json',
        ...headers,
      })
      .end(responseData)
  } catch (error) {
    res
      .writeHead(500)
      .end(JSON.stringify({ status: 'error', error: 'Internal server error' }))
  }
}

function wwwAuthHeadersFromOptions(options?: ConnectionIncomingOptions) {
  const { challenges } = options || {}
  if (Array.isArray(challenges) && challenges.length > 0) {
    // There may be more than one challenge, but we only support one for now
    const challenge = challenges[0]
    const params = [
      ...(challenge.realm ? [`realm="${challenge.realm}"`] : []),
      ...Object.entries(challenge.params).map(
        ([key, value]) => `${key}="${value}"`,
      ),
    ].join(', ')
    return {
      ['www-authenticate']: `${challenge.scheme}${params ? ` ${params}` : ''}`,
    }
  }

  return {}
}

function getHeadersAndSetAuthHeaders(
  response: Response,
  options?: ConnectionIncomingOptions,
) {
  if (response.status === 'noaccess' && response.reason === 'noauth') {
    return { ...response.headers, ...wwwAuthHeadersFromOptions(options) }
  } else {
    return response.headers
  }
}

// If the authentication attempt failed, set the response to the action before
// dispatching, so that Integreat may handle the error. This allows for
// mutating the response etc.
const setResponseIfAuthError = (action: Action, response: Response) =>
  response.status !== 'ok' ? { ...action, response } : action

function sortMatches([a]: [number, HandlerCase], [b]: [number, HandlerCase]) {
  return b - a
}

// Find the best matching incoming handlers by comparing incoming options
// and pick the one that matches with the highest degree of specificity.
function findMatchingHandlerCase(
  handlerCases: Set<HandlerCase>,
  action: Action,
): HandlerCase | undefined {
  const matched: [number, HandlerCase][] = []
  for (const handleCase of handlerCases.values()) {
    const score = actionMatchesOptions(action, handleCase.options)
    if (score > 0) {
      matched.push([score, handleCase])
    }
  }
  if (matched.length > 0) {
    // All matches return a score, we want the match with the highest score
    return matched.sort(sortMatches)[0][1] // Return the second part of the tupple (i.e. the handleCase) on the best score
  } else {
    return undefined
  }
}

async function authAndPrepareAction(
  action: Action,
  { options, authenticate }: HandlerCase,
) {
  // Authenticate incoming action with Integreat. We use a callback provided
  // when Integreat called our `listen()` method
  const authResponse = await authenticate({ status: 'granted' }, action)
  const ident = authResponse.access?.ident

  // Set received ident from Integreat and the source service on the action
  const sourceService = options?.sourceService
  const authenticatedAction = setResponseIfAuthError(
    setIdentAndSourceService(action, ident, sourceService),
    authResponse,
  )

  // We make the path lowercase if `caseSensitivePath` is false. This has to
  // be done here, as it is dependant on the incoming options.
  return options.caseSensitivePath
    ? authenticatedAction
    : lowerCaseActionPath(authenticatedAction)
}

const createHandler = (ourServices: Set<HandlerCase>, incomingPort: number) =>
  async function handleIncoming(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    const action = await actionFromRequest(req, incomingPort)
    debug(
      `Incoming action: ${action.type} ${action.payload.method} ${action.payload.path} ${action.payload.queryParams} ${action.payload.contentType}`,
    )
    debugHeaders(`Incoming headers: ${JSON.stringify(req.headers)}`)

    const handleCase = findMatchingHandlerCase(ourServices, action)
    if (!handleCase || !handleCase.dispatch || !handleCase.authenticate) {
      // No handle case matches, return 404
      res.writeHead(404)
      res.end()
      return
    }
    const { options, dispatch } = handleCase

    const incomingAction = await authAndPrepareAction(action, handleCase)
    const response = await dispatch(incomingAction)
    const responseData = dataFromResponse(response)
    const statusCode = statusCodeFromResponse(response)
    const headers = getHeadersAndSetAuthHeaders(response, options)

    respond(res, statusCode, responseData, headers)
  }

function getErrorFromConnection(connection: Connection | null) {
  if (!connection) {
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No connection',
    }
  } else if (!connection.incoming) {
    return {
      status: 'noaction',
      error: 'Service not configured for listening',
    }
  } else if (!connection.server) {
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No server set on connection',
    }
  } else if (!connection.incoming.port) {
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No port set on incoming options',
    }
  } else {
    return {
      status: 'error',
      error: 'Cannot listen to server. Unknown error',
    }
  }
}

// Get the handler cases for the specified port. If there are no handler cases
// for this port yet, we create and stores a Set before returning it.
function getHandlerCasesForPort(portHandlers: PortHandlers, port: number) {
  let handlerCases = portHandlers.get(port)
  if (!handlerCases) {
    handlerCases = new Set()
    portHandlers.set(port, handlerCases)
  }
  return handlerCases
}

function waitForListeningOrError(server: Server) {
  return new Promise((resolve, reject) => {
    // To clean up, we call removeListeners() in each handler, to remove
    // our two listeners before we resolve or reject.
    const listeningFn = () => {
      removeListeners()
      resolve(undefined)
    }
    const errorFn = (err: Error) => {
      removeListeners()
      reject(err)
    }
    const removeListeners = () => {
      server.removeListener('listening', listeningFn)
      server.removeListener('listening', errorFn)
    }
    server.on('listening', listeningFn)
    server.on('error', errorFn)
  })
}

export default (portHandlers: PortHandlers) =>
  async function listen(
    dispatch: Dispatch,
    connection: Connection | null,
    authenticate: AuthenticateExternal,
  ): Promise<Response> {
    debug('Start listening ...')
    const { incoming, server } = connection || {}

    // If the connection is missing an incoming server port or the server is
    // not set up properly, return an error.
    if (!incoming?.port || !server) {
      const errorResponse = getErrorFromConnection(connection)
      debug(errorResponse.error)
      return errorResponse
    }

    // Set up listener if this is the first service to listen on this port
    const handlerCases = getHandlerCasesForPort(portHandlers, incoming.port)

    // Are we already listening to the server on this port? There is one
    // server per port, so we only need to check `server.listening` to know
    // if it's already listening.
    if (server.listening) {
      // We're already listening
      debug(`Already listening on port ${incoming.port}`)
    } else {
      // We're not listening on this port, so set up handler and start listening
      debug(`Set up request handler for first service on port ${incoming.port}`)
      const handler = createHandler(handlerCases, incoming.port)
      server.on('request', handler)

      // Start listening
      try {
        debug(`Start listening to first service on port ${incoming.port}`)
        server.listen(incoming.port)
        await waitForListeningOrError(server)
        debug(`Listening on port ${incoming.port}`)
      } catch (error) {
        debug(`Cannot listen to server on port ${incoming.port}. ${error}`)
        return {
          status: 'error',
          error: `Cannot listen to server on port ${incoming.port}. ${error}`,
        }
      }
    }

    // Add a handler case to handler cases list. The http server handler will
    // look up the right dispatch from these cases, based on the incoming
    // options.
    const handlerCase = { options: incoming, dispatch, authenticate }
    handlerCases.add(handlerCase)
    connection!.handlerCase = handlerCase // We know connection is set

    // If we got here, return ok.
    return { status: 'ok' }
  }
