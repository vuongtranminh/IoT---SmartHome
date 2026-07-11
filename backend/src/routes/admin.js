const express = require('express');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middlewares/jwt');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

// GET /api/admin/audit?limit=100&action=device.control
router.get('/audit', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.actor)  filter.actor = req.query.actor;
  if (req.query.ok !== undefined) filter.ok = req.query.ok === 'true';
  const rows = await AuditLog.find(filter).sort({ at: -1 }).limit(limit).lean();
  res.json(rows);
});

module.exports = router;
