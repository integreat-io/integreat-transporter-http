import http from 'http'
import { ensureArray } from './utils/array.js'
import { isNonEmptyString } from './utils/is.js'
import type { Connection, ServiceOptions, IncomingOptions } from './types.js'

const lowercase = (path?: string) =>
  typeof path === 'string' ? path.toLowerCase() : undefined

const prepareIncoming = (incoming: IncomingOptions) => ({
  host: ensureArray(incoming.host).map(lowercase).filter(isNonEmptyString),
  path: ensureArray(incoming.path).map(lowercase).filter(isNonEmptyString),
  port: incoming.port || 8080,
  sourceService: incoming.sourceService,
})

const servers: Record<number, http.Server> = {}

export default async function connect(
  options: ServiceOptions,
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
