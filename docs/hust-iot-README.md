# 🏠 Smart Home - Mô phỏng nhà thông minh trên Wokwi (ESP32) + MQTT

Mô phỏng nhà thông minh gồm: **điều hòa, quạt, đèn, cửa chính, cửa sổ, báo cháy**.

> 👥 **Phân công**: repo này phụ trách **mạch + firmware + MQTT**. Người làm backend
> đọc **[MQTT_SPEC.md](MQTT_SPEC.md)** — tài liệu bàn giao đầy đủ giao tiếp MQTT
> (topic, format message, api_key). Thư mục `backend/` chỉ là code mẫu tham khảo.

## Kiến trúc

```
ESP32 (Wokwi) ──publish telemetry──▶ MQTT Broker ──subscribe──▶ Backend (Node.js)
ESP32 (Wokwi) ◀──subscribe control── MQTT Broker ◀──publish──── Backend (Node.js)
                                                                    ▲
                                              Postman/curl ──REST + x-api-key
```

- Broker: **local** `backend/broker.js` (Aedes, cổng 1883, có username/password).
  ESP32 gọi về qua `host.wokwi.internal` (= localhost khi chạy Wokwi trong VS Code).
  Nếu chạy trên wokwi.com thì đổi `MQTT_HOST` lại thành `broker.hivemq.com`, user/pass `NULL`.
- Topics:
  - `smarthome/{DEVICE_ID}/telemetry` — ESP32 đẩy dữ liệu cảm biến mỗi 5s
  - `smarthome/{DEVICE_ID}/event` — sự kiện thời gian thực (xem bảng dưới)
  - `smarthome/{DEVICE_ID}/control` — backend gửi lệnh điều khiển
  - `smarthome/{DEVICE_ID}/status` — `online`/`offline` (retained + LWT, broker tự phát `offline` khi ESP32 rớt mạng)

## 📤 Các message ESP32 export ra ngoài cho backend

**1. Telemetry** (định kỳ 5s + ngay sau mỗi lệnh điều khiển): toàn bộ cảm biến + trạng thái thiết bị (JSON ở cuối file).

**2. Status** (retained): chuỗi `online` / `offline`.

**3. Events** — publish ngay khi xảy ra:

| `event` | `detail` | Khi nào |
|---|---|---|
| `boot` | `device connected to broker` | ESP32 kết nối broker thành công |
| `fire_alarm` | `triggered` / `cleared` | Phát hiện cháy / hết nguy hiểm |
| `motion` | `detected` | PIR phát hiện chuyển động (sườn lên) |
| `door` | `open` / `closed` | Cửa chính đổi trạng thái |
| `window` | `open` / `closed` | Cửa sổ đổi trạng thái |
| `control_applied` | `fan:speed`, `door:open`… | Lệnh điều khiển đã thực thi (ack) |
| `control_rejected` | `xxx:yyy` | Lệnh có device không tồn tại |
| `security_alert` | `control message with invalid api_key rejected` | Có kẻ gửi lệnh sai api_key |

Định dạng event: `{ "api_key", "device_id", "event", "detail", "timestamp" }`

## 🔐 Bảo mật (API key)

| Lớp | Cơ chế |
|---|---|
| Kết nối broker | Broker yêu cầu **username/password** (`smarthome` / `matkhau123`) — client lạ không vào được |
| **Chữ ký HMAC-SHA256** | Mọi message MQTT có field `sig` (ký bằng `HMAC_SECRET`, secret không truyền qua mạng); message sai/thiếu chữ ký bị loại 2 chiều |
| **Chống replay** | Lệnh control phải có `ts` tăng dần; lệnh phát lại bị ESP32 từ chối + event `security_alert` |
| MQTT telemetry/event | ESP32 kèm `api_key` trong JSON; backend **loại bỏ** message sai key (và không lưu key vào dữ liệu) |
| MQTT control | Backend kèm `api_key` trong lệnh; ESP32 **từ chối thực thi** lệnh sai key + phát event `security_alert` |
| REST API backend | Mọi request `/api/*` phải có header `x-api-key`, sai → 401 |
| HTTP debug trên ESP32 | `POST /control` cũng yêu cầu `x-api-key` (header hoặc field trong body) |

**Cấu hình key** — 2 giá trị phải trùng nhau ở cả 2 phía, nên đổi thành chuỗi riêng của bạn:
- ESP32: `DEVICE_ID` và `API_KEY` ở đầu `src/main.cpp`
- Backend: biến môi trường `DEVICE_ID`, `API_KEY` (hoặc sửa mặc định trong `backend/server.js`)

> Lưu ý: broker public thì ai biết topic đều đọc được message (bao gồm api_key).
> Với đồ án mô phỏng là đủ; sản phẩm thật cần broker riêng + username/password + TLS (port 8883).

## Sơ đồ phần cứng

