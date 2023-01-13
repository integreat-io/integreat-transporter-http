import { Connection } from './types.js'

export default async function disconnect(
  connection: Connection | null
): Promise<void> {
  if (connection?.server) {
    connection.server.close()
  }
}
