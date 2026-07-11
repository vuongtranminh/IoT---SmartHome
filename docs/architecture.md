# Kiến trúc tổng thể

## Sơ đồ

```
                          ┌──────────────────────┐
                          │   ESP32 (Wokwi)      │
                          │   1 thiết bị mô phỏng│
                          │   toàn bộ nhà        │
                          └───┬────────────┬─────┘
                              │            ▲
              telemetry(5s) + │            │ control
              event (ngay lập tức)         │
                              ▼            │
                     ┌────────────────────────────┐
                     │  Aedes MQTT broker :1883   │
                     │  user/pass auth            │
                     │  (node.js broker.js)       │
                     └───┬───────────────────┬────┘
                         │                   ▲
                subscribe│                   │publish control
                         ▼                   │
              ┌──────────────────────────────────────┐
              │  Backend Node.js (Express)           │
              │  ┌────────────────────────────┐      │
              │  │ mqtt.service.js            │      │
              │  │  ├─ verify HMAC-SHA256 sig │      │
              │  │  ├─ verify api_key         │      │
              │  │  ├─ ghi Mongo              │──────┼──▶ MongoDB (Telemetry, Event, State, Audit)
              │  │  ├─ cache Redis (latest)   │──────┼──▶ Redis (device:latest, rate limit)
              │  │  └─ emit Socket.IO         │      │
              │  └────────────┬───────────────┘      │
              │               ▼                      │
              │        Socket.IO server              │
              └──────────┬────────────────┬──────────┘
                         │REST /api       │Socket.IO
                         │(JWT-guarded)   │(JWT auth handshake)
                         ▼                ▼
              ┌───────────────────────────────────────┐
              │   Frontend React (Vite :5173)         │
              │   • Login (Passkey / Password)        │
              │   • Dashboard 1 device (7 thiết bị)   │
              │   • Chart + Event Timeline            │
              │   • Admin Audit Log                    │
              └───────────────────────────────────────┘
```

## 3 lớp

### 1. Firmware (ESP32)
- Đọc DHT22, gas (ADC), LDR (ADC), PIR
- Điều khiển servo (cửa/sổ), LED (đèn/quạt/AC/báo cháy), buzzer
- MQTT client PubSubClient — LWT `offline`, subscribe topic `control`
- Auto logic: AC theo nhiệt độ, quạt theo chênh nhiệt, đèn theo tối+có người, cháy → khẩn cấp

### 2. Broker MQTT
- Aedes v0.51 (Node.js)
- Port 1883 TCP (không TLS — theo spec chung của nhóm)
- Bắt buộc username/password (`smarthome`/`matkhau123`)
- Log mọi client kết nối + message (debug/demo)

### 3. Backend
- **Express** REST API + middleware bảo mật
- **mqtt.js** client kết nối Aedes, subscribe 3 topic → xử lý → lưu DB → broadcast
- **Mongoose** models: Telemetry (TTL 30d), Event (TTL 90d), DeviceState, User, Credential, AuditLog (TTL 180d)
- **ioredis** cache latest snapshot + rate limit
- **Socket.IO** broadcast telemetry/event/status realtime tới UI
- **JWT** access (15m) + refresh (7d, HttpOnly cookie)
- **WebAuthn** đăng ký/đăng nhập Passkey

### 4. Frontend
- **React 18 + Vite** — dev server port 5173, proxy `/api` + `/socket.io` → backend
- **shadcn/ui + Tailwind** — component style
- **@simplewebauthn/browser** — Passkey login
- **socket.io-client** — realtime updates
- **recharts** — chart temp/humid

## Persistence

| Collection | Purpose | TTL |
|---|---|---|
| `telemetries` | Time-series toàn bộ telemetry (5s/lần + sau mỗi control) | 30 ngày |
| `events` | Sự kiện: boot, fire_alarm, motion, door/window, control_applied/rejected, security_alert | 90 ngày |
| `devicestates` | Snapshot mới nhất (1 doc / device) | không TTL |
| `users` | Tài khoản dashboard (username, bcrypt hash) | không TTL |
| `credentials` | Public key Passkey (n:1 với user) | không TTL |
| `auditlogs` | Mọi action nhạy cảm (login, control, security reject) | 180 ngày |

## Cache

| Redis key | Value | TTL |
|---|---|---|
| `device:latest` | JSON snapshot Telemetry mới nhất | 5 phút |
| `device:online` | `'1'` \| `'0'` | 1 giờ |
| `rl:login:*` | rate limit counter | 60s window |
| `rl:control:*` | rate limit counter | 60s window |

## Realtime

Backend emit qua Socket.IO 3 event:
- `device:telemetry` — mỗi khi ESP32 publish telemetry
- `device:event` — mỗi khi ESP32 phát event
- `device:status` — khi ESP32 online/offline

Frontend `useDevice()` subscribe 3 event này để cập nhật UI không cần polling.

## Chọn 1 ESP32 mô phỏng toàn bộ nhà

Repo hust-iot dùng 1 device duy nhất chứa toàn bộ thiết bị/cảm biến, khác với kiến trúc "n device / phòng" thường thấy. Lý do:
- Đơn giản khi mô phỏng Wokwi (1 mạch, không cần multi-board)
- Tất cả logic auto (AC + quạt + đèn + cháy) chạy trên 1 chip → không cần đồng bộ giữa nhiều node
- Với đồ án học thuật là đủ; thực tế nên tách theo phòng để scale
