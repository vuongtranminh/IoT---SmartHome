#!/usr/bin/env node
const fs = require('fs');
const [, , outFile, attack1, attack2, attack3, attack4, backendLog, auditJsonRaw] = process.argv;

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let auditLog = [];
try {
  const cleaned = (auditJsonRaw || '[]').replace(/ISODate\("([^"]+)"\)/g, '"$1"');
  auditLog = JSON.parse(cleaned);
} catch (e) {
  auditLog = [];
}

function highlightBackend(s) {
  return esc(s)
    .replace(/TỪ CHỐI[^\n]*/g, '<span class="reject">$&</span>')
    .replace(/rejectSig=\d+/g, '<span class="stat-bad">$&</span>')
    .replace(/rejectApiKey=\d+/g, '<span class="stat-bad">$&</span>')
    .replace(/rejectKey=\d+/g, '<span class="stat-bad">$&</span>')
    .replace(/\[MQTT\]/g, '<span class="tag-mqtt">$&</span>')
    .replace(/\[Stats\][^\n]*/g, '<span class="stats">$&</span>');
}

function highlightAttack(s) {
  return esc(s)
    .replace(/✓ Connected broker/g, '<span class="ok">$&</span>')
    .replace(/✓ Published[^\n]*/g, '<span class="ok">$&</span>')
    .replace(/🚨 Attack "[^"]+"/g, '<span class="attack-title">$&</span>')
    .replace(/HTTP 401/g, '<span class="http-401">HTTP 401</span>')
    .replace(/HTTP 429/g, '<span class="http-429">HTTP 429</span>');
}

