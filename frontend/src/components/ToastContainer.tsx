import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { subscribeToast, type Toast } from '../lib/toast';

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const COLOR = {
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  error:   'border-red-500/50 bg-red-500/10 text-red-200',
  info:    'border-slate-500/50 bg-slate-800 text-slate-200',
};

export function ToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToast(setItems), []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border shadow-lg pointer-events-auto animate-in slide-in-from-right-2 ${COLOR[t.kind]}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
