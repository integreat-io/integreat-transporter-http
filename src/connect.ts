import http = require('http')
import { ensureArray } from './utils/array.js'
import { Connection, EndpointOptions, IncomingOptions } from './types.js'

const prepareIncoming = (incoming: IncomingOptions) => ({
  host: ensureArray(incoming.host),
  path: ensureArray(incoming.path),
  port: incoming.port || 8080,
  sourceService: incoming.sourceService,
})

const servers: Record<number, http.Server> = {}

export default async function connect(
  options: EndpointOptions,
  _authentication: Record<string, unknown> | null,
  _connection: Connection | null
): Promise<Connection | null> {
  if (options.incoming) {
    const incoming = prepareIncoming(options.incoming)

    const server = servers[incoming.port] || http.createServer()
    servers[incoming.port] = server

    return { status: 'ok', server, incoming }
  }

  return { status: 'ok' }
}
