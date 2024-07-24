import type { ConnectionIncomingOptions, PortHandlers } from '../types.js'

export default function getHandlersForIncoming(
  portHandlers: PortHandlers,
  incoming?: ConnectionIncomingOptions,
) {
  const port = incoming?.port
  if (typeof port === 'number') {
    return portHandlers.get(port)
  }
  return undefined
}
