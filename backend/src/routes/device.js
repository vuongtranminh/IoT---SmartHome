// ═══════════════════════════════════════════════════════════════
// Device routes — giữ contract giống hust-iot/backend/server.js,
// nhưng thay lưu RAM bằng MongoDB + Redis cache.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const env = require('../config/env');
const Telemetry = require('../models/Telemetry');
const Event = require('../models/Event');
const DeviceState = require('../models/DeviceState');
const cache = require('../services/cache.service');
const mqttSvc = require('../services/mqtt.service');
const { logAudit } = require('../services/audit.service');
const { requireAuth } = require('../middlewares/jwt');
const { controlLimiter } = require('../middlewares/ratelimit');

const router = express.Router();

// Tất cả endpoint đều yêu cầu JWT (lớp bảo vệ ngoài — không dính api_key IoT layer)
router.use(requireAuth);

// GET /api/latest — snapshot mới nhất (đọc Redis trước, fallback Mongo)
router.get('/latest', async (_req, res) => {
  const cached = await cache.getLatest();
  if (cached) return res.json(cached);
  const st = await DeviceState.findOne({ device_id: env.DEVICE_ID }).lean();
  res.json(st || {});
});

// GET /api/history?limit=100 — history telemetry
router.get('/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
  const rows = await Telemetry.find().sort({ timestamp: -1 }).limit(limit).lean();
  res.json(rows.reverse());   // trả theo thứ tự tăng dần cho tiện vẽ chart
});

// GET /api/devices/status — { online, ...latest }
router.get('/devices/status', async (_req, res) => {
  const online = await cache.getOnline();
  const latest = await cache.getLatest();
  res.json({ online, ...(latest || {}) });
});

// GET /api/events?type=fire_alarm&limit=50
router.get('/events', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
  const filter = req.query.type ? { event: req.query.type } : {};
  const rows = await Event.find(filter).sort({ received_at: -1 }).limit(limit).lean();
  res.json(rows);
});

// GET /api/alerts — trạng thái báo động
router.get('/alerts', async (_req, res) => {
  const online = await cache.getOnline();
  const latest = await cache.getLatest();
  const lastSecurity = await Event.findOne({ event: 'security_alert' }).sort({ received_at: -1 }).lean();
  res.json({
    online,
    fire_alarm: !!latest?.devices?.fire_alarm,
    gas_level: latest?.sensors?.gas ?? null,
    last_security_alert: lastSecurity || null,
  });
});

// POST /api/devices/:device — publish control command
// device: fan | ac | light_living | light_bedroom | door | window | alarm
router.post('/devices/:device', controlLimiter, async (req, res) => {
  const device = req.params.device;
  const { action, value } = req.body || {};
  const online = await cache.getOnline();

  if (!online) {
    await logAudit({
      actor: `user:${req.user.username}`, action: 'device.control',
      target: device, detail: { action, value, reason: 'device offline' },
      ip: req.ip, ok: false,
    });
    return res.status(503).json({ error: 'ESP32 offline' });
  }

  try {
    await mqttSvc.publishControl({ device, action, value });
    await logAudit({
      actor: `user:${req.user.username}`, action: 'device.control',
      target: device, detail: { action, value }, ip: req.ip, ok: true,
    });
    res.json({ ok: true, sent: { device, action, value } });
  } catch (e) {
    await logAudit({
      actor: `user:${req.user.username}`, action: 'device.control',
      target: device, detail: { action, value, error: e.message },
      ip: req.ip, ok: false,
    });
    res.status(502).json({ error: 'MQTT publish failed', detail: e.message });
  }
});

module.exports = router;
