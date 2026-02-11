type ManagedWebSocket = WebSocket & {
  __manualClose?: boolean
}

const sockets = new Map<string, ManagedWebSocket>()

export const registerWebSocket = (key: string, socket: WebSocket) => {
  sockets.set(key, socket as ManagedWebSocket)
}

export const unregisterWebSocket = (key: string) => {
  sockets.delete(key)
}

export const markWebSocketManualClose = (socket: WebSocket) => {
  const managed = socket as ManagedWebSocket
  managed.__manualClose = true
}

export const isManualClose = (socket: WebSocket) => {
  const managed = socket as ManagedWebSocket
  return Boolean(managed.__manualClose)
}

export const closeAllWebSockets = () => {
  sockets.forEach((socket) => {
    socket.__manualClose = true
    try {
      socket.close()
    } catch {
      // ignore close failures
    }
  })
  sockets.clear()
}
