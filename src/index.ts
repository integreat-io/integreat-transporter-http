import connect from './connect'
import send from './send'
import listen from './listen'
import disconnect from './disconnect'
import { EndpointOptions, Transporter } from './types'

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
