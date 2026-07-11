const { Server } = require('socket.io');
const env = require('./config/env');
const { verifyAccess } = require('./services/auth.service');

// Socket.IO server — broadcast telemetry/event realtime tới UI, xác thực JWT khi handshake
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.FRONTEND_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('missing token'));
      const payload = verifyAccess(token);
      socket.user = payload;
      next();
    } catch (e) {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected user=${socket.user.username}`);
    socket.on('disconnect', () => console.log(`[Socket] Disconnected user=${socket.user.username}`));
  });

  return io;
}

module.exports = { createSocketServer };
