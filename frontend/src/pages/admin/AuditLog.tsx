import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ArrowLeft, Search } from 'lucide-react';
import type { AuditLogRow } from '../../types';

export function AuditLog() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/admin/audit?limit=200').then((r) => setRows(r.data));
  }, []);

  const filtered = rows.filter((r) =>
    !filter ||
    r.actor.toLowerCase().includes(filter.toLowerCase()) ||
    r.action.toLowerCase().includes(filter.toLowerCase()) ||
    (r.target || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Về Dashboard</Button></Link>
          <h1 className="text-lg font-semibold">Audit Log</h1>
        </div>

        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle>Lịch sử thao tác ({rows.length})</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-full"
                placeholder="Lọc theo actor / action / target…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-left">
                    <th className="py-2 pr-3">Thời gian</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Detail</th>
                    <th className="py-2 pr-3">IP</th>
                    <th className="py-2 pr-3">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r._id} className="border-b border-slate-700/40 hover:bg-slate-700/10">
                      <td className="py-1 pr-3 text-slate-400 whitespace-nowrap">{new Date(r.at).toLocaleString('vi-VN')}</td>
                      <td className="py-1 pr-3">{r.actor}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{r.action}</td>
                      <td className="py-1 pr-3">{r.target}</td>
                      <td className="py-1 pr-3 text-xs text-slate-400 max-w-md truncate">{JSON.stringify(r.detail)}</td>
                      <td className="py-1 pr-3 text-xs text-slate-500">{r.ip}</td>
                      <td className={`py-1 pr-3 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>{r.ok ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
