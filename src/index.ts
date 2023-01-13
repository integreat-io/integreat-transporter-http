import connect from './connect.js'
import send from './send.js'
import listen from './listen.js'
import disconnect from './disconnect.js'
import { EndpointOptions, Transporter } from './types.js'

/**
 * HTTP Transporter for Integreat
 */
const httpTransporter: Transporter = {
  authentication: 'asHttpHeaders',

  prepareOptions: (options: EndpointOptions) => options,

  connect,

  send,

  shouldListen: (options: EndpointOptions) => !!options.incoming,

  listen,

  disconnect,
}

export default httpTransporter
