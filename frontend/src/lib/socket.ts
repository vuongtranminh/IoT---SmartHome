import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../api/client';

let socket: Socket | null = null;

// Lazy singleton — gọi getSocket() sau khi đã có access token
export function getSocket() {
  if (!socket) {
    socket = io('/', {
      auth: { token: getAccessToken() },
      autoConnect: true,
    });
  }
  return socket;
}

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
