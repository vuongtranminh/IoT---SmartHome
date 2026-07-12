#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Auto-run security tests: attacks → capture backend log + Mongo audit → PNG
# ═══════════════════════════════════════════════════════════════
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG_DIR="$ROOT/images"
LOG_DIR="$ROOT/.security-logs"
mkdir -p "$IMG_DIR" "$LOG_DIR"

BROKER_LOG="$LOG_DIR/broker.log"
BACKEND_LOG="$LOG_DIR/backend.log"

echo "🔪 Kill process cũ trên port 1883 + 3000 (nếu có)"
lsof -ti:1883,3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 1

# Force Node line-buffered stdout (macOS: unbuffer/stdbuf không có sẵn — dùng script -q)
echo "🚀 Start broker (log: $BROKER_LOG)"
# Preload sync-stdout để log flush ngay khi console.log (không đợi buffer 8KB)
(cd "$ROOT/backend" && node --require ./src/preload-sync-stdout.js broker.js) > "$BROKER_LOG" 2>&1 &
BROKER_PID=$!
sleep 2

echo "🚀 Start backend (log: $BACKEND_LOG)"
(cd "$ROOT/backend" && node --require ./src/preload-sync-stdout.js src/index.js) > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
sleep 4   # đợi backend kết nối Mongo + Redis + MQTT

cleanup() {
  kill $BACKEND_PID 2>/dev/null || true
  kill $BROKER_PID 2>/dev/null || true
  sleep 0.5
  lsof -ti:1883,3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
}
trap cleanup EXIT

# Clear old audit entries để capture chuẩn
docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.deleteMany({action: {$regex: "security"}})' > /dev/null 2>&1 || true

# Ghi nhớ vị trí log
LOG_START_LINE=$(wc -l < "$BACKEND_LOG" 2>/dev/null || echo 0)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Chạy 4 kịch bản attack"
echo "═══════════════════════════════════════════════════════════"

ATTACK1_OUT=$(node "$ROOT/scripts/attack.js" nosig 2>&1); sleep 1
ATTACK2_OUT=$(node "$ROOT/scripts/attack.js" badsig 2>&1); sleep 1
ATTACK3_OUT=$(node "$ROOT/scripts/attack.js" control 2>&1); sleep 1

# Brute force login
ATTACK4_OUT=""
for i in $(seq 1 15); do
  RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrong"}' \
    http://localhost:3000/api/auth/login)
  ATTACK4_OUT+="Request #$(printf '%2d' $i) → HTTP $RESULT"$'\n'
done
sleep 3   # đợi backend flush log + Mongo persist

# Lấy log backend (mọi dòng sau start)
BACKEND_LOG_SLICE=$(tail -n +$((LOG_START_LINE+1)) "$BACKEND_LOG" 2>/dev/null | grep -Ev "^$|\r$" | head -60 || echo "(log empty)")

# Đọc audit log từ Mongo — source of truth
AUDIT_JSON=$(docker exec sh-mongo mongosh smart_home --quiet --json=canonical --eval '
  db.auditlogs.find(
    { action: {$regex: "security|user.login"} },
    { _id: 0, at: 1, actor: 1, action: 1, detail: 1, ip: 1, ok: 1 }
  ).sort({at: -1}).limit(30).toArray()
' 2>/dev/null || echo "[]")

# ─── Render HTML → PNG ───────────────────────────────────────
HTML_FILE="$LOG_DIR/report.html"
node "$ROOT/scripts/render-security-report.js" \
  "$HTML_FILE" \
  "$ATTACK1_OUT" \
  "$ATTACK2_OUT" \
  "$ATTACK3_OUT" \
  "$ATTACK4_OUT" \
  "$BACKEND_LOG_SLICE" \
  "$AUDIT_JSON"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --no-sandbox \
  --screenshot="$IMG_DIR/security-tests-result.png" \
  --window-size=1800,2400 \
  "file://$HTML_FILE" 2>&1 | tail -1

echo ""
echo "✅ Xong. Ảnh: $IMG_DIR/security-tests-result.png"
