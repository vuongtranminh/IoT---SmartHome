/**
 * MQTT Broker local cho Smart Home Wokwi (dùng Aedes)
 *
 *  Chạy:  npm run broker   (cổng 1883)
 *
 *  Bảo mật tầng broker: bắt buộc username/password khi kết nối.
 *  (ESP32 và backend phải dùng đúng MQTT_USER / MQTT_PASS)
 *
 *  Broker in log mọi client kết nối + mọi message đi qua để dễ debug/demo.
 */
const aedes = require("aedes")();
const net = require("net");

const PORT = process.env.MQTT_PORT || 1883;
const MQTT_USER = process.env.MQTT_USER || "smarthome";
const MQTT_PASS = process.env.MQTT_PASS || "matkhau123";

// --- BẢO MẬT: xác thực username/password ---
aedes.authenticate = (client, username, password, callback) => {
  const ok = username === MQTT_USER && password?.toString() === MQTT_PASS;
  if (!ok) console.warn(`[AUTH] TỪ CHỐI client "${client.id}" (sai user/pass)`);
  const error = ok ? null : Object.assign(new Error("Auth failed"), { returnCode: 4 });
  callback(error, ok);
};

// --- Log để quan sát ---
aedes.on("client", (client) => console.log(`[+] Client kết nối   : ${client.id}`));
aedes.on("clientDisconnect", (client) => console.log(`[-] Client ngắt      : ${client.id}`));
aedes.on("subscribe", (subs, client) =>
  console.log(`[~] ${client?.id} subscribe: ${subs.map((s) => s.topic).join(", ")}`)
);
aedes.on("publish", (packet, client) => {
  if (!client) return; // bỏ qua message hệ thống ($SYS)
  const payload = packet.payload.toString();
  console.log(`[msg] ${packet.topic} <- ${client.id}: ${payload.slice(0, 120)}${payload.length > 120 ? "..." : ""}`);
});

net.createServer(aedes.handle).listen(PORT, () => {
  console.log(`MQTT broker chạy tại mqtt://localhost:${PORT}`);
  console.log(`User: ${MQTT_USER} | Pass: ${MQTT_PASS}`);
});
