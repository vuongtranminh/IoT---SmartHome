// ═══════════════════════════════════════════════════════════════
// MQTT service — subscribe telemetry/event/status từ ESP32,
// publish control xuống ESP32. Kèm verify HMAC-SHA256 + api_key
// và chống replay theo spec hust-iot v2.
// ═══════════════════════════════════════════════════════════════
const mqtt = require('mqtt');
const env = require('../config/env');
const Telemetry = require('../models/Telemetry');
const Event = require('../models/Event');
const DeviceState = require('../models/DeviceState');
const cache = require('./cache.service');
const { logAudit } = require('./audit.service');
const { signPayload, verifyAndParse } = require('./hmac.util');

let client = null;
let io = null;              // Socket.IO server, inject qua setSocketIO
let deviceOnline = false;
let lastTelemetryAt = 0;    // ms epoch — dùng để timeout offline

// Stats — in mỗi 30s để debug
const stats = { telemetry: 0, event: 0, rejectSig: 0, rejectApiKey: 0, lastPrint: 0 };

const OFFLINE_TIMEOUT_MS = 20000;   // > 20s không nhận telemetry → coi offline (4x interval 5s)

// setter: gắn Socket.IO để broadcast realtime tới UI
function setSocketIO(socketServer) {
  io = socketServer;
}

function connect() {
  client = mqtt.connect(env.MQTT_URL, {
    clientId: `backend-${env.DEVICE_ID}-${Math.random().toString(16).slice(2, 8)}`,
    username: env.MQTT_USER,
    password: env.MQTT_PASS,
    reconnectPeriod: 3000,
  });

  client.on('connect', async () => {
    console.log(`[MQTT] Connected: ${env.MQTT_URL}`);
    // Reset trạng thái ban đầu — không tin retained status cũ.
    // Chỉ set online khi thực sự nhận được telemetry (freshness check).
    deviceOnline = false;
    lastTelemetryAt = 0;
    await cache.setOnline(false);

    client.subscribe([env.TOPIC_TELEMETRY, env.TOPIC_EVENT, env.TOPIC_STATUS], (err) => {
      if (err) console.error('[MQTT] Subscribe fail:', err.message);
      else console.log(`[MQTT] Subscribed telemetry / event / status`);
    });
  });

  // Timeout check: > 20s không có telemetry mới → mark offline
  setInterval(async () => {
    if (deviceOnline && Date.now() - lastTelemetryAt > OFFLINE_TIMEOUT_MS) {
      console.log(`[MQTT] Timeout ${Math.floor((Date.now() - lastTelemetryAt)/1000)}s không nhận telemetry → OFFLINE`);
      deviceOnline = false;
      await cache.setOnline(false);
      if (io) io.emit('device:status', { online: false });
    }
  }, 3000);

  // Print stats mỗi 30s (dễ debug khi ESP32 hay online/offline)
  setInterval(() => {
    const gap = lastTelemetryAt ? Math.floor((Date.now() - lastTelemetryAt) / 1000) + 's' : 'never';
    console.log(`[Stats] telemetry=${stats.telemetry} event=${stats.event} rejectSig=${stats.rejectSig} rejectKey=${stats.rejectApiKey} online=${deviceOnline} lastTel=${gap}`);
  }, 30000);

  client.on('error', (err) => console.error('[MQTT] Error:', err.message));

  client.on('message', async (topic, payload) => {
    try {
      if (topic === env.TOPIC_STATUS) await handleStatus(payload);
      else if (topic === env.TOPIC_EVENT)  await handleEvent(payload);
      else if (topic === env.TOPIC_TELEMETRY) await handleTelemetry(payload);
    } catch (e) {
      console.error(`[MQTT] Handler error on ${topic}:`, e.message);
    }
  });
}

// ─── Handlers ───────────────────────────────────────────────

// Status: chuỗi thô "online"/"offline" (retained + LWT).
// Nhận "offline" (LWT) → tin ngay. Nhận "online" (retained) → chờ telemetry để confirm
// (retained có thể là stale từ session ESP32 cũ).
async function handleStatus(payload) {
  const s = payload.toString();
  if (s === 'offline') {
    console.log('[MQTT] Device OFFLINE (LWT / status offline)');
    deviceOnline = false;
    lastTelemetryAt = 0;
    await cache.setOnline(false);
    await DeviceState.updateOne(
      { device_id: env.DEVICE_ID },
      { $set: { online: false, last_seen: new Date(), updated_at: new Date() } },
      { upsert: true }
    );
    if (io) io.emit('device:status', { online: false });
  } else if (s === 'online') {
    console.log('[MQTT] Status message: "online" (chờ telemetry confirm)');
    // KHÔNG set online = true ở đây — chỉ set khi handleTelemetry nhận được payload hợp lệ
  } else {
    console.log(`[MQTT] Status message ignored: "${s}"`);
  }
}

