# Bảo mật

Project chia thành **2 tầng bảo mật độc lập** với mục đích và cơ chế khác nhau.

---

## Tầng 1 — IoT layer (backend ↔ ESP32)

Theo spec chung của nhóm bàn giao (repo `hust-iot` v2). Tầng IoT có **4 lớp bảo vệ**:

### 1.1 Broker authentication
- Aedes broker bắt buộc **username/password** (`smarthome`/`matkhau123`).
- Client sai user/pass bị reject ở tầng TCP → không đọc/ghi topic được.

### 1.2 Message-level: `api_key`
Mọi JSON payload đều có field `"api_key"`:

- **Telemetry / event (ESP32 → backend)**: backend verify key.
- **Control (backend → ESP32)**: ESP32 verify key.

Sai key → reject + audit log `security.reject_*`.

### 1.3 Chữ ký HMAC-SHA256 (`sig`) — bảo vệ integrity + authenticity

Mọi JSON MQTT có field `"sig"` **đứng cuối JSON**:
- **Ký**: `HMAC_SHA256(HMAC_SECRET, JSON_without_sig)` → hex 64 ký tự.
- **Verify**: cắt đoạn `,"sig":"..."` ở byte thô (không parse-then-serialize), tính HMAC trên phần còn lại, so sánh timing-safe.
- `HMAC_SECRET` **không bao giờ truyền qua mạng** — chỉ hardcode trong firmware + backend `.env`.

Message thiếu / sai chữ ký → reject.
Sự khác biệt so với chỉ dùng `api_key`:
- `api_key` là "token" — attacker sniff mạng thấy được, có thể replay.
- `sig` chứng minh **content không bị sửa** + **người ký biết secret** (secret không xuất hiện trong bất kỳ message nào).

### 1.4 Chống replay — trường `ts` cho control

Lệnh control có `ts = Date.now()` (millis epoch).
ESP32 track `lastControlTs`, chỉ chấp nhận lệnh có `ts > lastControlTs`.
Lệnh cũ được phát lại (dù đúng chữ ký) sẽ bị reject → phát event `security_alert: control message replay rejected`.

### 1.5 Ma trận reject theo lớp

| Attacker gửi | Bị chặn ở lớp |
|---|---|
| Sai broker user/pass | 1 — TCP AUTH |
| Đúng broker auth, sai / thiếu sig | 3 — HMAC verify |
| Đúng sig (biết secret) nhưng sai api_key | 2 — api_key |
| Đúng sig, đúng api_key nhưng phát lại lệnh cũ | 4 — anti-replay ts |

Muốn qua cả 4 phải: có `MQTT_PASS` + biết `HMAC_SECRET` + biết `API_KEY` + tạo được `ts` mới → tức là **cần cả 3 secret** đều bị lộ, không chỉ 1.

### 1.6 Hạn chế còn lại

| Điểm yếu | Ảnh hưởng | Giải pháp production |
|---|---|---|
| TCP không TLS (port 1883) | Attacker nghe được nội dung (không sửa được nhờ HMAC) | MQTT over TLS (port 8883) |
| HMAC_SECRET hardcode firmware | Nếu firmware bị dump → 3 secret lộ | Secure Element ATECC608A |
| 1 tài khoản broker chung nhóm nhà | Không phân quyền per-device | EMQX ACL per client_id |

---

## Tầng 2 — User layer (browser ↔ backend)

Đây là tầng người dùng thao tác, được đầu tư mạnh hơn.

### 2.1 Authentication

**Password fallback**:
- `bcrypt` cost=12 + **pepper** (`PASSWORD_PEPPER` trong env) — nếu DB leak, attacker cũng không crack được nếu không có pepper.
- Rate limit **10 req/min/IP** cho `/api/auth/login` (Redis-backed).

**Passkey / WebAuthn (FIDO2)** — phương thức chính:
- Public key lưu ở backend, private key ở **Secure Enclave** thiết bị (Touch ID / Face ID / Windows Hello / YubiKey)
- Không có gì để đánh cắp — không phishable
- Dùng thư viện `@simplewebauthn/{server,browser}` v13
- Counter chống replay (backend track newCounter mỗi lần login)

### 2.2 Session

- **Access token**: JWT HS256, TTL 15 phút. Lưu **memory** JS (không localStorage — chống XSS).
- **Refresh token**: JWT HS256 secret riêng, TTL 7 ngày. Lưu **HttpOnly + SameSite=Lax cookie** — JS không đọc được.
- Frontend interceptor tự động gọi `/api/auth/refresh` khi gặp 401.

### 2.3 Rate limit (Redis-backed)

| Endpoint | Limit | Purpose |
|---|---|---|
| `/api/auth/login` + `/passkey/login/*` | 10 req/min/IP | Chống bruteforce password + spam passkey challenge |
| `/api/devices/:d` (control) | 60 req/min/IP | Chống spam control lệnh |

Trả HTTP 429 khi vượt.

### 2.4 Authorization

- `requireAuth` middleware: verify JWT access token trong `Authorization: Bearer …` header
- `requireRole('admin')`: chỉ admin xem được `/api/admin/audit`

### 2.5 CORS + Helmet

- `helmet()` set các security header (X-Content-Type-Options, X-Frame-Options, CSP mặc định…)
- `cors({ origin: FRONTEND_ORIGIN, credentials: true })` — chỉ cho phép frontend gọi (không public API)

### 2.6 Audit log

Mọi action ghi lại: `user.login`, `device.control`, `passkey.register`, `security.alert`, `security.reject_telemetry`, `security.reject_event`.

Trường: `at`, `actor`, `action`, `target`, `detail`, `ip`, `userAgent`, `ok`.

TTL 180 ngày. Admin xem qua UI `/admin/audit`.

---

## So sánh với dự án cũ (mTLS + JWS ES256)

| Aspect | Dự án cũ | Dự án mới (theo hust-iot) |
|---|---|---|
| Transport IoT | mTLS (port 8883) | TCP thường (port 1883) |
| Message auth | JWS ES256 (chữ ký ECDSA) | api_key trong JSON |
| Broker | EMQX với ACL per-device | Aedes user/pass chung |
| Complexity | Cao (setup CA, cert per device, jose library) | Thấp (1 hằng số API_KEY) |
| Bảo mật thực tế | Rất mạnh, chống MITM + replay | Đủ cho demo, cần broker riêng khi production |

**Quyết định** dùng cấu hình hust-iot vì spec chung của nhóm bàn giao là như vậy — 3 người phải khớp nhau về giao thức.

Tầng 2 (user layer) vẫn giữ Passkey + JWT + rate limit + audit như dự án cũ, không hạ chuẩn.

---

## Demo attack

```bash
# 1. Telemetry KHÔNG có chữ ký → backend reject (lớp 3)
./demo.sh attack-nosig

# 2. Chữ ký giả (không biết HMAC_SECRET) → backend reject (lớp 3)
./demo.sh attack-badsig

# 3. Lệnh control giả không có sig → ESP32 raise security_alert
./demo.sh attack-control

# 4. Replay lệnh cũ (đúng sig nhưng ts nhỏ hơn) → ESP32 raise security_alert (lớp 4)
./demo.sh attack-replay

# 5. Bruteforce login user → rate limit 429 (lớp user)
./demo.sh attack-brute
```
