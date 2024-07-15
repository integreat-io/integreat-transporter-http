import type { Response } from 'integreat'
import type { Connection } from './types.js'

export default async function stopListening(
  connection: Connection | null,
): Promise<Response> {
  if (!connection) {
    return { status: 'badrequest', error: 'No connection' }
  }
  const { incoming, handlerCases, server } = connection
  if (!incoming) {
    return {
      status: 'noaction',
      warning: 'No incoming options found on connection',
    }
  }
  if (!handlerCases) {
    // Close server when last handler case is removed
    if (server) {
      server.close()
      return { status: 'ok' }
    } else {
      return {
        status: 'noaction',
        warning: 'No incoming handler cases found on connection',
      }
    }
  }

  handlerCases.delete(incoming)
  if (server && handlerCases.size === 0) {
    // Close server when last handler case is removed
    server.close()
  }
  return { status: 'ok' }
}
