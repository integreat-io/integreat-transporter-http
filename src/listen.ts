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

const matchesPath = (path: unknown, patterns: string[]) =>
  patterns.length === 0 ||
  patterns.includes('/') ||
  (typeof path === 'string' &&
    patterns.some(
      (pattern) =>
        path.startsWith(pattern) &&
        (path.length === pattern.length ||
          ['/', '?', '#'].includes(pattern[path.length]))
    ))

const actionMatchesOptions = (
  action: Action,
  options: ConnectionIncomingOptions
) =>
  matchesHostname(action.payload.hostname, options.host) &&
  matchesPath(action.payload.path, options.path)

const setIdentAndSourceService = (
  action: Action,
  ident: Ident,
  sourceService?: string
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
  responseHeaders?: Headers
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
        ([key, value]) => `${key}="${value}"`
      ),
    ].join(', ')
    return [
      ['www-authenticate', `${challenge.scheme}${params ? ` ${params}` : ''}`],
    ]
  }

  return []
}

function getAuthErrorResponse(
  response: Response,
  options?: ConnectionIncomingOptions
) {
  if (response.status === 'noaccess' && response.reason === 'noauth') {
    return { statusCode: 401, headers: wwwAuthHeadersFromOptions(options) }
  } else {
    return { statusCode: 403, headers: [] }
  }
}

const createHandler = (
  ourServices: [ConnectionIncomingOptions, Dispatch, AuthenticateExternal][],
  incomingPort: number
) =>
  async function handleIncoming(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const action = await actionFromRequest(req, incomingPort)
    debug(
      `Incoming action: ${action.type} ${action.payload.method} ${action.payload.path} ${action.payload.queryParams} ${action.payload.contentType}`
    )
    debugHeaders(`Incoming headers: ${JSON.stringify(req.headers)}`)

    const [options, dispatch, authenticate] =
      ourServices.find(([options]) => actionMatchesOptions(action, options)) ||
      []

    if (dispatch && authenticate) {
      const authResponse = await authenticate({ status: 'granted' }, action)
      const ident = authResponse.access?.ident
      if (authResponse.status !== 'ok' || !ident) {
        const { statusCode, headers } = getAuthErrorResponse(
          authResponse,
          options
        )
        for (const [key, value] of headers) {
          res.setHeader(key, value)
        }
        res.writeHead(statusCode)
        res.end()
        return
      }

      const sourceService = options?.sourceService
      const response = await dispatch(
        setIdentAndSourceService(action, ident, sourceService)
      )

      const responseDate = dataFromResponse(response)
      const statusCode = statusCodeFromResponse(response)

      return respond(res, statusCode, responseDate, response.headers)
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
            `Server on port ${port} gave an error after it was started: ${error}`
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
  authenticate: AuthenticateExternal
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
