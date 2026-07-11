const mongoose = require('mongoose');

// Event — ESP32 publish ngay khi có sự kiện: boot, fire_alarm, motion, door, window,
// control_applied, control_rejected, security_alert
const eventSchema = new mongoose.Schema(
  {
    device_id: { type: String, index: true },
    event: { type: String, index: true },
    detail: String,
    device_timestamp: Number,
    received_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// TTL 90 ngày
eventSchema.index({ received_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('Event', eventSchema);
