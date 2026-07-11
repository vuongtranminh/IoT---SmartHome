#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Smart Home — orchestrator cho các bước demo
# ═══════════════════════════════════════════════════════════════
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
CMD="${1:-help}"

# ─── Colors ────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERR]${NC} $*"; }

case "$CMD" in

  # ─── SETUP ──────────────────────────────────────────────
  setup)
    info "1) Docker compose up (Mongo + Redis)…"
    (cd $ROOT/infrastructure && docker-compose up -d)
    info "2) Install backend deps…"
    (cd $ROOT/backend  && npm install --silent)
    info "3) Install frontend deps…"
    (cd $ROOT/frontend && npm install --silent)
    info "4) Copy .env.example → .env (nếu chưa có)…"
    [ ! -f $ROOT/backend/.env ] && cp $ROOT/backend/.env.example $ROOT/backend/.env
    info "5) Seed 2 tài khoản demo…"
    (cd $ROOT/backend && npm run seed)
    ok "Xong. Tiếp: mở 3 terminal chạy: ./demo.sh broker | backend | frontend"
    ;;

  # ─── INFRASTRUCTURE ─────────────────────────────────────
  infra-up)   (cd $ROOT/infrastructure && docker-compose up -d); ok "Mongo + Redis up" ;;
  infra-down) (cd $ROOT/infrastructure && docker-compose down);  ok "Mongo + Redis down" ;;
  infra-logs) (cd $ROOT/infrastructure && docker-compose logs -f) ;;

  # ─── SERVICES ───────────────────────────────────────────
  broker)   info "MQTT broker (Aedes) — port 1883"; (cd $ROOT/backend && npm run broker) ;;
  backend)  info "Backend Node.js — port 3000";     (cd $ROOT/backend && npm start) ;;
  frontend) info "Frontend Vite — port 5173";       (cd $ROOT/frontend && npm run dev) ;;

  # ─── FIRMWARE ───────────────────────────────────────────
  build-fw)
    info "Build firmware ESP32…"
    (cd $ROOT/firmware && ~/.platformio/penv/bin/pio run)
    ok "Firmware build xong"
    ;;

  # ─── ATTACKS ─────────────────────────────────────────────
  attack-nosig)
    info "🚨 Attack 1: publish telemetry KHÔNG có chữ ký HMAC"
    docker run --rm --network host efrecon/mqtt-client pub \
      -h localhost -p 1883 -u smarthome -P matkhau123 \
      -t "smarthome/smarthome-phn-7f3a/telemetry" \
      -m '{"api_key":"sk-smarthome-7f3a9d2e","device_id":"attacker","sensors":{"temperature":99}}'
    warn "Kiểm tra log backend: 'TỪ CHỐI telemetry: chữ ký HMAC sai hoặc thiếu'"
    ;;
  attack-badsig)
    info "🚨 Attack 2: publish với chữ ký sai (đúng format nhưng sai HMAC_SECRET)"
    docker run --rm --network host efrecon/mqtt-client pub \
      -h localhost -p 1883 -u smarthome -P matkhau123 \
      -t "smarthome/smarthome-phn-7f3a/telemetry" \
      -m '{"api_key":"sk-smarthome-7f3a9d2e","device_id":"attacker","sensors":{"temperature":99},"sig":"0000000000000000000000000000000000000000000000000000000000000000"}'
    warn "Kiểm tra log backend: HMAC không khớp → reject"
    ;;
  attack-control)
    info "🚨 Attack 3: giả mạo lệnh mở cửa (thiếu chữ ký)"
    docker run --rm --network host efrecon/mqtt-client pub \
      -h localhost -p 1883 -u smarthome -P matkhau123 \
      -t "smarthome/smarthome-phn-7f3a/control" \
      -m '{"api_key":"sk-smarthome-7f3a9d2e","device":"door","action":"open","ts":1}'
    warn "ESP32 raise 'security_alert: control message with invalid signature rejected'"
    ;;
  attack-replay)
    info "🚨 Attack 4: replay lệnh cũ (bắt được lệnh hợp lệ rồi phát lại)"
    warn "Chạy: bật quạt qua UI trước → dùng MQTT Explorer bắt payload đầy đủ →"
    warn "publish lại chính payload đó → ESP32 sẽ reject vì ts <= lastControlTs"
    warn "→ raise 'security_alert: control message replay rejected'"
    ;;
  attack-brute)
    info "🚨 Attack: bruteforce login (spam 20 request)"
    for i in $(seq 1 20); do
      curl -s -X POST -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"wrong"}' \
        http://localhost:3000/api/auth/login | jq -c
    done
    warn "Phải thấy status 429 sau 10 request (rate limit)"
    ;;

  # ─── RESET ─────────────────────────────────────────────
  reset-mongo)
    warn "Xóa toàn bộ Mongo data + seed lại"
    docker exec sh-mongo mongosh smart_home --quiet --eval 'db.dropDatabase()'
    (cd $ROOT/backend && npm run seed)
    ok "Reset xong"
    ;;
  reset-redis)
    warn "Xóa toàn bộ Redis"
    docker exec sh-redis redis-cli -a redispass flushdb
    ok "Redis clean"
    ;;

  # ─── HELP ──────────────────────────────────────────────
  help|*)
    cat <<EOF
Smart Home — demo.sh

SETUP:
  ./demo.sh setup             — cài deps + up infra + seed user
  ./demo.sh infra-up|down     — Mongo + Redis
  ./demo.sh infra-logs        — xem log Mongo + Redis

CHẠY (mở 3 terminal):
  ./demo.sh broker            — MQTT broker Aedes (port 1883)
  ./demo.sh backend           — Node.js API + Socket.IO (port 3000)
  ./demo.sh frontend          — React Vite (port 5173)

FIRMWARE:
  ./demo.sh build-fw          — pio run build firmware ESP32

DEMO ATTACK:
  ./demo.sh attack-nosig      — telemetry thiếu chữ ký HMAC → backend reject
  ./demo.sh attack-badsig     — chữ ký HMAC sai (giả mạo) → backend reject
  ./demo.sh attack-control    — giả mạo lệnh mở cửa thiếu sig → ESP32 security_alert
  ./demo.sh attack-replay     — replay lệnh cũ (ts) → ESP32 security_alert
  ./demo.sh attack-brute      — bruteforce login → rate limit 429

RESET:
  ./demo.sh reset-mongo       — xóa DB + seed lại user
  ./demo.sh reset-redis       — flush Redis cache
EOF
    ;;

esac
