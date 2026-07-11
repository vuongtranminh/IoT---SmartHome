import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Bell } from 'lucide-react';
import type { DeviceEvent } from '../types';

const ICONS: Record<string, string> = {
  boot: '🔌', fire_alarm: '🔥', motion: '🚶', door: '🚪', window: '🪟',
  control_applied: '✅', control_rejected: '⛔', security_alert: '🚨',
};

const COLOR: Record<string, string> = {
  fire_alarm: 'text-red-400',
  security_alert: 'text-red-400',
  control_rejected: 'text-yellow-400',
  motion: 'text-blue-300',
  door: 'text-cyan-300',
  window: 'text-cyan-300',
  control_applied: 'text-emerald-400',
  boot: 'text-slate-400',
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export function EventsTimeline({ events }: { events: DeviceEvent[] }) {
  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
          <Bell className="w-5 h-5" /> Sự kiện gần đây
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 && <p className="text-slate-500 text-sm">Chưa có sự kiện.</p>}
        <ul className="space-y-1 max-h-96 overflow-y-auto text-sm">
          {events.map((e, i) => (
            <li key={e._id || i} className="flex items-center gap-2 py-1 border-b border-slate-700/40 last:border-0">
              <span className="text-lg">{ICONS[e.event] || '•'}</span>
              <span className={COLOR[e.event] || 'text-slate-200'}>{e.event}</span>
              {e.detail && <span className="text-slate-400">: {e.detail}</span>}
              <span className="ml-auto text-xs text-slate-500">{timeAgo(e.received_at)} trước</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
