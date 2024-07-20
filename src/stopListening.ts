import type { Response } from 'integreat'
import type { Connection } from './types.js'

export default async function stopListening(
  connection: Connection | null,
): Promise<Response> {
  if (!connection) {
    return { status: 'badrequest', error: 'No connection' }
  }
  const { incoming, handlerCases } = connection
  if (!incoming) {
    return {
      status: 'noaction',
      warning: 'No incoming options found on connection',
    }
  }
  if (!handlerCases) {
    return {
      status: 'noaction',
      warning: 'No incoming handler cases found on connection',
    }
  }

  handlerCases.delete(incoming)
  return { status: 'ok' }
}
