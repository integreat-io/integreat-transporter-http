import connect from './connect.js'
import send from './send.js'
import listen from './listen.js'
import stopListening from './stopListening.js'
import disconnect from './disconnect.js'
import type { Transporter } from 'integreat'
import type { ServiceOptions, HandlerCase } from './types.js'

const portHandlers = new Map<number, Set<HandlerCase>>()

/**
 * HTTP Transporter for Integreat
 */
const httpTransporter: Transporter = {
  authentication: 'asHttpHeaders',

  prepareOptions: (options: ServiceOptions) => options,

  connect,

  send,

  shouldListen: (options: ServiceOptions) => !!options.incoming,

  listen: listen(portHandlers),

  stopListening,

  disconnect: disconnect(portHandlers),
}

export default httpTransporter
