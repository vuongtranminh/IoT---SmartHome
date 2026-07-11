import { Link } from 'react-router-dom';
import { Thermometer, Droplets, Wind, Sun, User, LogOut, Fingerprint, Shield, Wifi, WifiOff, ScrollText } from 'lucide-react';
import { SensorCard } from '../components/SensorCard';
import { DeviceControls } from '../components/DeviceControls';
import { EventsTimeline } from '../components/EventsTimeline';
import { TelemetryChart } from '../components/TelemetryChart';
import { ToastContainer } from '../components/ToastContainer';
import { Button } from '../components/ui/button';
import { useAuth } from '../hooks/useAuth';
import { useDevice } from '../hooks/useDevice';
import { api } from '../api/client';
import { startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';

export function Dashboard() {
  const { user, logout } = useAuth();
  const { online, latest, events, history, control, pending } = useDevice();
  const [pkMsg, setPkMsg] = useState('');

  const s = latest?.sensors || {};
  const d = latest?.devices || {};
  const gasWarn = (s.gas ?? 0) > 2500;
  const dark = (s.light ?? 4000) < 1000;

  async function registerPasskey() {
    setPkMsg('');
    try {
      const opts = await api.post('/auth/passkey/register/options').then((r) => r.data);
      const att = await startRegistration({ optionsJSON: opts });
      await api.post('/auth/passkey/register/verify', att);
      setPkMsg('✅ Đã đăng ký Passkey. Lần sau login bằng Face ID / Touch ID');
    } catch (e: any) {
      setPkMsg('❌ ' + (e?.message || e?.response?.data?.error || 'lỗi'));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">🏠 Smart Home Dashboard</h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {online ? <><Wifi className="w-3 h-3 text-emerald-400" /> ESP32 online</> : <><WifiOff className="w-3 h-3 text-red-400" /> ESP32 offline</>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 flex items-center gap-1"><User className="w-4 h-4" />{user?.username} ({user?.role})</span>
            {user?.role === 'admin' && (
              <Link to="/admin/audit">
                <Button variant="outline" size="sm"><ScrollText className="w-4 h-4 mr-1" /> Audit</Button>
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={registerPasskey}>
              <Fingerprint className="w-4 h-4 mr-1" /> Passkey
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-1" /> Đăng xuất
            </Button>
          </div>
        </div>
        {pkMsg && <div className="max-w-6xl mx-auto px-4 pb-2 text-sm">{pkMsg}</div>}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {d.fire_alarm && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center gap-3 animate-pulse">
            <Shield className="w-6 h-6 text-red-400" />
            <div>
              <p className="font-semibold text-red-300">🔥 CẢNH BÁO CHÁY</p>
              <p className="text-sm text-red-200">Còi + cửa mở tự động + quạt max. Điều hòa đã tắt.</p>
            </div>
          </div>
        )}

        {/* Sensors */}
        <section>
          <h2 className="text-sm uppercase text-slate-400 tracking-wider mb-3">Cảm biến</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SensorCard icon={Thermometer} label="Nhiệt độ" value={s.temperature?.toFixed(1)} unit="°C" />
            <SensorCard icon={Droplets} label="Độ ẩm" value={s.humidity?.toFixed(0)} unit="%" />
            <SensorCard icon={Wind} label="Gas" value={s.gas} status={gasWarn ? 'alert' : 'ok'} />
            <SensorCard icon={Sun} label="Ánh sáng" value={s.light} status={dark ? 'warn' : 'ok'} />
            <SensorCard icon={User} label="Chuyển động" value={s.motion === undefined ? undefined : (s.motion ? 'CÓ' : 'không')} status={s.motion ? 'warn' : 'ok'} />
          </div>
        </section>

        {/* Devices */}
        <section>
          <h2 className="text-sm uppercase text-slate-400 tracking-wider mb-3">Thiết bị</h2>
          <DeviceControls devices={d} control={control} disabled={!online} pending={pending} />
        </section>

        {/* Chart + Events */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <TelemetryChart points={history} />
          </div>
          <div>
            <EventsTimeline events={events} />
          </div>
        </section>
      </main>

      <ToastContainer />
    </div>
  );
}
