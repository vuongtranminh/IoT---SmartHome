const AuditLog = require('../models/AuditLog');

// Ghi audit log — không throw, log lỗi nếu save fail
async function logAudit({ actor, action, target = '', detail = {}, ip, userAgent, ok = true }) {
  try {
    await AuditLog.create({ actor, action, target, detail, ip, userAgent, ok });
  } catch (e) {
    console.error('[Audit] Save fail:', e.message);
  }
}

module.exports = { logAudit };
