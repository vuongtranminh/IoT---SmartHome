#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Demo Attack 1: Publish telemetry KHÔNG có chữ ký HMAC
# Chạy: ./scripts/demo-attack-nosig.sh (backend + broker phải đang chạy)
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

clear
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   🚨 ATTACK 1 — Publish telemetry KHÔNG có chữ ký HMAC${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Kịch bản:${NC} Attacker biết topic + api_key nhưng KHÔNG biết HMAC_SECRET"
echo -e "         → thử publish 1 telemetry giả (gas=99, giả vờ cháy) không có sig"
echo ""
echo -e "${BOLD}Broker:${NC}  mqtt://localhost:1883 (user smarthome / matkhau123)"
echo -e "${BOLD}Topic:${NC}   smarthome/smarthome-phn-7f3a/telemetry"
echo -e "${BOLD}Payload:${NC} (chú ý KHÔNG có field 'sig')"
echo -e "${YELLOW}{"
echo -e "  \"api_key\": \"sk-smarthome-7f3a9d2e\","
echo -e "  \"device_id\": \"attacker\","
echo -e "  \"sensors\": {\"temperature\": 99, \"gas\": 4000}"
echo -e "}${NC}"
echo ""
echo -e "${BOLD}Kết quả kỳ vọng:${NC} backend verifyAndParse() return null → reject + audit log"
echo ""
echo -e "${CYAN}─── Bước 1: Xóa audit entries cũ để capture chuẩn ───${NC}"
docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.deleteMany({action:{$regex:"security.reject_telemetry"}})' 2>&1
echo ""

echo -e "${CYAN}─── Bước 2: Publish attack payload ───${NC}"
node "$ROOT/scripts/attack.js" nosig
echo ""

echo -e "${CYAN}─── Bước 3: Đợi 2s + query MongoDB audit log ───${NC}"
sleep 2
COUNT=$(docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.countDocuments({action:"security.reject_telemetry"})' 2>&1 | tr -d '\r')
echo ""

if [ "$COUNT" -ge 1 ]; then
  echo -e "${GREEN}${BOLD}✅ THÀNH CÔNG — Backend đã reject và ghi audit log:${NC}"
  echo ""
  docker exec sh-mongo mongosh smart_home --quiet --eval '
    db.auditlogs.find(
      {action: "security.reject_telemetry"},
      {_id: 0, at: 1, actor: 1, action: 1, detail: 1, ok: 1}
    ).sort({at: -1}).limit(3).forEach(printjson)
  '
  echo ""
  echo -e "${GREEN}${BOLD}🛡️  Lớp bảo mật 3 (HMAC-SHA256) đã hoạt động đúng${NC}"
  echo -e "${GREEN}   • Payload KHÔNG được lưu vào collection 'telemetries'${NC}"
  echo -e "${GREEN}   • Backend log: '[MQTT] TỪ CHỐI telemetry: chữ ký HMAC sai hoặc thiếu'${NC}"
  echo -e "${GREEN}   • Audit log ghi entry ok=false — có thể điều tra sau${NC}"
else
  echo -e "${RED}${BOLD}❌ Không thấy audit entry — backend chưa chạy?${NC}"
  echo -e "${YELLOW}Kiểm tra: lsof -i:3000${NC}"
fi
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
