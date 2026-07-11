# 📡 MQTT Interface Spec — Smart Home ESP32 (bàn giao cho backend)

Tài liệu này mô tả **toàn bộ giao tiếp giữa thiết bị ESP32 (mô phỏng Wokwi) và backend**.

## 1. Kết nối broker

| Thông số | Giá trị mặc định | Ghi chú |
|---|---|---|
| Host | `localhost` (broker local `backend/broker.js`) | Có thể thay bằng broker bất kỳ, chỉ cần ESP32 và backend cùng trỏ về một chỗ |
| Port | `1883` (TCP, không TLS) | |
| Username | `smarthome` | Broker từ chối client sai user/pass |
| Password | `matkhau123` | |
| Client ID | tùy ý, **phải khác nhau** giữa các client | ESP32 dùng `smarthome-phn-7f3a-<random>` |

> Nếu backend deploy broker riêng (Mosquitto, EMQX, HiveMQ Cloud…): báo lại host/port/user/pass
> để sửa 4 hằng số `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS` ở đầu `src/main.cpp`.

## 2. Định danh & bảo mật

| Hằng số | Giá trị hiện tại | Vai trò |
|---|---|---|
| `DEVICE_ID` | `smarthome-phn-7f3a` | Ghép vào tên topic |
| `API_KEY` | `sk-smarthome-7f3a9d2e` | Xác thực ở tầng message (truyền trong JSON) |
| `HMAC_SECRET` | `hmac-secret-phn-2b8c4e6f` | Ký HMAC-SHA256 — **không bao giờ truyền qua mạng** |

**Quy tắc api_key (bắt buộc):**
- Mọi message ESP32 gửi đi (telemetry, event) đều có field `"api_key"` —
  backend **phải kiểm tra đúng key mới xử lý**, và nên xóa field này trước khi lưu.
- Mọi lệnh điều khiển backend gửi xuống **phải kèm** `"api_key"` —
  ESP32 âm thầm bỏ qua lệnh sai/thiếu key và phát event `security_alert`.

### Chữ ký HMAC-SHA256 (bắt buộc, cả 2 chiều)

Mọi message JSON (telemetry, event, control) đều phải có field `"sig"` **đứng cuối JSON**:

- **Ký**: serialize JSON chưa có `sig` → tính `HMAC_SHA256(HMAC_SECRET, chuỗi JSON đó)`
  → hex lowercase 64 ký tự → chèn `,"sig":"<hex>"` vào ngay trước dấu `}` cuối cùng.
- **Xác minh**: nhận chuỗi thô → cắt đoạn `,"sig":"<64 hex>"` ở cuối →
  tính HMAC trên phần còn lại → so sánh. **Thao tác trên byte thô của chuỗi nhận được,
  KHÔNG parse rồi re-serialize** (tránh sai khác thứ tự key/format số).
- Message sai/thiếu chữ ký: backend loại bỏ; ESP32 loại bỏ + phát event `security_alert`.

Node.js tham khảo (đầy đủ trong `backend/server.js`):

```js
const crypto = require("crypto");
const hmac = (s) => crypto.createHmac("sha256", HMAC_SECRET).update(s).digest("hex");

// Ký (khi publish lệnh control)
const base = JSON.stringify(command);              // command chưa có sig
const signed = base.slice(0, -1) + `,"sig":"${hmac(base)}"}`;

// Xác minh (khi nhận telemetry/event)
const idx = raw.lastIndexOf(',"sig":"');
const sig = raw.slice(idx + 8, -2);
const body = raw.slice(0, idx) + "}";
const valid = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(body)));
const data = valid ? JSON.parse(body) : null;
```

### Chống replay (chiều control)

Lệnh điều khiển **phải có field `"ts"`** (epoch milliseconds, `Date.now()`).
ESP32 nhớ `ts` của lệnh gần nhất và **từ chối lệnh có `ts` nhỏ hơn hoặc bằng** —
kẻ nghe lén phát lại lệnh cũ (đúng chữ ký) vẫn bị loại, kèm event `security_alert`.
Lưu ý: gửi 2 lệnh cùng mili-giây thì lệnh sau bị coi là replay — thực tế không sao
vì mỗi request REST tạo `ts` riêng.

## 3. Topics

`{DEVICE_ID}` = `smarthome-phn-7f3a`

| Topic | Chiều | QoS/Retain | Nội dung |
|---|---|---|---|
| `smarthome/{DEVICE_ID}/telemetry` | ESP32 → backend | QoS 0 | JSON cảm biến + trạng thái, **mỗi 5 giây** + ngay sau mỗi lệnh điều khiển thành công |
| `smarthome/{DEVICE_ID}/event` | ESP32 → backend | QoS 0 | JSON sự kiện, phát ngay khi xảy ra |
| `smarthome/{DEVICE_ID}/status` | ESP32 → backend | **retained**, LWT | Chuỗi thô `online` / `offline` (không phải JSON). Broker tự phát `offline` khi ESP32 rớt mạng (Last Will) |
| `smarthome/{DEVICE_ID}/control` | backend → ESP32 | QoS 0 | JSON lệnh điều khiển |

Backend cần **subscribe 3 topic đầu** và **publish vào topic control**.

## 4. Message: Telemetry (ESP32 → backend, 5s/lần)

