import stopListening from './stopListening.js'
import type { Connection } from './types.js'

export default async function disconnect(
  connection: Connection | null,
): Promise<void> {
  if (connection) {
    const server = connection.server
    if (connection.incoming) {
      // Stop listener if we are listening
      await stopListening(connection)
    }
    if (
      server &&
      (!connection.handlerCases || connection.handlerCases?.size === 0)
    ) {
      // There are no more listeners -- close the server
      server.removeAllListeners()
      server.closeIdleConnections()
      server.close()
    }
  }
}
