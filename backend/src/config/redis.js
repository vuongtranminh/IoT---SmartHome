const Redis = require('ioredis');
const env = require('./env');

// 1 client dùng chung cho cache + rate limit
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('connect', () => console.log(`[Redis] Connected: ${env.REDIS_URL.replace(/:[^:@]+@/, ':***@')}`));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

module.exports = redis;
