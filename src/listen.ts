import http = require('http')
import {
  Dispatch,
  Connection,
  ConnectionIncomingOptions,
  Response,
  Action,
} from './types'

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
  request.method === 'GET' ? 'GET' : 'SET'

function contentTypeFromRequest(request: http.IncomingMessage) {
  const header = request.headers['content-type']
  if (typeof header === 'string') {
    return header.split(';')[0]
  }

  return undefined
}

const contentTypeFromResponse = (response: Response) =>
  (response.headers && response.headers['content-type']) || 'application/json'

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
    case 'noaccess':
      return 401
    case 'notfound':
    case 'noaction':
      return 404
    case 'timeout':
      return 408
    default:
      return 500
  }
}

function splitHost(host?: string) {
  if (!host) {
    return []
  }
  const portIndex = host.lastIndexOf(':')
  const hostname = host.slice(0, portIndex)
  const port = Number.parseInt(host.slice(portIndex + 1), 10) || undefined
  return [hostname, port]
}

async function readDataFromRequest(request: http.IncomingMessage) {
  const buffers = []
  for await (const chunk of request) {
    buffers.push(chunk)
  }
  return Buffer.concat(buffers).toString()
}

async function actionFromRequest(request: http.IncomingMessage) {
  const [hostname, port] = splitHost(request.headers['host'])
  const data = await readDataFromRequest(request)

  return {
    type: actionTypeFromRequest(request),
    payload: {
      ...(data && { data }),
      method: request.method,
      hostname,
      port,
      path: request.url,
      contentType: contentTypeFromRequest(request),
      headers: request.headers as Record<string, string>,
    },
    meta: {},
  }
}

const createHandler = (ourServices: [Dispatch, ConnectionIncomingOptions][]) =>
  async function handleIncoming(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const action = await actionFromRequest(req)

    const [dispatch] =
      ourServices.find(([, options]) =>
        actionMatchesOptions(action, options)
      ) || []

    if (dispatch) {
      const response = await dispatch(action)

      const responseDate = dataFromResponse(response)
      const contentType = contentTypeFromResponse(response)
      const statusCode = statusCodeFromResponse(response)

      res.writeHead(statusCode, { 'Content-Type': contentType })
      res.end(responseDate)
    } else {
      res.writeHead(404)
      res.end()
    }
  }

export default async function listen(
  dispatch: Dispatch,
  connection: Connection | null
) {
  if (!connection) {
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No connection',
    }
  }

  const { incoming, server } = connection

  if (!incoming) {
    return {
      status: 'noaction',
      error: 'Service not configured for listening',
    }
  }
  if (!server) {
    return {
      status: 'badrequest',
      error: 'Cannot listen to server. No server set on connection',
    }
  }
  if (!incoming.port) {
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
    server.on('request', createHandler(ourServices))
  }

  // Add service settings to list
  ourServices.push([dispatch, incoming])

  // Start listening on port if we're not already listening
  if (!server.listening) {
    server.listen(incoming.port)
  }

  return { status: 'ok' }
}
