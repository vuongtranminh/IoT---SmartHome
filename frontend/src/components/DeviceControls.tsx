import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Fan, Snowflake, Lightbulb, DoorOpen, Wind, Siren, Bed, Loader2 } from 'lucide-react';
import type { Devices } from '../types';
import { useState, useEffect } from 'react';

type Ctrl = (device: string, action: string, value?: number) => Promise<void>;
type PendingMap = Record<string, boolean>;

// 7 thiết bị theo spec hust-iot: fan, ac, light_living, light_bedroom, door, window, alarm
export function DeviceControls({
  devices, control, disabled, pending,
}: { devices: Devices | undefined; control: Ctrl; disabled: boolean; pending: PendingMap }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FanCard state={devices} control={control} disabled={disabled} loading={!!pending.fan} />
      <AcCard state={devices} control={control} disabled={disabled} loading={!!pending.ac} />
      <ToggleCard
        icon={Lightbulb} title="Đèn phòng khách" running={!!devices?.light_living}
        auto={!!devices?.light_living_auto}
        onToggle={(on) => control('light_living', on ? 'on' : 'off')}
        onAuto={() => control('light_living', devices?.light_living_auto ? 'manual' : 'auto')}
        disabled={disabled} loading={!!pending.light_living}
      />
      <ToggleCard
        icon={Bed} title="Đèn phòng ngủ" running={!!devices?.light_bedroom}
        onToggle={(on) => control('light_bedroom', on ? 'on' : 'off')}
        disabled={disabled} loading={!!pending.light_bedroom}
      />
      <ToggleCard
        icon={DoorOpen} title="Cửa chính" running={devices?.door === 'open'}
        labelOn="Đang mở" labelOff="Đã đóng"
        onToggle={(on) => control('door', on ? 'open' : 'close')}
        disabled={disabled} loading={!!pending.door}
      />
      <ToggleCard
        icon={Wind} title="Cửa sổ" running={devices?.window === 'open'}
        labelOn="Đang mở" labelOff="Đã đóng"
        onToggle={(on) => control('window', on ? 'open' : 'close')}
        disabled={disabled} loading={!!pending.window}
      />
      <AlarmCard state={devices} control={control} disabled={disabled} loading={!!pending.alarm} />
    </div>
  );
}

// Spinner icon tái sử dụng
function Spinner() { return <Loader2 className="w-4 h-4 animate-spin" />; }

// ─── Fan (0..3 + auto) ─────────────────────────────────────
function FanCard({ state, control, disabled, loading }: { state?: Devices; control: Ctrl; disabled: boolean; loading: boolean }) {
  const speed = state?.fan_speed ?? 0;
  const auto = !!state?.fan_auto;
  const blocked = disabled || loading;
  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
          <Fan className={`w-5 h-5 ${speed > 0 ? 'animate-spin text-emerald-400' : ''}`} />
          Quạt {auto && <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">AUTO</span>}
          {loading && <Spinner />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((v) => (
            <Button
              key={v} disabled={blocked}
              variant={speed === v ? 'default' : 'outline'}
              onClick={() => control('fan', 'speed', v)}
              className="flex-1"
            >
              {v === 0 ? 'Off' : `Mức ${v}`}
            </Button>
          ))}
        </div>
        <Button variant="secondary" size="sm" disabled={blocked}
          onClick={() => control('fan', auto ? 'manual' : 'auto')}>
          {auto ? 'Tắt chế độ Auto' : 'Bật chế độ Auto'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── AC (on/off + set_temp 16..30 + auto) ──────────────────
function AcCard({ state, control, disabled, loading }: { state?: Devices; control: Ctrl; disabled: boolean; loading: boolean }) {
  const on = !!state?.ac;
  const auto = !!state?.ac_auto;
  const backendTemp = state?.ac_temp ?? 25;
  const [temp, setTemp] = useState(backendTemp);
  useEffect(() => { setTemp(backendTemp); }, [backendTemp]);
  const blocked = disabled || loading;

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
          <Snowflake className={`w-5 h-5 ${on ? 'text-cyan-400' : ''}`} />
          Điều hòa {auto && <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">AUTO</span>}
          {loading && <Spinner />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-300">{on ? 'Đang bật' : 'Đã tắt'}</span>
          <Switch checked={on} disabled={blocked} onCheckedChange={(v) => control('ac', v ? 'on' : 'off')} />
        </div>
        <div>
          <div className="flex justify-between text-sm text-slate-300">
            <span>Nhiệt độ cài đặt</span>
            <span className="font-semibold">{temp}°C</span>
          </div>
          <input
            type="range" min={16} max={30} step={1} value={temp}
            disabled={blocked}
            onChange={(e) => setTemp(parseInt(e.target.value))}
            onMouseUp={(e) => control('ac', 'set_temp', parseInt((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => control('ac', 'set_temp', parseInt((e.target as HTMLInputElement).value))}
            className="w-full"
          />
        </div>
        <Button variant="secondary" size="sm" disabled={blocked}
          onClick={() => control('ac', auto ? 'manual' : 'auto')}>
          {auto ? 'Tắt chế độ Auto' : 'Bật chế độ Auto'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Toggle chung ─────────────────────────────────────────
function ToggleCard({
  icon: Icon, title, running, auto, labelOn = 'Đang bật', labelOff = 'Đã tắt',
  onToggle, onAuto, disabled, loading,
}: {
  icon: any; title: string; running: boolean; auto?: boolean; labelOn?: string; labelOff?: string;
  onToggle: (on: boolean) => void; onAuto?: () => void; disabled: boolean; loading: boolean;
}) {
  const blocked = disabled || loading;
  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
          <Icon className={`w-5 h-5 ${running ? 'text-emerald-400' : ''}`} />
          {title}
          {auto && <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">AUTO</span>}
          {loading && <Spinner />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-slate-300">{running ? labelOn : labelOff}</span>
          <Switch checked={running} disabled={blocked} onCheckedChange={onToggle} />
        </div>
        {onAuto && (
          <Button variant="secondary" size="sm" disabled={blocked} onClick={onAuto} className="mt-2 w-full">
            {auto ? 'Tắt chế độ Auto' : 'Bật chế độ Auto'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Alarm (Siren) ─────────────────────────────────────────
function AlarmCard({ state, control, disabled, loading }: { state?: Devices; control: Ctrl; disabled: boolean; loading: boolean }) {
  const firing = !!state?.fire_alarm;
  const blocked = disabled || loading;
  return (
    <Card className={`bg-slate-800/60 border ${firing ? 'border-red-500 animate-pulse' : 'border-slate-700'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
          <Siren className={`w-5 h-5 ${firing ? 'text-red-500' : ''}`} />
          Báo cháy
          {loading && <Spinner />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-300">{firing ? 'ĐANG CẢNH BÁO' : 'An toàn'}</span>
          <Switch checked={firing} disabled={blocked} onCheckedChange={(v) => control('alarm', v ? 'on' : 'off')} />
        </div>
        <p className="text-xs text-slate-500">Bật thủ công = kích hoạt khẩn cấp: còi + mở cửa + quạt max, tắt AC.</p>
      </CardContent>
    </Card>
  );
}
