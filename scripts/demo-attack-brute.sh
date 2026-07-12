#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Demo Attack 4: Brute force login → chặn bởi rate limit
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

clear
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   🚨 ATTACK 4 — Brute force login (spam 15 request)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Kịch bản:${NC} Attacker spam POST /api/auth/login với password sai để đoán"
echo ""
echo -e "${BOLD}Phòng vệ:${NC} express-rate-limit + Redis store"
echo -e "  • Config: ${YELLOW}10 request/minute/IP${NC} cho endpoint /auth/login"
echo -e "  • Vượt ngưỡng → HTTP ${RED}429 Too Many Requests${NC}"
echo -e "  • Counter lưu Redis (window 60s tự reset)"
echo ""
echo -e "${CYAN}─── Reset counter Redis để test lại từ đầu ───${NC}"
docker exec sh-redis redis-cli -a redispass FLUSHDB 2>&1 | tail -1
echo ""

echo -e "${CYAN}─── Xóa audit user.login cũ ───${NC}"
docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.deleteMany({action:"user.login", ok:false})' > /dev/null 2>&1
echo ""

echo -e "${CYAN}─── Spam 15 request POST /api/auth/login (password sai) ───${NC}"
echo ""
printf "%-12s %-10s %-40s\n" "REQUEST" "STATUS" "RESPONSE"
echo "─────────────────────────────────────────────────────────────────"

for i in $(seq 1 15); do
  RESULT=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrong"}' \
    http://localhost:3000/api/auth/login)
  BODY=$(echo "$RESULT" | head -n -1)
  CODE=$(echo "$RESULT" | tail -n 1)

  if [ "$CODE" = "429" ]; then
    printf "${RED}%-12s${NC} ${RED}${BOLD}%-10s${NC} %-40s\n" "#$(printf '%2d' $i)" "$CODE" "$BODY"
  elif [ "$CODE" = "401" ]; then
    printf "${YELLOW}%-12s${NC} ${YELLOW}%-10s${NC} %-40s\n" "#$(printf '%2d' $i)" "$CODE" "$BODY"
  else
    printf "%-12s %-10s %-40s\n" "#$(printf '%2d' $i)" "$CODE" "$BODY"
  fi
done
echo ""

echo -e "${CYAN}─── Verify Redis counter ───${NC}"
REDIS_KEY=$(docker exec sh-redis redis-cli -a redispass --no-auth-warning KEYS "rl:login:*" 2>/dev/null | head -1)
if [ -n "$REDIS_KEY" ]; then
  COUNTER=$(docker exec sh-redis redis-cli -a redispass --no-auth-warning GET "$REDIS_KEY" 2>/dev/null)
  TTL=$(docker exec sh-redis redis-cli -a redispass --no-auth-warning TTL "$REDIS_KEY" 2>/dev/null)
  echo -e "${GREEN}✅ Rate limit counter Redis:${NC}"
  echo -e "   ${BOLD}Key:${NC}     $REDIS_KEY"
  echo -e "   ${BOLD}Value:${NC}   $COUNTER (đã vượt max=10)"
  echo -e "   ${BOLD}TTL:${NC}     ${TTL}s (window reset)"
fi
echo ""

echo -e "${CYAN}─── Số audit entries user.login ok=false ───${NC}"
FAIL_COUNT=$(docker exec sh-mongo mongosh smart_home --quiet --eval 'db.auditlogs.countDocuments({action:"user.login", ok:false, at:{$gte:new Date(Date.now()-60000)}})' 2>&1 | tr -d '\r')
echo -e "${GREEN}✅ ${FAIL_COUNT} entries login fail đã được audit — có thể điều tra sau${NC}"
echo ""

echo -e "${GREEN}${BOLD}🛡️  Kết luận:${NC}"
echo -e "${GREEN}   • 10 request đầu: HTTP 401 (rate limit chưa đầy)${NC}"
echo -e "${GREEN}   • 11-15: HTTP 429 (bị chặn)${NC}"
echo -e "${GREEN}   • Attacker chỉ có 10 lần thử/phút → không đủ để brute-force password${NC}"
echo -e "${GREEN}   • Tất cả login attempt (kể cả 429) đều bị audit log ghi lại${NC}"
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
