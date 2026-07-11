// ═══════════════════════════════════════════════════════════════
// HMAC-SHA256 sign + verify — khớp spec hust-iot MQTT_SPEC.md §2
//
// Quy ước: field "sig" luôn đứng CUỐI JSON. Chữ ký tính trên
// chuỗi JSON gốc SAU KHI bỏ đoạn `,"sig":"..."` (thao tác trên
// byte thô — không parse rồi re-serialize, tránh khác biệt thứ tự
// key / format số giữa Node và ESP32/Arduino).
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');
const env = require('../config/env');

function hmac(str) {
  return crypto.createHmac('sha256', env.HMAC_SECRET).update(str).digest('hex');
}

// Ký: object → chuỗi JSON đã chèn sig cuối cùng
function signPayload(obj) {
  const base = JSON.stringify(obj);
  return base.slice(0, -1) + `,"sig":"${hmac(base)}"}`;
}

// Verify: chuỗi thô → object nếu chữ ký hợp lệ, null nếu không
function verifyAndParse(raw) {
  const idx = raw.lastIndexOf(',"sig":"');
  if (idx < 0 || !raw.endsWith('"}')) return null;

  const sig = raw.slice(idx + 8, -2);
  const base = raw.slice(0, idx) + '}';
  const expected = hmac(base);

  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(base);
  } catch {
    return null;
  }
}

module.exports = { hmac, signPayload, verifyAndParse };
