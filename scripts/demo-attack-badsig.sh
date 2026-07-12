#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Demo Attack 2: Chữ ký giả (không biết HMAC_SECRET)
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

clear
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   🚨 ATTACK 2 — Chữ ký giả (sig ngẫu nhiên 64 hex zeros)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Kịch bản:${NC} Attacker biết format payload có field 'sig' 64 hex ký tự"
echo -e "         → thử tạo sig ngẫu nhiên 000000... hy vọng bypass verify"
echo ""
echo -e "${BOLD}Vì sao thất bại:${NC}"
echo -e "  • HMAC_SHA256(secret, payload) là hàm 1 chiều, 256-bit entropy"
echo -e "  • Attacker KHÔNG có HMAC_SECRET → không thể tính được sig đúng"
echo -e "  • Backend dùng crypto.timingSafeEqual() so sánh byte-by-byte → fail"
echo ""
echo -e "${BOLD}Payload gửi:${NC}"
echo -e "${YELLOW}{"
echo -e "  \"api_key\": \"sk-smarthome-7f3a9d2e\","
echo -e "  \"sensors\": {\"temperature\": 99},"
echo -e "  \"sig\": \"0000000000000000000000000000000000000000000000000000000000000000\""
echo -e "}${NC}"
echo ""
echo -e "${CYAN}─── Bước 1: Xóa audit entries cũ ───${NC}"
docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.deleteMany({action:"security.reject_telemetry"})' 2>&1
echo ""

echo -e "${CYAN}─── Bước 2: Publish attack với sig=00000... ───${NC}"
node "$ROOT/scripts/attack.js" badsig
echo ""

echo -e "${CYAN}─── Bước 3: Verify từ audit log ───${NC}"
sleep 2
COUNT=$(docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.countDocuments({action:"security.reject_telemetry"})' 2>&1 | tr -d '\r')
echo ""

if [ "$COUNT" -ge 1 ]; then
  echo -e "${GREEN}${BOLD}✅ THÀNH CÔNG — Backend reject vì HMAC compare fail:${NC}"
  echo ""
  docker exec sh-mongo mongosh smart_home --quiet --eval '
    db.auditlogs.find(
      {action: "security.reject_telemetry"},
      {_id: 0, at: 1, actor: 1, action: 1, detail: 1, ok: 1}
    ).sort({at: -1}).limit(3).forEach(printjson)
  '
  echo ""
  echo -e "${GREEN}${BOLD}🛡️  Không thể brute-force được sig:${NC}"
  echo -e "${GREEN}   • Entropy 256 bit = 2^256 khả năng${NC}"
  echo -e "${GREEN}   • Cho dù attacker gửi 1 triệu req/s cũng cần ~10^63 năm${NC}"
  echo -e "${GREEN}   • timingSafeEqual chống cả timing attack (đoán từng byte)${NC}"
else
  echo -e "${RED}${BOLD}❌ Không thấy audit entry${NC}"
fi
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
