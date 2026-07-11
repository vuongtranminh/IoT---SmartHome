// ═══════════════════════════════════════════════════════════════
// Backend entry point — HTTP server + Socket.IO + MQTT client
// ═══════════════════════════════════════════════════════════════
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { connectMongo } = require('./config/mongo');
require('./config/redis');   // triggers connect

const authRoute = require('./routes/auth');
const deviceRoute = require('./routes/device');
const adminRoute = require('./routes/admin');

const mqttSvc = require('./services/mqtt.service');
const { createSocketServer } = require('./socket');

async function main() {
  await connectMongo();

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true, deviceOnline: mqttSvc.isDeviceOnline() }));

  app.use('/api/auth',  authRoute);
  app.use('/api',       deviceRoute);
  app.use('/api/admin', adminRoute);

  app.use((err, _req, res, _next) => {
    console.error('[Express]', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  });

  const server = http.createServer(app);
  const io = createSocketServer(server);
  mqttSvc.setSocketIO(io);
  mqttSvc.connect();

  server.listen(env.PORT, () => {
    console.log(`[HTTP] Listening on http://localhost:${env.PORT}`);
    console.log(`[Device] ${env.DEVICE_ID} — expected api_key ${env.API_KEY.slice(0, 12)}…`);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
