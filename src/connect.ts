import http from 'http'
import pThrottle from 'p-throttle'
import { ensureArray } from './utils/array.js'
import { isNonEmptyString, isObject } from './utils/is.js'
import type {
  Connection,
  ServiceOptions,
  IncomingOptions,
  HttpChallenge,
} from './types.js'

const lowercase = (path?: string) =>
  typeof path === 'string' ? path.toLowerCase() : undefined

const prepareChallenge = ({ scheme, realm, params = {} }: HttpChallenge) => ({
  scheme,
  realm,
  params,
})

// Note: We make `host` and `path` lowercase, as these are the values that will
// be compared with the incoming request -- where it is also lowercased.
// We lower case it here, even when `caseSensitivePath` is true, as that flag
// only affects the incoming action that is created from the request.
const prepareIncoming = (incoming: IncomingOptions) => ({
  host: ensureArray(incoming.host).map(lowercase).filter(isNonEmptyString),
  path: ensureArray(incoming.path).map(lowercase).filter(isNonEmptyString),
  port: incoming.port || 8080,
  sourceService: incoming.sourceService,
  challenges: (incoming.challenges || []).map(prepareChallenge),
  caseSensitivePath: incoming.caseSensitivePath ?? false,
})

const servers: Record<number, http.Server> = {}

const isInvalidThrottleOptions = (options: ServiceOptions) =>
  isObject(options.throttle) &&
  (typeof options.throttle.limit !== 'number' ||
    typeof options.throttle.interval !== 'number')

function prepareWaitFn(options: ServiceOptions) {
  if (options.throttle) {
    return pThrottle(options.throttle)(async () => {})
  } else {
    return undefined
  }
}

export default async function connect(
  options: ServiceOptions,
  _authentication: Record<string, unknown> | null,
  existingConnection: Connection | null,
): Promise<Connection | null> {
  if (existingConnection && existingConnection.status === 'ok') {
    return existingConnection
  }

  if (isInvalidThrottleOptions(options)) {
    // Return badrequest if we have throttle options, but they are invalid
    return { status: 'badrequest', error: 'Invalid throttle options' }
  }
  const waitFn = prepareWaitFn(options)
  const connection = {
    status: 'ok',
    ...(waitFn ? { waitFn } : {}), // Set `waitFn()` on the connections when calls to make `send()` wait for throttling
  }

  if (options.incoming) {
    const incoming = prepareIncoming(options.incoming)

    const server = servers[incoming.port] || http.createServer()
    servers[incoming.port] = server

    return { ...connection, server, incoming }
  }

  return connection
}
