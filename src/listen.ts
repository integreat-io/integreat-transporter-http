import debugFn from 'debug'
import http from 'http'
import type { Dispatch, Response, Action } from 'integreat'
import type { Connection, ConnectionIncomingOptions } from './types.js'

const debug = debugFn('integreat:transporter:http')
const debugHeaders = debugFn('integreat:transporter:http:headers')

const services: Record<number, [Dispatch, ConnectionIncomingOptions][]> = {}

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

const actionTypeFromRequest = (request: http.IncomingMessage) =>
  typeof request.method !== 'string' ||
  ['GET', 'OPTIONS'].includes(request.method)
    ? 'GET'
    : 'SET'

function contentTypeFromRequest(request: http.IncomingMessage) {
  const header = request.headers['content-type']
  if (typeof header === 'string') {
    return header.split(';')[0]
  }

  return undefined
}

const normalizeHeaders = (
  headers?: Record<string, string | string[] | undefined>
) =>
  headers
    ? Object.fromEntries(
        Object.entries(headers)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key.toLowerCase(), value])
      )
    : undefined

const dataFromResponse = (response: Response) =>
  typeof response.data === 'string'
    ? response.data
    : response.data === null || response.data === undefined
    ? undefined
    : JSON.stringify(response.data)

function statusCodeFromResponse(response: Response) {
  switch (response.status) {
    case 'ok':
      return 200
    case 'queued':
      return 201
    case 'badrequest':
      return 400
    case 'autherror':
      return 401
    case 'noaccess':
      return 403
    case 'notfound':
    case 'noaction':
      return 404
    case 'timeout':
      return 408
    default:
      return 500
  }
}

async function readDataFromRequest(request: http.IncomingMessage) {
  const buffers = []
  for await (const chunk of request) {
    buffers.push(chunk)
  }
  return Buffer.concat(buffers).toString()
}

function parseUrl(request: http.IncomingMessage) {
  if (request.url && request.headers.host) {
    const parts = new URL(request.url, `http://${request.headers.host}`)
    return [
      parts.hostname,
      parts.port && Number.parseInt(parts.port, 10),
      parts.pathname,
      Object.fromEntries(parts.searchParams.entries()),
    ] as const
  }

  return []
}

export async function actionFromRequest(
  request: http.IncomingMessage,
  incomingPort: number
) {
  const [hostname, port, path, queryParams] = parseUrl(request)
  const data = await readDataFromRequest(request)

  return {
    type: actionTypeFromRequest(request),
    payload: {
      ...(data && { data }),
      method: request.method,
      hostname:
        typeof hostname === 'string' ? hostname.toLowerCase() : undefined,
      port: port || incomingPort,
      path: typeof path === 'string' ? path.toLowerCase() : undefined,
      queryParams,
      contentType: contentTypeFromRequest(request),
      headers: request.headers as Record<string, string>,
    },
    meta: {},
  }
}

const setSourceService = (action: Action, sourceService?: string) =>
  typeof sourceService === 'string'
    ? {
        ...action,
        payload: {
          ...action.payload,
          sourceService,
        },
      }
    : action

const createHandler = (
  ourServices: [Dispatch, ConnectionIncomingOptions][],
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

    const [dispatch, options] =
      ourServices.find(([, options]) =>
        actionMatchesOptions(action, options)
      ) || []

    if (dispatch) {
      const sourceService = options?.sourceService
      const response = await dispatch(setSourceService(action, sourceService))

      const responseDate = dataFromResponse(response)
      const statusCode = statusCodeFromResponse(response)

      try {
        res.writeHead(statusCode, {
          'content-type': 'application/json',
          ...normalizeHeaders(response.headers),
        })
        res.end(responseDate)
      } catch (error) {
        res.writeHead(500)
        res.end(
          JSON.stringify({ status: 'error', error: 'Internal server error' })
        )
      }
    } else {
      res.writeHead(404)
      res.end()
    }
  }

export default async function listen(
  dispatch: Dispatch,
  connection: Connection | null
): Promise<Response> {
  debug('Start listening ...')

  if (!connection) {
    debug('Cannot listen to server. No connection')
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No connection',
    }
  }

  const { incoming, server } = connection

  if (!incoming) {
    debug('Service not configured for listening')
    return {
      status: 'noaction',
      error: 'Service not configured for listening',
    }
  }
  if (!server) {
    debug('Cannot listen to server. No server set on connection')
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No server set on connection',
    }
  }
  if (!incoming.port) {
    debug('Cannot listen to server. No port set on incoming options')
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No port set on incoming options',
    }
  }

  let ourServices = services[incoming.port]
  if (!ourServices) {
    services[incoming.port] = ourServices = []
  }

  // Set up listener if this is the first service to listen on this port
  if (ourServices.length === 0) {
    debug(`Set up request handler for first service on port ${incoming.port}`)
    server.on('request', createHandler(ourServices, incoming.port))
  }

  // Add service settings to list
  ourServices.push([dispatch, incoming])

  // Start listening on port if we're not already listening
  if (!server.listening) {
    debug(`Start listening to first service on port ${incoming.port}`)
    let error: Error | null = null

    server.on('error', (e) => {
      error = e
    })

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

    // The server has been started but give it a few ms to make sure it doesn't throw
    return new Promise((resolve, _reject) => {
      setTimeout(() => {
        if (error) {
          debug(
            `Server on port ${incoming.port} gave an error after it was started: ${error}`
          )
          resolve({
            status: 'error',
            error: `Cannot listen to server on port ${incoming.port}. ${error}`,
          })
        } else {
          debug(`No error from server on port ${incoming.port} after 200 ms`)
          resolve({ status: 'ok' })
        }
      }, 200)
    })
  }

  return { status: 'ok' }
}
