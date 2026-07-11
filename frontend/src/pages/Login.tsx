import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { api, setAccessToken } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { KeyRound, Fingerprint } from 'lucide-react';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin@1234');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(username, password);
      nav('/');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskey() {
    setErr(''); setBusy(true);
    try {
      const opts = await api.post('/auth/passkey/login/options').then((r) => r.data);
      const cred = await startAuthentication({ optionsJSON: opts });
      const r = await api.post('/auth/passkey/login/verify', cred);
      setAccessToken(r.data.access);
      // Refresh useAuth cache bằng cách gọi refresh
      await api.post('/auth/refresh');
      nav('/');
      // Reload để clear all state cleanly
      window.location.reload();
    } catch (e: any) {
      setErr(e?.message || e?.response?.data?.error || 'Passkey login thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-800/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <KeyRound className="w-5 h-5" /> Smart Home Dashboard
          </CardTitle>
          <p className="text-sm text-slate-400">Đăng nhập để điều khiển thiết bị</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-slate-200">Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div>
              <Label className="text-slate-200">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <Button className="w-full" disabled={busy}>Đăng nhập</Button>
          </form>

          <div className="my-4 text-center text-xs text-slate-500">— hoặc —</div>

          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={handlePasskey}>
            <Fingerprint className="w-4 h-4 mr-2" /> Đăng nhập bằng Passkey
          </Button>

          <p className="text-xs text-slate-500 mt-4">
            Tài khoản demo: <code>admin</code> / <code>admin@1234</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
