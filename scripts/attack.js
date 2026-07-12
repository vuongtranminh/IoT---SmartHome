#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Attack simulator — chạy trực tiếp bằng Node (không cần Docker)
//
//   node scripts/attack.js nosig       — telemetry không có sig
//   node scripts/attack.js badsig      — telemetry sig=00...
//   node scripts/attack.js control     — control giả (thiếu sig)
// ═══════════════════════════════════════════════════════════════
const mqtt = require('../backend/node_modules/mqtt');

const HOST = 'mqtt://localhost:1883';
const USER = 'smarthome';
const PASS = 'matkhau123';
const API_KEY = 'sk-smarthome-7f3a9d2e';
const DEVICE_ID = 'smarthome-phn-7f3a';

const T_TELEMETRY = `smarthome/${DEVICE_ID}/telemetry`;
const T_CONTROL = `smarthome/${DEVICE_ID}/control`;

const kind = process.argv[2] || 'help';

const attacks = {
  nosig: {
    topic: T_TELEMETRY,
    payload: JSON.stringify({
      api_key: API_KEY, device_id: 'attacker',
      sensors: { temperature: 99, humidity: 0, gas: 4000, light: 0, motion: false },
    }),
    expect: 'Backend: [MQTT] TỪ CHỐI telemetry: chữ ký HMAC sai hoặc thiếu',
  },
  badsig: {
    topic: T_TELEMETRY,
    payload: JSON.stringify({
      api_key: API_KEY, device_id: 'attacker',
      sensors: { temperature: 99 },
      sig: '0000000000000000000000000000000000000000000000000000000000000000',
    }),
    expect: 'Backend: HMAC compare fail → reject',
  },
  control: {
    topic: T_CONTROL,
    payload: JSON.stringify({
      api_key: API_KEY, device: 'door', action: 'open', ts: 1,
    }),
    expect: 'ESP32 Serial: TU CHOI: chu ky HMAC sai + [Event] security_alert',
  },
};

if (!attacks[kind]) {
  console.log('Usage: node scripts/attack.js <nosig|badsig|control>');
  process.exit(1);
}

const { topic, payload, expect } = attacks[kind];
console.log(`\n🚨 Attack "${kind}"`);
console.log(`   Broker: ${HOST}`);
console.log(`   Topic:  ${topic}`);
console.log(`   Payload: ${payload.slice(0, 120)}${payload.length > 120 ? '...' : ''}`);
console.log(`   Expect: ${expect}\n`);

const client = mqtt.connect(HOST, { username: USER, password: PASS, connectTimeout: 5000 });

client.on('connect', () => {
  console.log('✓ Connected broker');
  // QoS 1 = broker phải ack trước khi ta disconnect (tránh mất message)
  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error('✗ Publish fail:', err.message);
      process.exit(1);
    }
    console.log('✓ Published (broker acked) — xem log backend/ESP32 để verify reject');
    // Đợi 500ms để broker forward đến subscriber trước khi close
    setTimeout(() => { client.end(); process.exit(0); }, 500);
  });
});

client.on('error', (err) => {
  console.error('✗ MQTT error:', err.message);
  process.exit(1);
});

setTimeout(() => { console.error('✗ Timeout'); process.exit(1); }, 8000);
