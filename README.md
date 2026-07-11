# 🏠 Smart Home — Đồ án IoT

Nhà thông minh mô phỏng trên ESP32/Wokwi, giao tiếp qua MQTT với backend Node.js (MongoDB + Redis) và dashboard React realtime.

## Thành phần

| Module | Công nghệ | Vai trò |
|---|---|---|
| **Firmware ESP32** | Arduino + PubSubClient + DHT + ESP32Servo | Đọc cảm biến, điều khiển thiết bị, publish MQTT |
| **MQTT broker** | Aedes (Node.js, port 1883) | Trung gian ESP32 ↔ backend, có user/pass |
| **Backend** | Node.js + Express + Mongoose + ioredis + Socket.IO | REST API, xác thực Passkey/JWT, lưu telemetry/event, cache, realtime |
| **Frontend** | React + Vite + shadcn/ui + Recharts | Dashboard 1 device, control 7 thiết bị, chart, event timeline |
| **DB** | MongoDB (time-series + events + audit) | Persistence |
| **Cache** | Redis | Latest state + rate limit |

## 7 thiết bị mô phỏng

Điều hòa (16-30°C), quạt (4 mức 0-3), 2 đèn (khách/ngủ), cửa chính, cửa sổ, báo cháy.
Auto logic: AC theo nhiệt độ, quạt theo chênh nhiệt, đèn theo LDR+PIR, cháy → mở cửa + quạt max + tắt AC.

## Cảm biến

DHT22 (nhiệt độ/độ ẩm), biến trở mô phỏng gas, LDR (ánh sáng), PIR (chuyển động), nút test cháy.

## Chạy nhanh

```bash
./demo.sh setup     # 1 lần: install deps + up Docker + seed user

# 3 terminal:
./demo.sh broker    # A: MQTT (1883)
./demo.sh backend   # B: API   (3000)
./demo.sh frontend  # C: UI    (5173)
```

→ http://localhost:5173 · login `admin / admin@1234`

Chi tiết trong [SETUP.md](SETUP.md).

## Bảo mật 2 tầng

**Tầng ngoài (user ↔ dashboard)**:
- Passkey/WebAuthn (FIDO2) + Password fallback
- JWT ES256 access token + HttpOnly cookie refresh
- Rate limit (Redis-backed)
- Audit log mọi thao tác

**Tầng IoT (backend ↔ ESP32)** — theo spec chung của nhóm (4 lớp):
1. Broker user/pass (Aedes reject client sai)
2. `api_key` trong mọi JSON payload (defense in depth)
3. **Chữ ký HMAC-SHA256** (`sig` cuối JSON, key `HMAC_SECRET` không truyền qua mạng) — chống tampering + spoofing
4. **Chống replay**: control có `ts` tăng dần, ESP32 track `lastControlTs`
- Chi tiết trong [docs/MQTT_SPEC.md](docs/MQTT_SPEC.md) và [docs/security.md](docs/security.md)

## Cấu trúc

```
firmware/       — ESP32 code (giữ nguyên từ nhóm bàn giao)
backend/        — API + MQTT client + broker
frontend/       — React UI
infrastructure/ — Docker compose (Mongo + Redis)
docs/           — Architecture, security, tech-stack, MQTT spec
```

## Docs

- [docs/architecture.md](docs/architecture.md) — kiến trúc tổng thể
- [docs/security.md](docs/security.md) — bảo mật 2 tầng
- [docs/tech-stack.md](docs/tech-stack.md) — lý do chọn công nghệ
- [docs/api.md](docs/api.md) — REST API contract
- [docs/MQTT_SPEC.md](docs/MQTT_SPEC.md) — MQTT protocol (bàn giao gốc từ nhóm)

## Bàn giao

- **Firmware, broker, MQTT spec**: từ repo nhóm [`hust-iot`](https://github.com/cristianongan/hust-iot)
- **Backend (Mongo + Redis + Passkey + Socket.IO)**: viết mới
- **Frontend**: viết mới, adapt từ dự án dashboard cũ
