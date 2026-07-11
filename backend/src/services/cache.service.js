const redis = require('../config/redis');

// Cache latest state cho UI đọc nhanh (1 request GET /api/latest → 1 Redis GET)
const LATEST_KEY = 'device:latest';
const ONLINE_KEY = 'device:online';
const LATEST_TTL = 300; // 5 phút

async function setLatest(state) {
  await redis.set(LATEST_KEY, JSON.stringify(state), 'EX', LATEST_TTL);
}

async function getLatest() {
  const raw = await redis.get(LATEST_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function setOnline(online) {
  await redis.set(ONLINE_KEY, online ? '1' : '0', 'EX', 60 * 60);
}

async function getOnline() {
  const raw = await redis.get(ONLINE_KEY);
  return raw === '1';
}

module.exports = { setLatest, getLatest, setOnline, getOnline };
