const mongoose = require('mongoose');

// Telemetry — 1 record mỗi lần ESP32 publish (5s/lần + sau mỗi lệnh control)
// Time-series collection: MongoDB tự tối ưu insert theo timestamp, TTL 30 ngày
const telemetrySchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    device_id: { type: String, index: true },
    device_timestamp: { type: Number },  // millis() từ ESP32 (uptime)

    sensors: {
      temperature: Number,
      humidity: Number,
      gas: Number,
      light: Number,
      motion: Boolean,
    },

    devices: {
      ac: Boolean,
      ac_temp: Number,
      ac_auto: Boolean,
      fan_speed: Number,        // 0..3
      fan_auto: Boolean,
      light_living: Boolean,
      light_living_auto: Boolean,
      light_bedroom: Boolean,
      door: String,              // "open" | "closed" (theo spec hust-iot)
      window: String,             // "open" | "closed"
      fire_alarm: Boolean,
      alarm_manual: Boolean,
    },
  },
  { versionKey: false }
);

// TTL 30 ngày
telemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('Telemetry', telemetrySchema);
