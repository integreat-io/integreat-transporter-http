import send from './send'
import { EndpointOptions, Transporter } from './types'

/**
 * HTTP Transporter for Integreat
 */
const httpTransporter: Transporter = {
  authentication: 'asHttpHeaders',

  prepareOptions: (options: EndpointOptions) => options,

  connect: async (_options, _authentication, connection) => connection,

  send,

  disconnect: async (_connection) => undefined,
}

export default httpTransporter
