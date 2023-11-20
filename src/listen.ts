import debugFn from 'debug'
import { actionFromRequest } from './utils/request.js'
import {
  dataFromResponse,
  statusCodeFromResponse,
  normalizeHeaders,
} from './utils/response.js'
import type http from 'http'
import type {
  Dispatch,
  Action,
  Response,
  Headers,
  Ident,
  AuthenticateExternal,
} from 'integreat'
import type { Connection, ConnectionIncomingOptions } from './types.js'

const debug = debugFn('integreat:transporter:http')
const debugHeaders = debugFn('integreat:transporter:http:headers')

const services = new Map<
  number,
  [ConnectionIncomingOptions, Dispatch, AuthenticateExternal][]
>()

const matchesHostname = (hostname: unknown, patterns: string[]) =>
  patterns.length === 0 ||
  (typeof hostname === 'string' && patterns.includes(hostname))

function matchesPath(path: unknown, patterns: string[]) {
  if (patterns.length === 0 || patterns.includes('/')) {
    // We don't need any further checks if the pattern is empty or contains '/'
    return true
  }

  const lowerCasePath =
    typeof path === 'string' ? path.toLowerCase() : undefined
  return (
    lowerCasePath &&
    patterns.some(
      (pattern) =>
        lowerCasePath.startsWith(pattern) &&
        (lowerCasePath.length === pattern.length ||
          ['/', '?', '#'].includes(pattern[lowerCasePath.length])),
    )
  )
}

const actionMatchesOptions = (
  action: Action,
  options: ConnectionIncomingOptions,
) =>
  matchesHostname(action.payload.hostname, options.host) &&
  matchesPath(action.payload.path, options.path)

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
  responseDate?: string,
  responseHeaders?: Headers,
) {
  try {
    res.writeHead(statusCode, {
      'content-type': 'application/json',
      ...normalizeHeaders(responseHeaders),
    })
    res.end(responseDate)
  } catch (error) {
    res.writeHead(500)
    res.end(JSON.stringify({ status: 'error', error: 'Internal server error' }))
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

const createHandler = (
  ourServices: [ConnectionIncomingOptions, Dispatch, AuthenticateExternal][],
  incomingPort: number,
) =>
  async function handleIncoming(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    let action = await actionFromRequest(req, incomingPort)
    debug(
      `Incoming action: ${action.type} ${action.payload.method} ${action.payload.path} ${action.payload.queryParams} ${action.payload.contentType}`,
    )
    debugHeaders(`Incoming headers: ${JSON.stringify(req.headers)}`)

    const [options, dispatch, authenticate] =
      ourServices.find(([options]) => actionMatchesOptions(action, options)) ||
      []

    if (!options?.caseSensitivePath) {
      // We make the path lowercase if `caseSensitivePath` is false. This has to
      // be done here, as it is dependant on the incoming options.
      action = lowerCaseActionPath(action)
    }

    if (dispatch && authenticate) {
      const authResponse = await authenticate({ status: 'granted' }, action)
      const ident = authResponse.access?.ident

      const sourceService = options?.sourceService
      const nextAction = setResponseIfAuthError(
        setIdentAndSourceService(action, ident, sourceService),
        authResponse,
      )
      const response = await dispatch(nextAction)
      const responseDate = dataFromResponse(response)
      const statusCode = statusCodeFromResponse(response)
      const headers = getHeadersAndSetAuthHeaders(response, options)

      return respond(res, statusCode, responseDate, headers)
    } else {
      res.writeHead(404)
      res.end()
    }
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

function waitOnError(server: http.Server, port: number) {
  let error: Error | null = null

  server.on('error', (e) => {
    error = e
  })

  return (): Promise<Response> =>
    new Promise((resolve, _reject) => {
      setTimeout(() => {
        if (error) {
          debug(
            `Server on port ${port} gave an error after it was started: ${error}`,
          )
          resolve({
            status: 'error',
            error: `Cannot listen to server on port ${port}. ${error}`,
          })
        } else {
          debug(`No error from server on port ${port} after 200 ms`)
          resolve({ status: 'ok' })
        }
      }, 200)
    })
}

function getOurServices(port: number) {
  let ourServices = services.get(port)
  if (!ourServices) {
    ourServices = []
    services.set(port, ourServices)
  }
  return ourServices
}

export default async function listen(
  dispatch: Dispatch,
  connection: Connection | null,
  authenticate: AuthenticateExternal,
): Promise<Response> {
  debug('Start listening ...')
  const { incoming, server } = connection || {}

  if (!incoming?.port || !server) {
    const errorResponse = getErrorFromConnection(connection)
    debug(errorResponse.error)
    return errorResponse
  }

  // Set up listener if this is the first service to listen on this port
  const ourServices = getOurServices(incoming.port)
  if (ourServices.length === 0) {
    debug(`Set up request handler for first service on port ${incoming.port}`)
    server.on('request', createHandler(ourServices, incoming.port))
  }

  // Add service settings to list
  ourServices.push([incoming, dispatch, authenticate])

  // Start listening on port if we're not already listening
  if (!server.listening) {
    debug(`Start listening to first service on port ${incoming.port}`)
    const wait = waitOnError(server, incoming.port)

    // Start listening
    try {
      server.listen(incoming.port)
      debug(`Listening on port ${incoming.port}`)
    } catch (error) {
      debug(`Cannot listen to server on port ${incoming.port}. ${error}`)
      return {
        status: 'error',
        error: `Cannot listen to server on port ${incoming.port}. ${error}`,
      }
    }

    // The server has been started but give it a few ms to make sure it doesn't throw right away
    return await wait()
  }

  return { status: 'ok' }
}
