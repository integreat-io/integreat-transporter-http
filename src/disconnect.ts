import stopListening from './stopListening.js'
import getHandlersForIncoming from './utils/getHandlersForIncoming.js'
import type { Connection, PortHandlers } from './types.js'

export default (portHandlers: PortHandlers) =>
  async function disconnect(connection: Connection | null): Promise<void> {
    if (connection) {
      const server = connection.server
      if (connection.incoming) {
        // Stop listener if we are listening
        await stopListening(portHandlers)(connection)
      }
      const handlerCases = getHandlersForIncoming(
        portHandlers,
        connection.incoming,
      )
      if (server && (!handlerCases || handlerCases.size === 0)) {
        // There are no more listeners -- close the server
        server.removeAllListeners()
        server.closeIdleConnections()
        server.close()
      }
    }
  }
