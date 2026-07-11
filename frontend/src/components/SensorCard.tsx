import { Card, CardContent } from './ui/card';
import { LucideIcon } from 'lucide-react';

// Card 1 cảm biến — icon + label + value + unit + màu theo status
export function SensorCard({
  icon: Icon,
  label,
  value,
  unit,
  status,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number | undefined;
  unit?: string;
  status?: 'ok' | 'warn' | 'alert';
}) {
  const color =
    status === 'alert' ? 'text-red-400 border-red-500/40'
    : status === 'warn' ? 'text-yellow-400 border-yellow-500/40'
    : 'text-emerald-400 border-slate-600';

  return (
    <Card className={`bg-slate-800/60 border ${color}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="w-8 h-8 opacity-80" />
        <div>
          <div className="text-xs uppercase text-slate-400 tracking-wide">{label}</div>
          <div className="text-2xl font-semibold">
            {value ?? '—'}
            {unit && <span className="text-sm text-slate-400 ml-1">{unit}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
