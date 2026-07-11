# REST API

Base URL: `http://localhost:3000/api`
Yêu cầu: header `Authorization: Bearer <access_token>` cho mọi endpoint (trừ `/auth/*`).

## Auth

### `POST /auth/login`
Body: `{ "username", "password" }`
Response: `{ access, user: { username, role } }` + set cookie `refresh` (HttpOnly)
Rate limit: 10 req/min/IP.

### `POST /auth/refresh`
Đọc cookie `refresh`, trả `access` mới.

### `POST /auth/logout`
Clear cookie.

### `GET /auth/me`
Trả `{ _id, username, role }` (yêu cầu access token).

### Passkey
- `POST /auth/passkey/register/options` (require auth) → JSON WebAuthn options
- `POST /auth/passkey/register/verify` (require auth) → `{ ok: true }`
- `POST /auth/passkey/login/options` → JSON options + cookie challenge (5min)
- `POST /auth/passkey/login/verify` → `{ access, user }` + cookie refresh

## Device (`/api`, require JWT)

Contract giống backend mẫu `hust-iot/backend/server.js`.

### `GET /latest`
Snapshot mới nhất (đọc Redis, fallback Mongo DeviceState).

### `GET /history?limit=100`
Array Telemetry (mặc định 100 record mới nhất, max 1000).

### `GET /devices/status`
`{ online, sensors, devices, ... }`

### `GET /events?type=fire_alarm&limit=50`
Array Event (mặc định 50, filter theo `type` optional).

### `GET /alerts`
```json
{
  "online": true,
  "fire_alarm": false,
  "gas_level": 800,
  "last_security_alert": { ... }
}
```

### `POST /devices/:device`
Body: `{ "action": "on|off|open|close|auto|speed|set_temp", "value": ... }`
Rate limit: 60 req/min/IP.

Bảng device × action:

| device | action | value |
|---|---|---|
| `fan` | `on`/`off`/`auto` | — |
| `fan` | `speed` | 0..3 |
| `ac` | `on`/`off`/`auto` | — |
| `ac` | `set_temp` | 16..30 |
| `light_living` | `on`/`off`/`auto` | — |
| `light_bedroom` | `on`/`off` | — |
| `door` | `open`/`close` | — |
| `window` | `open`/`close` | — |
| `alarm` | `on`/`off` | — |

Response: `{ ok: true, sent: { device, action, value } }` — 503 nếu ESP32 offline, 429 nếu quá rate limit.

## Admin (`/api/admin`, require role=admin)

### `GET /admin/audit?limit=200&action=device.control&actor=user:admin&ok=true`
Array AuditLog.

## Socket.IO events

Client kết nối `/socket.io/` với `auth.token = <access_token>`.
Server emit:
- `device:telemetry` — Telemetry object
- `device:event` — Event object
- `device:status` — `{ online: boolean }`

## Curl examples

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin@1234"}' | jq -r .access)

# 2. Latest snapshot
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/latest

# 3. Bật quạt tốc độ 2
curl -X POST http://localhost:3000/api/devices/fan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"speed","value":2}'

# 4. Set AC 22°C
curl -X POST http://localhost:3000/api/devices/ac \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"set_temp","value":22}'

# 5. Mở cửa
curl -X POST http://localhost:3000/api/devices/door \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"open"}'
```
