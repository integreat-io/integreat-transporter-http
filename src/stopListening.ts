import type { Response } from 'integreat'
import getHandlersForIncoming from './utils/getHandlersForIncoming.js'
import type { Connection, PortHandlers } from './types.js'

export default (portHandlers: PortHandlers) =>
  async function stopListening(
    connection: Connection | null,
  ): Promise<Response> {
    if (!connection) {
      return { status: 'badrequest', error: 'No connection' }
    }
    const { handlerCase } = connection
    if (!handlerCase) {
      return {
        status: 'noaction',
        warning: 'No incoming handler found for this connection',
      }
    }

    const handlerCases = getHandlersForIncoming(
      portHandlers,
      connection.incoming,
    )
    if (!handlerCases) {
      return {
        status: 'noaction',
        warning: 'No incoming handler cases found for this connection',
      }
    }

    handlerCases.delete(handlerCase)

    return { status: 'ok' }
  }