// Event: JSON kèm api_key + sig (HMAC)
async function handleEvent(payload) {
  const raw = payload.toString();

  // BẢO MẬT 1: verify chữ ký HMAC-SHA256
  const ev = verifyAndParse(raw);
  if (!ev) {
    stats.rejectSig++;
    console.warn('[MQTT] TỪ CHỐI event: chữ ký HMAC sai hoặc thiếu');
    await logAudit({
      actor: 'device:unknown', action: 'security.reject_event',
      detail: { reason: 'invalid HMAC signature' }, ok: false,
    });
    return;
  }
  stats.event++;

  // BẢO MẬT 2: verify api_key (defense in depth)
  if (ev.api_key !== env.API_KEY) {
    stats.rejectApiKey++;
    console.warn(`[MQTT] TỪ CHỐI event: api_key sai (event=${ev.event})`);
    await logAudit({
      actor: 'device:unknown', action: 'security.reject_event',
      detail: { event: ev.event, reason: 'invalid api_key' }, ok: false,
    });
    return;
  }
  delete ev.api_key;

  const doc = await Event.create({
    device_id: ev.device_id,
    event: ev.event,
    detail: ev.detail,
    device_timestamp: ev.timestamp,
  });

  const icons = {
    fire_alarm: '🔥', motion: '🚶', door: '🚪', window: '🪟',
    control_applied: '✅', control_rejected: '⛔', security_alert: '🚨', boot: '🔌',
  };
  console.log(`[Event] ${icons[ev.event] || '•'} ${ev.event}${ev.detail ? ': ' + ev.detail : ''}`);

  if (ev.event === 'security_alert') {
    await logAudit({
      actor: `device:${ev.device_id}`,
      action: 'security.alert',
      detail: { detail: ev.detail },
      ok: false,
    });
  }

  if (io) io.emit('device:event', { ...doc.toObject(), event: ev.event, detail: ev.detail });
}

// Telemetry: JSON kèm api_key + sensors + devices + sig (HMAC)
async function handleTelemetry(payload) {
  const raw = payload.toString();

  // BẢO MẬT 1: verify chữ ký HMAC-SHA256
  const data = verifyAndParse(raw);
  if (!data) {
    stats.rejectSig++;
    console.warn('[MQTT] TỪ CHỐI telemetry: chữ ký HMAC sai hoặc thiếu');
    await logAudit({
      actor: 'device:unknown', action: 'security.reject_telemetry',
      detail: { reason: 'invalid HMAC signature' }, ok: false,
    });
    return;
  }

  // BẢO MẬT 2: verify api_key
  if (data.api_key !== env.API_KEY) {
    stats.rejectApiKey++;
    console.warn('[MQTT] TỪ CHỐI telemetry: api_key sai');
    await logAudit({
      actor: 'device:unknown', action: 'security.reject_telemetry',
      detail: { reason: 'invalid api_key' }, ok: false,
    });
    return;
  }
  delete data.api_key;

  const record = {
    timestamp: new Date(),
    device_id: data.device_id,
    device_timestamp: data.timestamp,
    sensors: data.sensors,
    devices: data.devices,
  };

  stats.telemetry++;

  // BƯỚC 1: cập nhật liveness NGAY (verify sig + api_key OK → ESP32 chắc chắn sống).
  // Đừng để DB error dưới đây làm flag online flap. Cache + emit socket trước.
  lastTelemetryAt = Date.now();
  const wasOffline = !deviceOnline;
  deviceOnline = true;
  await cache.setOnline(true);
  await cache.setLatest(record);
  if (io) {
    if (wasOffline) io.emit('device:status', { online: true });
    io.emit('device:telemetry', record);
  }
  if (data.devices?.fire_alarm) console.log('🔥 CẢNH BÁO CHÁY từ', data.device_id);

  // BƯỚC 2: persist Mongo — cô lập lỗi, chỉ log không throw ra ngoài
  try {
    await Telemetry.create(record);
    await DeviceState.updateOne(
      { device_id: data.device_id },
      { $set: { sensors: data.sensors, devices: data.devices, online: true, last_seen: new Date(), updated_at: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.error('[MQTT] Mongo save fail (skip):', e.message);
  }
}

// ─── Publisher: gửi control xuống ESP32 ─────────────────────
// Kèm api_key (verify tầng message) + ts (chống replay) + sig (HMAC).
// ESP32 sẽ verify cả 3 trước khi thực thi lệnh.
function publishControl({ device, action, value }) {
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) return reject(new Error('MQTT client not connected'));
    const command = {
      api_key: env.API_KEY,
      device, action, value,
      ts: Date.now(),  // millis epoch — ESP32 track lastControlTs, ts <= lastTs → reject replay
    };
    const signed = signPayload(command);
    client.publish(env.TOPIC_CONTROL, signed, { qos: 0 }, (err) => {
      if (err) return reject(err);
      console.log(`[Control] ${device} -> ${action}`, value ?? '', `ts=${command.ts}`);
      resolve();
    });
  });
}

function isDeviceOnline() {
  return deviceOnline;
}

module.exports = { connect, publishControl, isDeviceOnline, setSocketIO };
