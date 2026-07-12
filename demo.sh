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

  # ─── ATTACKS (đơn giản, chỉ publish) ─────────────────────
  attack-nosig)   node $ROOT/scripts/attack.js nosig ;;
  attack-badsig)  node $ROOT/scripts/attack.js badsig ;;
  attack-control) node $ROOT/scripts/attack.js control ;;

  # ─── DEMO SECURITY (đầy đủ header + verify audit + verdict) ─────
  demo-nosig)     bash $ROOT/scripts/demo-attack-nosig.sh ;;
  demo-badsig)    bash $ROOT/scripts/demo-attack-badsig.sh ;;
  demo-control)   bash $ROOT/scripts/demo-attack-control.sh ;;
  demo-brute)     bash $ROOT/scripts/demo-attack-brute.sh ;;
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

DEMO ATTACK (chỉ publish payload, không verify):
  ./demo.sh attack-nosig      — telemetry thiếu chữ ký HMAC
  ./demo.sh attack-badsig     — chữ ký HMAC sai (giả mạo)
  ./demo.sh attack-control    — giả mạo lệnh mở cửa thiếu sig

DEMO SECURITY (đầy đủ: publish → wait → verify Mongo/Redis → verdict — CHỤP ẢNH):
  ./demo.sh demo-nosig        — Attack 1 + verify audit log
  ./demo.sh demo-badsig       — Attack 2 + verify audit log
  ./demo.sh demo-control      — Attack 3 + verify event từ ESP32
  ./demo.sh demo-brute        — Attack 4 spam login + verify Redis counter + audit

RESET:
  ./demo.sh reset-mongo       — xóa DB + seed lại user
  ./demo.sh reset-redis       — flush Redis cache
EOF
    ;;

esac
