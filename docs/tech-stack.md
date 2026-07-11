# Công nghệ sử dụng

## Firmware (ESP32)

| Thư viện | Vai trò |
|---|---|
| Arduino core | Framework chính |
| `PubSubClient@^2.8` | MQTT client |
| `DHT sensor library@^1.4.6` | Đọc DHT22 |
| `ESP32Servo@^1.2.1` | Điều khiển servo |
| `ArduinoJson@^7.0.4` | JSON encode/decode |

Build bằng PlatformIO. Mô phỏng trên Wokwi VS Code extension (`host.wokwi.internal` = localhost).

## MQTT Broker

**Aedes 0.51** — broker MQTT viết bằng Node.js:
- Nhẹ, chạy trong 1 process cùng backend nếu muốn
- Full support MQTT 3.1/3.1.1 + QoS 0/1/2
- Built-in authentication hook (dùng để implement user/pass)
- Không cần Docker (khác EMQX/Mosquitto)

**Không dùng** EMQX/HiveMQ vì:
- Overkill cho 1 device
- Config phức tạp (ACL, listeners, log)
- Docker overhead

## Backend

| Package | Version | Vai trò |
|---|---|---|
| `express` | 4 | HTTP framework |
| `mongoose` | 8 | MongoDB ODM |
| `ioredis` | 5 | Redis client |
| `mqtt` | 5 | MQTT client (kết nối Aedes) |
| `socket.io` | 4 | Realtime broadcast |
| `jsonwebtoken` | 9 | JWT access + refresh |
| `@simplewebauthn/server` | 13 | Passkey/WebAuthn verify |
| `bcryptjs` | 2 | Password hash |
| `express-rate-limit` + `rate-limit-redis` | latest | Rate limit backed by Redis |
| `helmet`, `cors`, `cookie-parser` | latest | Security middleware |

## Frontend

| Package | Version | Vai trò |
|---|---|---|
| `react` + `react-dom` | 18 | UI framework |
| `vite` | 5 | Dev server + build |
| `react-router-dom` | 6 | Client-side routing |
| `@tanstack/react-query` | 5 | (chuẩn bị cho fetching có cache — hiện dùng axios trực tiếp) |
| `axios` | 1 | HTTP client với interceptor refresh |
| `socket.io-client` | 4 | Realtime |
| `@simplewebauthn/browser` | 13 | Passkey login |
| `tailwindcss` + `tailwindcss-animate` | 3 | Style |
| `@radix-ui/*` + `class-variance-authority` | latest | shadcn/ui base |
| `recharts` | 2 | Chart nhiệt độ/độ ẩm |
| `lucide-react` | 0.462 | Icon set |

## Database

- **MongoDB 7** — persistence chính cho telemetry timeseries, event, user, credential, audit
- **Redis 7** — cache latest state + rate limit store
- **Mongo Express** — UI web quản lý DB (http://localhost:8081, admin/admin)

Không dùng InfluxDB/PostgreSQL vì:
- Mongo time-series collection đủ cho 1 device
- Không có SQL join phức tạp → không cần Postgres
- Simplify infra — chỉ 2 database thay vì 3

## Docker

Chỉ compose 3 service: Mongo + Redis + Mongo Express. Broker MQTT chạy native trong Node (nhanh khi debug, khỏi rebuild image).

## Simulator

Wokwi VS Code — mô phỏng ESP32 kèm mọi sensor/actuator. Không cần mua phần cứng thật.
