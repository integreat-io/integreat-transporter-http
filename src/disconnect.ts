import stopListening from './stopListening.js'
import type { Connection } from './types.js'

export default async function disconnect(
  connection: Connection | null,
): Promise<void> {
  // Close listener if we are listening
  await stopListening(connection)
}
