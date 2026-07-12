/*
 * ===============================================================
 *  SMART HOME - Mô phỏng nhà thông minh trên Wokwi (ESP32)
 * ===============================================================
 *  Thiết bị:
 *   - Điều hòa (LED xanh dương, GPIO 14) - có nhiệt độ cài đặt 16-30°C,
 *     chế độ auto bật khi nhiệt độ phòng > nhiệt độ cài đặt
 *   - Quạt      (LED xanh lá,   GPIO 27) - 4 mức gió 0-3 (PWM độ sáng LED)
 *   - Đèn phòng khách (LED vàng, GPIO 25) - tự bật khi tối + có người
 *   - Đèn phòng ngủ   (LED cam,  GPIO 26)
 *   - Cửa chính (Servo, GPIO 18)
 *   - Cửa sổ    (Servo, GPIO 19) - tự mở khi có cháy
 *   - Báo cháy  (LED đỏ GPIO 23 + Còi GPIO 12) - theo cảm biến gas
 *
 *  Cảm biến:
 *   - DHT22 (GPIO 15): nhiệt độ, độ ẩm
 *   - Gas/khói - mô phỏng bằng biến trở (GPIO 34)
 *   - Ánh sáng LDR (GPIO 35)
 *   - Chuyển động PIR (GPIO 13)
 *   - Nút test báo cháy (GPIO 4)
 *
 *  Giao tiếp: MQTT (broker local broker.js, có user/pass) + HTTP debug
 *   - Publish telemetry : smarthome/{DEVICE_ID}/telemetry (5s/lần)
 *   - Publish sự kiện    : smarthome/{DEVICE_ID}/event (boot, fire_alarm,
 *     motion, door, window, control_applied/rejected, security_alert)
 *   - Subscribe điều khiển: smarthome/{DEVICE_ID}/control
 *   - Trạng thái online  : smarthome/{DEVICE_ID}/status (retained + LWT)
 *
 *  Bảo mật (3 lớp tầng message + user/pass tầng broker):
 *   1. Chữ ký HMAC-SHA256: mọi message có field "sig" cuối JSON,
 *      ký bằng HMAC_SECRET (secret không bao giờ truyền qua mạng).
 *      Message sai/thiếu chữ ký bị loại + phát event security_alert.
 *   2. api_key trong JSON (defense in depth).
 *   3. Chống replay: lệnh điều khiển phải có "ts" tăng dần,
 *      lệnh phát lại (ts cũ) bị từ chối.
 * ===============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include "mbedtls/md.h"

// ----------------- CẤU HÌNH -----------------
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";

// !!! Đổi 3 giá trị này thành chuỗi riêng của bạn (trùng với backend) !!!
const char* DEVICE_ID   = "smarthome-phn-7f3a";
const char* API_KEY     = "sk-smarthome-7f3a9d2e";
const char* HMAC_SECRET = "hmac-secret-phn-2b8c4e6f"; // key ký HMAC-SHA256, KHÔNG truyền qua mạng

// Broker local trên máy bạn (broker.js). host.wokwi.internal = localhost
// khi chạy Wokwi trong VS Code. Chạy trên wokwi.com thì đổi lại thành
// "broker.hivemq.com" với user/pass NULL.
const char* MQTT_HOST = "host.wokwi.internal";
const int   MQTT_PORT = 1883;
const char* MQTT_USER = "smarthome";
const char* MQTT_PASS = "matkhau123";

const unsigned long TELEMETRY_INTERVAL = 5000; // ms

// Topics
String topicTelemetry = String("smarthome/") + DEVICE_ID + "/telemetry";
String topicControl   = String("smarthome/") + DEVICE_ID + "/control";
String topicStatus    = String("smarthome/") + DEVICE_ID + "/status";
String topicEvent     = String("smarthome/") + DEVICE_ID + "/event";

// ----------------- CHÂN GPIO -----------------
#define PIN_DHT        15
#define PIN_GAS        34
#define PIN_LDR        35
#define PIN_PIR        13
#define PIN_BTN_FIRE    4
#define PIN_SERVO_DOOR 18
#define PIN_SERVO_WIN  19
#define PIN_LED_LIVING 25
#define PIN_LED_BED    26
#define PIN_FAN        27
#define PIN_AC         14
#define PIN_LED_ALARM  23
#define PIN_BUZZER     12

// ----------------- NGƯỠNG TỰ ĐỘNG -----------------
const int GAS_THRESHOLD  = 2500;  // ADC > 2500 -> báo cháy
// LDR Wokwi (wokwi-photoresistor-sensor) INVERT — Lux thấp (tối) → AO cao,
// Lux cao (sáng) → AO thấp. Vì vậy "tối" = ADC > ngưỡng, không phải ADC < ngưỡng.
const int DARK_THRESHOLD = 3000;  // ADC > 3000 -> trời tối

// ----------------- ĐỐI TƯỢNG -----------------
DHT dht(PIN_DHT, DHT22);
Servo servoDoor, servoWindow;
WebServer server(80);
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ----------------- TRẠNG THÁI -----------------
struct DeviceState {
  bool light_living = false;
  bool light_bedroom = false;
  int  fan_speed = 0;        // 0 = tắt, 1..3 = tốc độ gió
  bool ac = false;
  float ac_temp = 25.0;      // nhiệt độ cài đặt điều hòa (16-30°C)
  bool door_open = false;
  bool window_open = false;
  bool fire_alarm = false;
  // true = tự động, false = điều khiển tay (qua API)
  bool auto_ac = true;
  bool auto_fan = true;
  bool auto_light = true;
  bool alarm_manual = false;  // true = user vừa bấm alarm on/off tay → autoLogic không được ghi đè
} state;

struct SensorData {
  float temperature = 0;
  float humidity = 0;
  int gas = 0;
  int light = 0;
  bool motion = false;
} sensors;

unsigned long lastTelemetry = 0;
unsigned long lastSensorRead = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastMotionAt = 0;    // millis lúc PIR trigger — giữ đèn sáng 10s sau lần motion cuối
bool hasMotionHistory = false;      // false khi chưa từng có motion (tránh sáng đèn oan lúc boot)
uint64_t lastControlTs = 0;         // chống replay: chỉ nhận lệnh có ts mới hơn lệnh trước

const unsigned long MOTION_HOLD_MS = 10000;  // giữ "còn người" 10s sau lần motion cuối

// ================================================================
//  HMAC-SHA256 - ký & xác minh message (mbedtls có sẵn trong ESP32)
//
//  Quy ước: field "sig" luôn đứng CUỐI JSON. Chữ ký tính trên chuỗi
//  JSON gốc sau khi bỏ đoạn `,"sig":"..."` — thao tác trên byte thô
//  nên không lo khác biệt thứ tự key/format số giữa các ngôn ngữ.
// ================================================================
String hmacSha256(const String& msg) {
  byte out[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_hmac(info,
                  (const byte*)HMAC_SECRET, strlen(HMAC_SECRET),
                  (const byte*)msg.c_str(), msg.length(), out);
  String hex;
  hex.reserve(64);
  for (int i = 0; i < 32; i++) {
    if (out[i] < 16) hex += '0';
    hex += String(out[i], HEX);
  }
  return hex;
}

// Nhận JSON (kết thúc bằng '}') -> trả về JSON đã chèn sig vào cuối
String signPayload(const String& json) {
  String sig = hmacSha256(json);
  return json.substring(0, json.length() - 1) + ",\"sig\":\"" + sig + "\"}";
}

// Kiểm tra chữ ký của message nhận được; nếu hợp lệ, payload được
// thay bằng JSON gốc (đã bỏ sig) để parse tiếp
bool verifySignature(String& payload) {
  int idx = payload.lastIndexOf(",\"sig\":\"");
  if (idx < 0 || !payload.endsWith("\"}")) return false;
  String sig  = payload.substring(idx + 8, payload.length() - 2);
  String base = payload.substring(0, idx) + "}";
  if (sig != hmacSha256(base)) return false;
  payload = base;
  return true;
}

// ================================================================
//  KÊNH SỰ KIỆN (event) - export thông tin thời gian thực cho backend
// ================================================================
void publishEvent(const char* event, const char* detail) {
  if (!mqtt.connected()) return;
  JsonDocument doc;
  doc["api_key"]   = API_KEY;
  doc["device_id"] = DEVICE_ID;
  doc["event"]     = event;
  if (detail && detail[0]) doc["detail"] = detail;
  doc["timestamp"] = millis();
  String out;
  serializeJson(doc, out);
  mqtt.publish(topicEvent.c_str(), signPayload(out).c_str());
  Serial.printf("[Event] %s %s\n", event, detail ? detail : "");
}

// ================================================================
//  ĐIỀU KHIỂN THIẾT BỊ
// ================================================================
// Chuẩn servo cho cửa:
//   0°  = ĐÓNG: horn song song khung cửa (cánh khép khít)
//   90° = MỞ:  horn vuông góc (cánh bật ra mở hết cỡ)
void setDoor(bool open) {
  if (state.door_open != open) publishEvent("door", open ? "open" : "closed");
  state.door_open = open;
  servoDoor.write(open ? 90 : 0);
}

void setWindow(bool open) {
  if (state.window_open != open) publishEvent("window", open ? "open" : "closed");
  state.window_open = open;
  servoWindow.write(open ? 90 : 0);
}

// Tốc độ quạt 0-3 -> độ sáng LED (PWM) để nhìn thấy mức gió
void setFanSpeed(int speed) {
  state.fan_speed = constrain(speed, 0, 3);
  const int duty[] = { 0, 85, 170, 255 };
  analogWrite(PIN_FAN, duty[state.fan_speed]);
}

void setAC(bool on)         { state.ac = on;            digitalWrite(PIN_AC, on); }

void setACTemp(float temp)  { state.ac_temp = constrain(temp, 16.0f, 30.0f); }

void setLightLiving(bool o) { state.light_living = o;   digitalWrite(PIN_LED_LIVING, o); }
void setLightBedroom(bool o){ state.light_bedroom = o;  digitalWrite(PIN_LED_BED, o); }

void setFireAlarm(bool on) {
  if (state.fire_alarm != on) publishEvent("fire_alarm", on ? "triggered" : "cleared");
  state.fire_alarm = on;
  digitalWrite(PIN_LED_ALARM, on);
  if (on) {
    // Khẩn cấp: mở cửa thoát hiểm + cửa sổ + quạt hút khói + tắt AC + buzzer.
    // Đưa AC + quạt về manual mode để sau khi hết cháy, autoLogic không tự bật lại
    // (giữ nguyên trạng thái tương tự cửa — mở ra, không tự đóng).
    state.auto_ac = false;
    state.auto_fan = false;
    setDoor(true);
    setWindow(true);
    setFanSpeed(3);
    setAC(false);
    ledcWriteTone(5, 2500);            // 2500Hz — dễ nghe cho piezo
    ledcWrite(5, 512);                  // 50% duty cycle (10-bit: max=1023)
  } else {
    ledcWrite(5, 0);                    // tắt buzzer; cửa/sổ/AC/quạt GIỮ NGUYÊN
  }
}

// ================================================================
//  ĐỌC CẢM BIẾN + LOGIC TỰ ĐỘNG
// ================================================================
void readSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) sensors.temperature = t;
  if (!isnan(h)) sensors.humidity = h;
  sensors.gas    = analogRead(PIN_GAS);
  sensors.light  = analogRead(PIN_LDR);

  bool motion = digitalRead(PIN_PIR);
  if (motion && !sensors.motion) publishEvent("motion", "detected");
  if (motion) { lastMotionAt = millis(); hasMotionHistory = true; }  // reset hold timer + mark đã có motion
  sensors.motion = motion;

  // Debug log giá trị cảm biến mỗi 5s để dễ tune ngưỡng auto logic
  static unsigned long lastSensorLog = 0;
  if (millis() - lastSensorLog >= 5000) {
    lastSensorLog = millis();
    unsigned long sinceMotion = millis() - lastMotionAt;
    bool holding = hasMotionHistory && sinceMotion < MOTION_HOLD_MS;
    Serial.printf("[Sensors] temp=%.1f hum=%.1f gas=%d light=%d motion=%d hold=%d(%lus) btn=%d | auto: ac=%d fan=%d light=%d\n",
                  sensors.temperature, sensors.humidity, sensors.gas, sensors.light, sensors.motion,
                  holding, hasMotionHistory ? sinceMotion / 1000 : 0,
                  digitalRead(PIN_BTN_FIRE),   // 0 = đang bấm, 1 = thả (INPUT_PULLUP)
                  state.auto_ac, state.auto_fan, state.auto_light);
  }
}

void autoLogic() {
  // --- Báo cháy: gas vượt ngưỡng hoặc nhấn nút test ---
  bool fireDetected = (sensors.gas > GAS_THRESHOLD) || (digitalRead(PIN_BTN_FIRE) == LOW);

  // 3 trường hợp:
  //  1) Sensor phát hiện cháy thật → luôn bật (safety, override cả manual off)
  //     và reset alarm_manual về false vì đã có sự kiện thật sự.
  //  2) Không phát hiện cháy, alarm hiện đang bật do sensor auto (alarm_manual=false)
  //     → tắt.
  //  3) alarm_manual=true → tôn trọng lệnh user, không đụng đến.
  if (fireDetected && !state.fire_alarm) {
    Serial.println("!!! PHAT HIEN CHAY - KICH HOAT BAO DONG !!!");
    state.alarm_manual = false;
    setFireAlarm(true);
  } else if (!fireDetected && state.fire_alarm && !state.alarm_manual) {
    Serial.println("Het nguy hiem - tat bao dong");
    setFireAlarm(false);
  }
  if (state.fire_alarm) return; // đang cháy thì bỏ qua logic thường

  // --- Điều hòa: bật khi nhiệt độ phòng cao hơn nhiệt độ cài đặt ---
  if (state.auto_ac) setAC(sensors.temperature > state.ac_temp);

  // --- Quạt: tốc độ tăng dần theo độ chênh nhiệt ---
  if (state.auto_fan) {
    float diff = sensors.temperature - state.ac_temp;
    int speed = 0;
    if (diff > 6)      speed = 3;
    else if (diff > 4) speed = 2;
    else if (diff > 2) speed = 1;
    setFanSpeed(speed);
  }

  // --- Đèn phòng khách: tối VÀ có chuyển động (motion hold 10s) ---
  // PIR chỉ giữ HIGH ~2s khi trigger → mở rộng "còn người" = 10s sau lần
  // trigger cuối để đèn không tắt bất tiện khi người đứng yên.
  // LDR Wokwi INVERT: Lux thấp (tối) → ADC cao → dùng `light > DARK_THRESHOLD`.
  if (state.auto_light) {
    bool personPresent = sensors.motion ||
                         (hasMotionHistory && millis() - lastMotionAt < MOTION_HOLD_MS);
    setLightLiving(sensors.light > DARK_THRESHOLD && personPresent);
  }
}

// ================================================================
//  JSON TRẠNG THÁI
// ================================================================
String buildStatusJson(bool withApiKey) {
  JsonDocument doc;
  if (withApiKey) doc["api_key"] = API_KEY; // backend dùng để xác thực telemetry
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = millis();

  JsonObject s = doc["sensors"].to<JsonObject>();
  s["temperature"] = sensors.temperature;
  s["humidity"]    = sensors.humidity;
  s["gas"]         = sensors.gas;
  s["light"]       = sensors.light;
  s["motion"]      = sensors.motion;

  JsonObject d = doc["devices"].to<JsonObject>();
  d["ac"]                = state.ac;
  d["ac_temp"]           = state.ac_temp;
  d["ac_auto"]           = state.auto_ac;         // AUTO mode flag cho UI hiển thị badge
  d["fan_speed"]         = state.fan_speed;
  d["fan_auto"]          = state.auto_fan;
  d["light_living"]      = state.light_living;
  d["light_living_auto"] = state.auto_light;
  d["light_bedroom"]     = state.light_bedroom;
  d["door"]              = state.door_open ? "open" : "closed";
  d["window"]            = state.window_open ? "open" : "closed";
  d["fire_alarm"]        = state.fire_alarm;

  String out;
  serializeJson(doc, out);
  return out;
}

// ================================================================
//  XỬ LÝ LỆNH ĐIỀU KHIỂN (dùng chung cho MQTT + HTTP)
// ================================================================
bool applyControl(const String& device, const String& action, float value) {
  bool on = (action == "on" || action == "open");

  if (device == "fan") {
    if (action == "auto")        state.auto_fan = true;
    else if (action == "manual") state.auto_fan = false;   // chỉ tắt auto, giữ nguyên state
    else if (action == "speed") {
      state.auto_fan = false;
      setFanSpeed((int)value);
    } else {
      state.auto_fan = false;
      setFanSpeed(on ? 2 : 0); // on/off: bật mặc định mức 2
    }
  } else if (device == "ac") {
    if (action == "auto")        state.auto_ac = true;
    else if (action == "manual") state.auto_ac = false;
    else if (action == "set_temp") {
      setACTemp(value); // đổi nhiệt độ cài đặt, giữ nguyên chế độ auto/tay
    } else {
      state.auto_ac = false;
      setAC(on);
    }
  } else if (device == "light_living") {
    if (action == "auto")        state.auto_light = true;
    else if (action == "manual") state.auto_light = false;
    else { state.auto_light = false; setLightLiving(on); }
  } else if (device == "light_bedroom") {
    setLightBedroom(on);
  } else if (device == "door") {
    setDoor(on);
  } else if (device == "window") {
    setWindow(on);
  } else if (device == "alarm") {
    state.alarm_manual = true;   // user chủ động bấm → khóa autoLogic không ghi đè
    setFireAlarm(on);
  } else {
    return false;
  }
  Serial.printf("[Control] %s -> %s (value=%.1f)\n", device.c_str(), action.c_str(), value);
  return true;
}

// ================================================================
//  MQTT
// ================================================================
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String raw((const char*)payload, length);

  // --- BẢO MẬT 1: xác minh chữ ký HMAC-SHA256 ---
  if (!verifySignature(raw)) {
    Serial.println("[MQTT] TU CHOI: chu ky HMAC sai hoac thieu!");
    publishEvent("security_alert", "control message with invalid signature rejected");
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, raw)) {
    Serial.println("[MQTT] Bo qua: JSON khong hop le");
    return;
  }

  // --- BẢO MẬT 2: kiểm tra api_key ---
  const char* key = doc["api_key"] | "";
  if (strcmp(key, API_KEY) != 0) {
    Serial.println("[MQTT] TU CHOI: api_key sai hoac thieu!");
    publishEvent("security_alert", "control message with invalid api_key rejected");
    return;
  }

  // --- BẢO MẬT 3: chống replay - ts phải mới hơn lệnh đã nhận trước đó ---
  uint64_t ts = doc["ts"] | (uint64_t)0;
  if (ts <= lastControlTs) {
    Serial.println("[MQTT] TU CHOI: ts cu (nghi replay attack)!");
    publishEvent("security_alert", "control message replay rejected");
    return;
  }
  lastControlTs = ts;

  String device = doc["device"] | "";
  String action = doc["action"] | "";
  float value   = doc["value"] | 0.0f;

  if (applyControl(device, action, value)) {
    // Báo backend: lệnh đã thực thi (ack) + trạng thái mới tức thời
    String detail = device + ":" + action;
    publishEvent("control_applied", detail.c_str());
    mqtt.publish(topicTelemetry.c_str(), signPayload(buildStatusJson(true)).c_str());
  } else {
    String detail = device + ":" + action;
    publishEvent("control_rejected", detail.c_str());
  }
}

void mqttReconnect() {
  if (mqtt.connected() || millis() - lastMqttAttempt < 5000) return;
  lastMqttAttempt = millis();

  String clientId = String(DEVICE_ID) + "-" + String((uint32_t)esp_random(), HEX);
  Serial.printf("[MQTT] Ket noi %s:%d ... ", MQTT_HOST, MQTT_PORT);

  // LWT: broker tự phát "offline" nếu ESP32 rớt mạng
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                   topicStatus.c_str(), 1, true, "offline")) {
    Serial.println("OK");
    mqtt.publish(topicStatus.c_str(), "online", true);
    mqtt.subscribe(topicControl.c_str());
    Serial.printf("[MQTT] Subscribe: %s\n", topicControl.c_str());
    publishEvent("boot", "device connected to broker");
  } else {
    Serial.printf("that bai, rc=%d\n", mqtt.state());
  }
}

void sendTelemetry() {
  if (!mqtt.connected()) return;
  bool ok = mqtt.publish(topicTelemetry.c_str(), signPayload(buildStatusJson(true)).c_str());
  Serial.printf("[Telemetry] MQTT %s -> %s\n", topicTelemetry.c_str(), ok ? "OK" : "LOI");
}

// ================================================================
//  HTTP SERVER NỘI BỘ (debug trong mạng LAN, không bắt buộc)
// ================================================================
void handleStatus() {
  server.send(200, "application/json", buildStatusJson(false));
}

void handleControl() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  // HTTP cũng yêu cầu api_key (header x-api-key hoặc field trong body)
  String key = server.header("x-api-key");
  if (key.length() == 0) key = doc["api_key"] | "";
  if (key != API_KEY) {
    server.send(401, "application/json", "{\"error\":\"invalid api key\"}");
    return;
  }

  String device = doc["device"] | "";
  String action = doc["action"] | "";
  float value   = doc["value"] | 0.0f;

  if (applyControl(device, action, value)) {
    server.send(200, "application/json", buildStatusJson(false));
  } else {
    server.send(404, "application/json", "{\"error\":\"unknown device\"}");
  }
}

void setupServer() {
  const char* headers[] = { "x-api-key" };
  server.collectHeaders(headers, 1);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/control", HTTP_POST, handleControl);
  server.onNotFound([]() {
    server.send(404, "application/json", "{\"error\":\"not found\"}");
  });
  server.begin();
  Serial.println("HTTP server chay tren cong 80");
}

// ================================================================
//  SETUP & LOOP
// ================================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_LIVING, OUTPUT);
  pinMode(PIN_LED_BED, OUTPUT);
  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_AC, OUTPUT);
  pinMode(PIN_LED_ALARM, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_BTN_FIRE, INPUT_PULLUP);

  dht.begin();
  servoDoor.attach(PIN_SERVO_DOOR);
  servoWindow.attach(PIN_SERVO_WIN);
  setDoor(false);
  setWindow(false);

  // Buzzer wokwi-buzzer = passive piezo → cần PWM. LEDC channel 5 (tránh servo channels 0-3)
  ledcSetup(5, 2500, 10);              // 2500Hz, 10-bit resolution
  ledcAttachPin(PIN_BUZZER, 5);
  ledcWrite(5, 0);

  Serial.print("Ket noi WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Da ket noi! IP: ");
  Serial.println(WiFi.localIP());

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(2048);  // telemetry JSON + sig = ~500 byte, để dư safe
  mqtt.setKeepAlive(30);     // 30s keep-alive (default 15s hơi ngắn)
  mqtt.setSocketTimeout(20); // 20s socket timeout

  setupServer();
}

void loop() {
  server.handleClient();
  mqttReconnect();
  mqtt.loop();

  unsigned long now = millis();

  // Đọc nút test cháy edge-triggered (không đợi autoLogic 1s → bắt được click ngắn)
  static bool lastBtnState = HIGH;
  bool btnState = digitalRead(PIN_BTN_FIRE);
  if (lastBtnState == HIGH && btnState == LOW) {
    // Cạnh xuống — nút vừa được nhấn
    Serial.println("[BTN] Nut test bao chay duoc bam -> KICH HOAT ALARM");
    state.alarm_manual = false;   // tự động → autoLogic có thể tắt khi hết nguy hiểm
    setFireAlarm(true);
  }
  lastBtnState = btnState;

  // sensor + autoLogic — 1s/lần
  if (now - lastSensorRead >= 1000) {
    lastSensorRead = now;
    readSensors();
    autoLogic();
  }

  // Telemetry định kỳ — 5s/lần. Nhưng nếu quá 8s chưa gửi (do MQTT bận),
  // vẫn cố gửi tiếp để backend không timeout offline.
  if (now - lastTelemetry >= TELEMETRY_INTERVAL) {
    lastTelemetry = now;
    sendTelemetry();
  }

  // Heartbeat log mỗi 10s — debug loop có chạy không, free heap
  static unsigned long lastHeartbeat = 0;
  if (now - lastHeartbeat >= 10000) {
    lastHeartbeat = now;
    Serial.printf("[Heartbeat] up=%lus wifi=%d mqtt=%d heap=%u\n",
                  now / 1000,
                  WiFi.status() == WL_CONNECTED,
                  mqtt.connected(),
                  ESP.getFreeHeap());
  }
}