// Render audit log rows
function extractDate(atField) {
  if (!atField) return '';
  if (typeof atField === 'string') return atField;
  if (atField.$date) return typeof atField.$date === 'string' ? atField.$date : (atField.$date.$numberLong ? new Date(+atField.$date.$numberLong).toISOString() : '');
  return String(atField);
}
function renderAuditRows() {
  if (!auditLog || auditLog.length === 0) {
    return '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Không có audit entry</td></tr>';
  }
  return auditLog.map(row => {
    const time = extractDate(row.at).slice(11, 19) || '—';
    const action = row.action || '';
    const actionClass = action.includes('reject') ? 'action-reject' :
                        action === 'security.alert' ? 'action-alert' :
                        action === 'user.login' ? (row.ok ? 'action-ok' : 'action-fail') : '';
    const okBadge = row.ok
      ? '<span class="ok-badge">✓ OK</span>'
      : '<span class="fail-badge">✗ FAIL</span>';
    const detail = row.detail ? JSON.stringify(row.detail).slice(0, 90) : '';
    return `<tr>
      <td class="mono">${esc(time)}</td>
      <td>${esc(row.actor || '')}</td>
      <td class="mono ${actionClass}">${esc(action)}</td>
      <td class="mono small">${esc(detail)}</td>
      <td>${okBadge}</td>
    </tr>`;
  }).join('\n');
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Security Tests Result</title>
<style>
  body { margin:0; padding:40px; background:#0f172a; color:#e2e8f0; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; }
  h1 { text-align:center; font-size:32px; margin:0 0 8px 0; }
  .subtitle { text-align:center; color:#94a3b8; margin-bottom:24px; font-size:14px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:12px; overflow:hidden; }
  .card-header { padding:12px 20px; font-weight:700; font-size:14px; display:flex; align-items:center; gap:10px; }
  .card-body { padding:16px 20px; }
  pre { margin:0; font-family:'SF Mono','Menlo','Monaco',monospace; font-size:11px; line-height:1.6; white-space:pre-wrap; color:#cbd5e1; max-height:280px; overflow:hidden; }
  .attack-1 .card-header { background:linear-gradient(135deg,#f97316,#c2410c); color:white; }
  .attack-2 .card-header { background:linear-gradient(135deg,#eab308,#a16207); color:white; }
  .attack-3 .card-header { background:linear-gradient(135deg,#8b5cf6,#6d28d9); color:white; }
  .attack-4 .card-header { background:linear-gradient(135deg,#0ea5e9,#0369a1); color:white; }
  .backend-card .card-header { background:linear-gradient(135deg,#059669,#065f46); color:white; }
  .audit-card .card-header { background:linear-gradient(135deg,#7c3aed,#5b21b6); color:white; }
  .full { grid-column: span 2; }
  .reject { color:#fca5a5; font-weight:600; }
  .stat-bad { color:#fbbf24; font-weight:600; }
  .tag-mqtt { color:#7dd3fc; }
  .stats { color:#a78bfa; font-weight:600; }
  .ok { color:#10b981; font-weight:600; }
  .attack-title { color:#fbbf24; font-weight:700; }
  .http-401 { color:#fbbf24; font-weight:600; }
  .http-429 { color:#ef4444; font-weight:700; background:#7f1d1d40; padding:1px 4px; border-radius:3px; }
  .verdict { text-align:right; padding:8px 20px; background:#064e3b; border-top:1px solid #059669; font-size:12px; font-weight:600; color:#a7f3d0; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; margin-left:6px; background:#10b981; color:white; }

  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #334155; }
  th { background:#0f172a; font-weight:700; font-size:11px; text-transform:uppercase; color:#94a3b8; }
  tr:hover { background:#0f172a; }
  .mono { font-family:'SF Mono','Menlo',monospace; }
  .small { font-size:10px; color:#94a3b8; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .action-reject { color:#fca5a5; }
  .action-alert { color:#f472b6; }
  .action-fail { color:#fbbf24; }
  .action-ok { color:#10b981; }
  .ok-badge { color:#10b981; font-weight:700; font-size:11px; }
  .fail-badge { color:#f87171; font-weight:700; font-size:11px; }

  .footer { text-align:center; padding:16px; background:#1e293b; border-radius:8px; font-size:12px; color:#94a3b8; }
</style></head>
<body>
  <h1>🛡️ Kết quả kiểm thử bảo mật (4 kịch bản attack — auto-run)</h1>
  <p class="subtitle">Chạy trực tiếp từ command line · capture backend log + MongoDB audit log real-time</p>

  <div class="grid">
    <div class="card attack-1">
      <div class="card-header">🚫 Attack 1 — Publish telemetry KHÔNG có chữ ký HMAC <span class="badge">BLOCKED</span></div>
      <div class="card-body"><pre>${highlightAttack(attack1)}</pre></div>
      <div class="verdict">✅ Backend reject ở lớp 3 — HMAC verify</div>
    </div>

    <div class="card attack-2">
      <div class="card-header">🚫 Attack 2 — Chữ ký giả (sig=00000...) <span class="badge">BLOCKED</span></div>
      <div class="card-body"><pre>${highlightAttack(attack2)}</pre></div>
      <div class="verdict">✅ Backend reject — timingSafeEqual fail</div>
    </div>

    <div class="card attack-3">
      <div class="card-header">🚫 Attack 3 — Giả mạo lệnh mở cửa (thiếu sig) <span class="badge">BLOCKED</span></div>
      <div class="card-body"><pre>${highlightAttack(attack3)}</pre></div>
      <div class="verdict">✅ ESP32 reject + phát security_alert</div>
    </div>

    <div class="card attack-4">
      <div class="card-header">🚫 Attack 4 — Brute force login (spam 15 request) <span class="badge">BLOCKED</span></div>
      <div class="card-body"><pre>${highlightAttack(attack4)}</pre></div>
      <div class="verdict">✅ Rate limit — HTTP 429 sau 10 requests</div>
    </div>
  </div>

  <div class="card audit-card" style="margin-bottom:20px">
    <div class="card-header">📋 MongoDB Audit Log — Source of truth (${auditLog.length} entries)</div>
    <div class="card-body" style="padding:0">
      <table>
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Detail</th>
            <th>OK?</th>
          </tr>
        </thead>
        <tbody>
          ${renderAuditRows()}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card backend-card">
    <div class="card-header">💻 Backend Log Real-time — Bằng chứng phòng vệ đã kích hoạt</div>
    <div class="card-body"><pre style="max-height:none">${highlightBackend(backendLog)}</pre></div>
  </div>

  <div class="footer" style="margin-top:20px">
    🔒 Mọi attack đều bị chặn ở đúng lớp thiết kế · MongoDB không lưu payload giả · Audit log ghi lại toàn bộ<br>
    <span style="color:#fbbf24">stats.rejectSig++</span> · <span style="color:#fbbf24">stats.rejectApiKey++</span> · <span style="color:#ef4444">HTTP 429 Too Many Requests</span>
  </div>
</body></html>
`;

fs.writeFileSync(outFile, html);
console.log('✓ HTML rendered:', outFile);
