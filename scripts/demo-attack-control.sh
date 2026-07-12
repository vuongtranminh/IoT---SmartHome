#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Demo Attack 3: Giả mạo lệnh mở cửa (control topic, không có sig)
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

clear
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   🚨 ATTACK 3 — Giả mạo lệnh mở cửa (control MQTT)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Kịch bản:${NC} Attacker publish trực tiếp vào topic control để mở cửa từ xa"
echo -e "         (không cần login dashboard, bypass backend luôn)"
echo ""
echo -e "${BOLD}Ai xử lý attack này:${NC} ${YELLOW}FIRMWARE ESP32${NC} (không phải backend)"
echo -e "  ESP32 subscribe topic control, tự verify sig trước khi thực thi."
echo ""
echo -e "${BOLD}Topic:${NC}   smarthome/smarthome-phn-7f3a/control (backend → ESP32)"
echo -e "${BOLD}Payload:${NC} (thiếu field sig)"
echo -e "${YELLOW}{"
echo -e "  \"api_key\": \"sk-smarthome-7f3a9d2e\","
echo -e "  \"device\": \"door\","
echo -e "  \"action\": \"open\","
echo -e "  \"ts\": 1"
echo -e "}${NC}"
echo ""
echo -e "${CYAN}─── Publish attack ───${NC}"
node "$ROOT/scripts/attack.js" control
echo ""

sleep 2

echo -e "${BOLD}${CYAN}─── Kết quả kỳ vọng (kiểm tra thủ công) ───${NC}"
echo ""
echo -e "${YELLOW}1. Wokwi Serial Monitor:${NC}"
echo -e "   [MQTT] TU CHOI: chu ky HMAC sai hoac thieu!"
echo -e "   [Event] security_alert: control message with invalid signature rejected"
echo ""
echo -e "${YELLOW}2. Servo Wokwi cửa chính:${NC} vẫn ĐÓNG (0°) — không quay"
echo ""
echo -e "${YELLOW}3. Frontend Dashboard:${NC}"
echo -e "   Toast đỏ realtime: \"🚨 Bảo mật: control message with invalid signature rejected\""
echo ""

# Query event từ Mongo (ESP32 publish security_alert event → backend save)
echo -e "${CYAN}─── ESP32 đã publish event security_alert lên backend? ───${NC}"
EVT_COUNT=$(docker exec sh-mongo mongosh smart_home --quiet --eval '
  db.events.countDocuments({
    event: "security_alert",
    received_at: { $gte: new Date(Date.now() - 10000) }
  })' 2>&1 | tr -d '\r')

if [ "$EVT_COUNT" -ge 1 ]; then
  echo -e "${GREEN}✅ Có ${EVT_COUNT} event security_alert vừa được ESP32 phát:${NC}"
  echo ""
  docker exec sh-mongo mongosh smart_home --quiet --eval '
    db.events.find(
      {event: "security_alert", received_at: {$gte: new Date(Date.now() - 10000)}},
      {_id: 0, device_id: 1, event: 1, detail: 1, received_at: 1}
    ).sort({received_at: -1}).limit(3).forEach(printjson)
  '
  echo ""
  echo -e "${GREEN}${BOLD}🛡️  Firmware ESP32 tự vệ hoàn hảo:${NC}"
  echo -e "${GREEN}   • Verify HMAC trước applyControl → không mở cửa${NC}"
  echo -e "${GREEN}   • Chủ động phát event cảnh báo lên backend${NC}"
  echo -e "${GREEN}   • Backend forward toast tới UI realtime qua Socket.IO${NC}"
else
  echo -e "${YELLOW}⚠️  Chưa thấy event từ ESP32 — kiểm tra Wokwi có đang chạy không?${NC}"
  echo -e "${YELLOW}   Nếu ESP32 offline, attack vẫn bị chặn (không có subscriber) nhưng không có event.${NC}"
fi
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
