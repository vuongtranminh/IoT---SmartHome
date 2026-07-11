const mongoose = require('mongoose');

// DeviceState — snapshot mới nhất, 1 document / device_id.
// Bổ sung Redis cache — Mongo là bản dự phòng khi Redis cache empty (cold start)
const deviceStateSchema = new mongoose.Schema(
  {
    device_id: { type: String, unique: true, index: true },
    online: { type: Boolean, default: false },
    last_seen: Date,
    sensors: Object,
    devices: Object,
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('DeviceState', deviceStateSchema);
