// Load biến môi trường từ .env, kèm giá trị mặc định để dev nhanh
require('dotenv').config();

const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/smart_home',
  REDIS_URL: process.env.REDIS_URL || 'redis://:redispass@localhost:6379',

  MQTT_URL: process.env.MQTT_URL || 'mqtt://localhost:1883',
  MQTT_USER: process.env.MQTT_USER || 'smarthome',
  MQTT_PASS: process.env.MQTT_PASS || 'matkhau123',

  DEVICE_ID: process.env.DEVICE_ID || 'smarthome-phn-7f3a',
  API_KEY: process.env.API_KEY || 'sk-smarthome-7f3a9d2e',
  HMAC_SECRET: process.env.HMAC_SECRET || 'hmac-secret-phn-2b8c4e6f',

  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '15m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '7d',

  RP_ID: process.env.RP_ID || 'localhost',
  RP_NAME: process.env.RP_NAME || 'Smart Home Dashboard',
  RP_ORIGIN: process.env.RP_ORIGIN || 'http://localhost:5173',

  PASSWORD_PEPPER: process.env.PASSWORD_PEPPER || 'dev_pepper',
};

// Derive topics từ DEVICE_ID
env.TOPIC_TELEMETRY = `smarthome/${env.DEVICE_ID}/telemetry`;
env.TOPIC_EVENT = `smarthome/${env.DEVICE_ID}/event`;
env.TOPIC_STATUS = `smarthome/${env.DEVICE_ID}/status`;
env.TOPIC_CONTROL = `smarthome/${env.DEVICE_ID}/control`;

module.exports = env;