```json
{
  "api_key": "sk-smarthome-7f3a9d2e",
  "device_id": "smarthome-phn-7f3a",
  "timestamp": 123456,
  "sensors": {
    "temperature": 28.5,      // °C (DHT22)
    "humidity": 60.0,         // % (DHT22)
    "gas": 1200,              // 0-4095 (ADC), > 2500 = nguy cơ cháy
    "light": 800,             // 0-4095 (ADC), < 1000 = trời tối
    "motion": true            // PIR có người
  },
  "devices": {
    "ac": false,              // điều hòa bật/tắt
    "ac_temp": 25.0,          // nhiệt độ cài đặt điều hòa (16-30)
    "fan_speed": 1,           // 0 = tắt, 1-3 = mức gió
    "light_living": false,    // đèn phòng khách
    "light_bedroom": false,   // đèn phòng ngủ
    "door": "closed",         // "open" | "closed"  (cửa chính)
    "window": "closed",       // "open" | "closed"  (cửa sổ)
    "fire_alarm": false       // báo cháy đang kích hoạt
  },
  "sig": "3f2a...64 hex..."   // HMAC-SHA256, luôn đứng cuối
}
```

`timestamp` là `millis()` của ESP32 (ms từ lúc khởi động, không phải epoch) —
backend nên tự gắn thời gian nhận.

## 5. Message: Event (ESP32 → backend, phát ngay khi xảy ra)

```json
{
  "api_key": "sk-smarthome-7f3a9d2e",
  "device_id": "smarthome-phn-7f3a",
  "event": "fire_alarm",
  "detail": "triggered",
  "timestamp": 123456,
  "sig": "3f2a...64 hex..."
}
```

| `event` | `detail` | Khi nào phát |
|---|---|---|
| `boot` | `device connected to broker` | ESP32 (re)kết nối broker |
| `fire_alarm` | `triggered` / `cleared` | Phát hiện cháy / hết nguy hiểm — **nên đẩy notification** |
| `motion` | `detected` | PIR phát hiện chuyển động (chỉ phát ở sườn lên) |
| `door` | `open` / `closed` | Cửa chính đổi trạng thái (kể cả do tự động khi cháy) |
| `window` | `open` / `closed` | Cửa sổ đổi trạng thái |
| `control_applied` | `<device>:<action>` vd `fan:speed` | Ack — lệnh đã thực thi thành công |
| `control_rejected` | `<device>:<action>` | Lệnh có `device` không tồn tại |
| `security_alert` | `control message with invalid signature rejected` | Có lệnh sai/thiếu chữ ký HMAC — **nên log/cảnh báo** |
| `security_alert` | `control message with invalid api_key rejected` | Có lệnh sai api_key — **nên log/cảnh báo** |
| `security_alert` | `control message replay rejected` | Có lệnh bị phát lại (ts cũ) — **nên log/cảnh báo** |

## 6. Message: Control (backend → ESP32)

Publish vào `smarthome/{DEVICE_ID}/control`:

```json
{
  "api_key": "sk-smarthome-7f3a9d2e",
  "device": "fan",
  "action": "speed",
  "value": 2,
  "ts": 1783648764861,
  "sig": "3f2a...64 hex..."
}
```

`ts` = `Date.now()` (bắt buộc, chống replay). `sig` = HMAC-SHA256 ký trên JSON
chưa có sig (xem mục 2). Lệnh thiếu/sai `sig` hoặc `ts` cũ sẽ bị ESP32 bỏ qua.

| `device` | `action` hỗ trợ | `value` | Ghi chú |
|---|---|---|---|
| `fan` | `on` / `off` / `speed` / `auto` | 0–3 (chỉ với `speed`) | `on` = mức 2. Quạt auto tăng theo độ chênh nhiệt |
| `ac` | `on` / `off` / `set_temp` / `auto` | 16–30 (chỉ với `set_temp`) | `set_temp` không phá chế độ auto. Auto: bật khi nhiệt phòng > setpoint |
| `light_living` | `on` / `off` / `auto` | — | Auto: tối + có người |
| `light_bedroom` | `on` / `off` | — | |
| `door` | `open` / `close` | — | |
| `window` | `open` / `close` | — | |
| `alarm` | `on` / `off` | — | `on` = kích hoạt khẩn cấp: còi + mở cửa + quạt mức 3, tắt điều hòa |

**Hành vi cần biết:**
- `on`/`off`/`speed` sẽ **tắt chế độ tự động** của thiết bị đó; gửi `action: "auto"` để trả lại.
- Sau lệnh hợp lệ, ESP32 phát `control_applied` (ack) rồi publish ngay 1 bản telemetry mới —
  backend không cần đợi chu kỳ 5s để thấy trạng thái thay đổi.
- ESP32 **không trả lỗi** cho lệnh sai api_key (chống dò key), chỉ phát `security_alert`.
- Khi đang báo cháy, logic khẩn cấp ưu tiên — lệnh điều khiển thường có thể bị logic cháy ghi đè.

## 7. Xác nhận thiết bị sống

- Subscribe `smarthome/{DEVICE_ID}/status`: nhận `online` (retained — nhận được ngay khi
  subscribe kể cả ESP32 đã online từ trước) hoặc `offline` (LWT khi rớt mạng).
- Không nhận được telemetry > 15 giây cũng nên coi là mất kết nối.

## 8. Test không cần mạch

Có sẵn code tham khảo trong repo:
- `backend/broker.js` — broker local (Aedes): `cd backend && npm install && npm run broker`
- `backend/server.js` — backend mẫu Node.js đầy đủ (subscribe, validate api_key, REST wrapper) — **tham khảo, người làm backend tự quyết định công nghệ**
- `smart-home.postman_collection.json` — Postman collection của backend mẫu

Test nhanh bằng `mosquitto_pub`/MQTT Explorer: publish JSON control vào topic control
(nhớ kèm api_key) và xem telemetry/event đổ về.
