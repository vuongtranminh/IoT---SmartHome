# SETUP — Smart Home v2

Hướng dẫn chạy dự án từ đầu.

---

## 1. Yêu cầu

| Công cụ | Version | Cách cài |
|---|---|---|
| Node.js | ≥ 18 | `brew install node` |
| Docker + Docker Compose | mới | Docker Desktop |
| PlatformIO CLI | mới | `pip install platformio` hoặc VS Code extension |
| Wokwi VS Code extension | mới | Marketplace |

---

## 2. Chạy nhanh 1 lệnh

```bash
cd DoAn_SmartHome
./demo.sh setup
```

Lệnh này sẽ:
1. `docker-compose up -d` (MongoDB + Redis)
2. `npm install` backend + frontend
3. Copy `.env.example` → `.env`
4. Seed 2 user demo

Sau đó mở **3 terminal**:

```bash
./demo.sh broker      # Terminal A: MQTT broker Aedes (1883)
./demo.sh backend     # Terminal B: API + Socket.IO (3000)
./demo.sh frontend    # Terminal C: React Vite (5173)
```

Truy cập http://localhost:5173 — login `admin / admin@1234`.

---

## 3. Cổng và tài khoản

| Service | Port | User | Pass |
|---|---|---|---|
| Frontend (Vite) | 5173 | — | — |
| Backend API | 3000 | — | — |
| MQTT broker (Aedes) | 1883 | `smarthome` | `matkhau123` |
| MongoDB | 27017 | — | — |
| Mongo Express UI | 8081 | `admin` | `admin` |
| Redis | 6379 | — | `redispass` |

Tài khoản Dashboard (đã seed):

| Username | Password | Role |
|---|---|---|
| `admin` | `admin@1234` | admin |
| `user`  | `user@1234`  | user |

---

## 4. IoT layer — DEVICE_ID + API_KEY + HMAC_SECRET

Repo dùng cấu hình từ nhóm bàn giao:

```
DEVICE_ID    = smarthome-phn-7f3a
API_KEY      = sk-smarthome-7f3a9d2e         # truyền trong JSON
HMAC_SECRET  = hmac-secret-phn-2b8c4e6f       # KHÔNG truyền qua mạng (chỉ hardcode 2 nơi)
```

3 giá trị này **phải khớp** giữa:
- `firmware/src/main.cpp` (đầu file, dòng `const char*`)
- `backend/.env` (biến `DEVICE_ID`, `API_KEY`, `HMAC_SECRET`)

Đổi thành chuỗi riêng của bạn để tránh trùng broker public.
`HMAC_SECRET` càng dài càng tốt (recommended ≥ 32 ký tự random).

---

## 5. Chạy firmware ESP32 trên Wokwi

1. Mở VS Code, install extension **Wokwi Simulator**
2. Mở folder `firmware/`
3. Build firmware:
   ```bash
   ./demo.sh build-fw
   ```
4. F1 → **Wokwi: Start Simulator**
5. Serial Monitor sẽ hiện `[MQTT] Ket noi host.wokwi.internal:1883 ... OK`

⚠️ Nếu chạy trên trang wokwi.com (không dùng VS Code):
- `host.wokwi.internal` không hoạt động, đổi `MQTT_HOST` trong `src/main.cpp` thành `broker.hivemq.com` và bỏ user/pass (broker public không auth)
- Firmware công khai broker → không nên dùng ngoài đồ án

---

## 6. Cấu trúc project

```
DoAn_SmartHome/
├── firmware/               # ESP32 code (từ hust-iot repo, giữ nguyên)
│   ├── src/main.cpp
│   ├── diagram.json
│   ├── platformio.ini
│   └── wokwi.toml
├── backend/
│   ├── broker.js           # Aedes MQTT broker (từ hust-iot)
│   ├── src/
│   │   ├── config/         # env, mongo, redis
│   │   ├── models/         # Telemetry, Event, DeviceState, User, Credential, AuditLog
│   │   ├── services/       # mqtt, cache, auth, audit
│   │   ├── routes/         # auth, device, admin
│   │   ├── middlewares/    # jwt, ratelimit
│   │   ├── socket.js
│   │   └── index.js
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/          # Login, Dashboard, admin/AuditLog
│       ├── components/     # SensorCard, DeviceControls, EventsTimeline, TelemetryChart
│       └── ...
├── infrastructure/
│   └── docker-compose.yml  # Mongo + Redis + Mongo Express
├── docs/                   # architecture, security, tech-stack, api, MQTT_SPEC
├── demo.sh                 # orchestrator
└── SETUP.md
```

---

## 7. Kiến trúc luồng dữ liệu

```
ESP32 ──publish(api_key + JSON)──▶ Aedes broker (:1883, user/pass)
                                      │
                                      ▼
                           backend/src/services/mqtt.service.js
                           ├─ verify api_key                      ── nếu sai → log security.reject
                           ├─ lưu Mongo (Telemetry/Event/State)
                           ├─ cache latest → Redis
                           └─ emit Socket.IO ──────────▶ UI (realtime)

User (browser) ──login Passkey/Password──▶ JWT (access + refresh)
                                            │
              REST /api/devices/:d ─────────┤
              GET /api/latest,history…  ────┤
                                            ▼
                                middleware: JWT + rate limit
                                            │
                                            ▼
                                mqtt.service.publishControl (kèm api_key)
                                            │
                                            ▼
                                    Aedes ──▶ ESP32 (thực thi)
```

**Lưu ý về 2 tầng bảo mật**:
- **Tầng ngoài (user ↔ backend)**: Passkey/WebAuthn + JWT + rate limit + audit log
- **Tầng IoT (backend ↔ ESP32)**: username/password broker + api_key trong payload (theo spec chung của nhóm bàn giao)

---

## 8. Troubleshoot

**Backend `[Redis] Error: connect ECONNREFUSED`**
Redis chưa chạy → `./demo.sh infra-up`.

**Backend `[MQTT] Error: connect ECONNREFUSED 127.0.0.1:1883`**
Broker chưa chạy → mở terminal riêng `./demo.sh broker`.

**ESP32 Serial `[MQTT] Ket noi host.wokwi.internal:1883 ... loi (rc=-2)`**
- Chưa chạy broker → mở terminal `./demo.sh broker`
- Hoặc broker.js đang chiếm port khác — kiểm tra `lsof -i:1883`

**Frontend `Passkey login thất bại`**
- Cookie `pkChallenge` bị chặn → check trình duyệt allow cookies
- Cần chạy backend + frontend trên **cùng origin** (`localhost`) — proxy Vite đã config

**Wokwi không kết nối được broker**
- VS Code Wokwi: dùng `host.wokwi.internal` (đã config sẵn)
- Trang wokwi.com: đổi sang `broker.hivemq.com` + bỏ user/pass (broker.js không expose ra internet)

**MongoDB Compass connect fail**
- Không có auth: `mongodb://localhost:27017`
- UI web: http://localhost:8081 (Mongo Express, admin/admin)

---

## 9. Reset về trạng thái sạch

```bash
./demo.sh reset-mongo   # xóa DB + seed lại 2 user
./demo.sh reset-redis   # flush cache
./demo.sh infra-down    # tắt Docker
```

---

## 10. Bổ sung Passkey cho user

1. Login bằng password (admin/admin@1234)
2. Vào Dashboard → header có nút **Passkey**
3. Click → xác thực bằng Touch ID / Face ID / Windows Hello
4. Lần sau logout → login lại → click **Đăng nhập bằng Passkey** ở trang login