| Thành phần | Linh kiện Wokwi | GPIO |
|---|---|---|
| Nhiệt độ / độ ẩm | DHT22 | 15 |
| Khí gas / khói (mô phỏng bằng biến trở) | Potentiometer | 34 |
| Ánh sáng | LDR module | 35 |
| Chuyển động | PIR | 13 |
| Nút test báo cháy | Pushbutton | 4 |
| Cửa chính | Servo (đỏ) | 18 |
| Cửa sổ | Servo (xanh) | 19 |
| Đèn phòng khách | LED vàng | 25 |
| Đèn phòng ngủ | LED cam | 26 |
| Quạt | LED xanh lá (PWM theo mức gió) | 27 |
| Điều hòa | LED xanh dương | 14 |
| Đèn báo cháy | LED đỏ | 23 |
| Còi báo cháy | Buzzer | 12 |

## Logic tự động

- **Điều hòa**: nhiệt độ cài đặt 16–30°C (mặc định 25°C, đổi qua `set_temp`);
  auto bật khi nhiệt độ phòng > nhiệt độ cài đặt
- **Quạt**: 4 mức gió 0–3; auto tăng tốc theo độ chênh nhiệt (>2°C: mức 1, >4°C: mức 2, >6°C: mức 3)
- **Đèn phòng khách**: auto bật khi trời tối (LDR) **và** có người (PIR)
- **Báo cháy**: gas > ngưỡng hoặc nhấn nút đỏ → còi + đèn đỏ + **tự mở cửa chính,
  cửa sổ, quạt mức 3, tắt điều hòa**
- Điều khiển tay qua API sẽ tắt auto của thiết bị đó; gửi `action: "auto"` để trả lại.

## Cách chạy

1. **Build firmware**: `pio run` (đường dẫn đầy đủ:
   `C:\Users\ngan\AppData\Roaming\Python\Python313\Scripts\pio.exe run`)
2. **Chạy MQTT broker** (terminal 1): `cd backend && npm install && npm run broker` (cổng 1883)
3. **Chạy backend** (terminal 2): `cd backend && npm start` (cổng 3000)
4. **Chạy mô phỏng**: mở `diagram.json` trong VS Code → Start Simulation
5. Serial monitor hiện `[MQTT] Ket noi host.wokwi.internal:1883 ... OK`,
   backend log `ESP32 ONLINE ✅` là đã thông.

| Method | Endpoint mới | Chức năng |
|---|---|---|
| GET | `/api/events` | Sự kiện thời gian thực (lọc: `?type=fire_alarm`) |
| GET | `/api/alerts` | `{ online, fire_alarm, gas_level, last_security_alert }` |

## REST API (backend, cổng 3000)

Mọi request cần header: `x-api-key: sk-smarthome-7f3a9d2e`

| Method | Endpoint | Chức năng |
|---|---|---|
| GET | `/api/latest` | Telemetry mới nhất |
| GET | `/api/history` | Lịch sử (tối đa 500 bản ghi) |
| GET | `/api/devices/status` | `{ online, ...telemetry mới nhất }` |
| POST | `/api/devices/:device` | Gửi lệnh điều khiển qua MQTT |

```bash
KEY="x-api-key: sk-smarthome-7f3a9d2e"

# Quạt mức 3
curl -X POST http://localhost:3000/api/devices/fan -H "$KEY" -H "Content-Type: application/json" -d '{"action":"speed","value":3}'

# Điều hòa 24°C
curl -X POST http://localhost:3000/api/devices/ac -H "$KEY" -H "Content-Type: application/json" -d '{"action":"set_temp","value":24}'

# Mở cửa chính
curl -X POST http://localhost:3000/api/devices/door -H "$KEY" -H "Content-Type: application/json" -d '{"action":"open"}'

# Xem dữ liệu
curl http://localhost:3000/api/latest -H "$KEY"
```

`device`: `fan` | `ac` | `light_living` | `light_bedroom` | `door` | `window` | `alarm`
`action`: `on` | `off` | `open` | `close` | `auto` | `speed` (quạt) | `set_temp` (điều hòa)
`value` : tốc độ quạt 0–3, hoặc nhiệt độ điều hòa 16–30

Import `smart-home.postman_collection.json` vào Postman để có sẵn toàn bộ request
(đã cấu hình tự gắn `x-api-key`, kèm request test key sai → 401).

## JSON telemetry (ESP32 publish mỗi 5s)

```json
{
  "api_key": "sk-smarthome-7f3a9d2e",
  "device_id": "smarthome-phn-7f3a",
  "sensors": { "temperature": 28.5, "humidity": 60, "gas": 1200, "light": 800, "motion": true },
  "devices": {
    "ac": false, "ac_temp": 25, "fan_speed": 1,
    "light_living": false, "light_bedroom": false,
    "door": "closed", "window": "closed", "fire_alarm": false
  }
}
```

## Cách test trên simulator

- **Điều hòa/quạt**: click DHT22, kéo nhiệt độ > setpoint → quạt tăng mức dần, điều hòa bật
- **Báo cháy**: xoay biến trở (gas) lên cao hoặc nhấn nút đỏ → cửa + cửa sổ tự mở, quạt max
- **Đèn tự động**: kéo LDR về tối + click PIR giả lập có người
- **Điều khiển từ backend**: gửi request Postman/curl, LED/servo đổi trạng thái gần như tức thời
- **Test bảo mật**: đổi `api_key` trong Postman thành chuỗi sai → backend trả 401;
  publish lệnh sai key vào topic control → serial ESP32 in `TU CHOI: api_key sai`
