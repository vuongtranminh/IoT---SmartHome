const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

// Rate limit REST API: 60 req/min/IP cho endpoint device control
function makeLimiter({ windowMs, max, prefix }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${prefix}:`,
    }),
    message: { error: 'too many requests, slow down' },
  });
}

module.exports = {
  loginLimiter:   makeLimiter({ windowMs: 60_000, max: 10, prefix: 'login' }),   // 10/min/IP
  controlLimiter: makeLimiter({ windowMs: 60_000, max: 60, prefix: 'control' }), // 60/min/IP
};
