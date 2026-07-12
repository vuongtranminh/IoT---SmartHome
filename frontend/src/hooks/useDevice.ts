import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { getSocket } from '../lib/socket';
import { toast } from '../lib/toast';
import type { Telemetry, DeviceEvent } from '../types';

// Nhãn tiếng Việt cho từng device để toast dễ đọc
const LABEL: Record<string, string> = {
  fan: 'Quạt',
  ac: 'Điều hòa',
  light_living: 'Đèn phòng khách',
  light_bedroom: 'Đèn phòng ngủ',
  door: 'Cửa chính',
  window: 'Cửa sổ',
  alarm: 'Báo cháy',
};

const ACK_TIMEOUT_MS = 3500;   // ESP32 phải ack trong 3.5s, sau đó coi là fail

// Danh sách promise đang chờ ack — key = device (mỗi thời điểm chỉ có 1 pending / device)
type PendingAck = { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const pendingAcks = new Map<string, PendingAck>();

// Khi backend emit event `control_applied` detail="fan:speed" → resolve ack đang chờ cho device đó
function ackDevice(device: string) {
  const p = pendingAcks.get(device);
  if (!p) return;
  clearTimeout(p.timer);
  pendingAcks.delete(device);
  p.resolve();
}
function rejectDevice(device: string, reason: string) {
  const p = pendingAcks.get(device);
  if (!p) return;
  clearTimeout(p.timer);
  pendingAcks.delete(device);
  p.reject(new Error(reason));
}

export function useDevice() {
  const [online, setOnline] = useState(false);
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    api.get('/devices/status').then((r) => {
      setOnline(!!r.data.online);
      if (r.data.sensors) setLatest(r.data);
    });
    api.get('/events?limit=30').then((r) => setEvents(r.data));
    api.get('/history?limit=60').then((r) => setHistory(r.data));

    const s = getSocket();
    const onTelemetry = (t: Telemetry) => {
      setLatest(t);
      setOnline(true);
      setHistory((h) => [...h.slice(-59), t]);
    };
    const onEvent = (e: DeviceEvent) => {
      setEvents((old) => [e, ...old].slice(0, 30));

      // Nếu là ack "control_applied" → resolve promise chờ + hiện toast success
      if (e.event === 'control_applied' && e.detail) {
        const device = e.detail.split(':')[0];   // "fan:speed" → "fan"
        ackDevice(device);
      }
      if (e.event === 'control_rejected' && e.detail) {
        const device = e.detail.split(':')[0];
        rejectDevice(device, 'ESP32 từ chối lệnh');
      }
      if (e.event === 'security_alert') {
        // Cảnh báo bảo mật — hiện toast cho user biết
        toast.error(`🚨 Bảo mật: ${e.detail || 'security alert'}`);
      }
    };
    const onStatus = (st: { online: boolean }) => {
      setOnline(st.online);
      if (!st.online) {
        // ESP32 offline → fail hết pending acks
        pendingAcks.forEach((_, dev) => rejectDevice(dev, 'ESP32 offline'));
      }
    };

    s.on('device:telemetry', onTelemetry);
    s.on('device:event', onEvent);
    s.on('device:status', onStatus);
    return () => {
      s.off('device:telemetry', onTelemetry);
      s.off('device:event', onEvent);
      s.off('device:status', onStatus);
    };
  }, []);

  // control(device, action, value) — POST + chờ ack + toast
  const control = useCallback(async (device: string, action: string, value?: number) => {
    // Debounce: đang chờ ack cho device này → bỏ qua click mới
    if (pendingRef.current[device]) {
      toast.info(`Đang chờ ${LABEL[device] || device}, vui lòng đợi…`);
      return;
    }

    setPending((p) => ({ ...p, [device]: true }));

    try {
      // Tạo promise chờ ack
      const ackPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingAcks.delete(device);
          reject(new Error('timeout'));
        }, ACK_TIMEOUT_MS);
        pendingAcks.set(device, { resolve, reject, timer });
      });

      // POST — nếu backend từ chối (503 offline, 429 rate limit) → throw
      await api.post(`/devices/${device}`, { action, value });

      // Chờ ESP32 ack (control_applied event qua Socket.IO)
      await ackPromise;

      // Success
      const verb = action === 'on' || action === 'open' ? 'bật' :
                   action === 'off' || action === 'close' ? 'tắt' :
                   action === 'speed' ? `chỉnh mức ${value}` :
                   action === 'set_temp' ? `đặt ${value}°C` :
                   action === 'auto' ? 'bật chế độ Auto' :
                   action === 'manual' ? 'tắt chế độ Auto' : action;
      toast.success(`${LABEL[device] || device}: ${verb} thành công`);
    } catch (e: any) {
      const msg = e?.response?.status === 429 ? 'quá nhiều lệnh, chờ 1 phút'
                : e?.response?.status === 503 ? 'ESP32 offline'
                : e?.message === 'timeout' ? 'ESP32 không phản hồi (timeout 3s)'
                : e?.message || 'lỗi';
      toast.error(`${LABEL[device] || device}: ${msg}`);
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[device];
        return next;
      });
    }
  }, []);

  return { online, latest, events, history, control, pending };
}
