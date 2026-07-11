const mongoose = require('mongoose');

// AuditLog — mọi action nhạy cảm (login, đổi trạng thái thiết bị, security alert) đều ghi lại
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actor: String,               // "user:<username>" | "device:<id>" | "system"
    action: String,               // "device.control" | "user.login" | "security.reject" | ...
    target: String,
    detail: Object,
    ip: String,
    userAgent: String,
    ok: Boolean,
  },
  { versionKey: false }
);

// TTL 180 ngày
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
