import { useCallback, useEffect, useState } from 'react';
import { api, setAccessToken, getAccessToken } from '../api/client';
import type { User } from '../types';

// Cache user để nhiều component share state, không phải request nhiều lần
let cachedUser: User | null = null;
const listeners = new Set<(u: User | null) => void>();

function setUser(u: User | null) {
  cachedUser = u;
  listeners.forEach((l) => l(u));
}

export function useAuth() {
  const [user, set] = useState<User | null>(cachedUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listeners.add(set);
    return () => { listeners.delete(set); };
  }, []);

  useEffect(() => {
    // Thử refresh khi mount — nếu có cookie refresh hợp lệ thì đăng nhập tự động
    (async () => {
      if (cachedUser) { setLoading(false); return; }
      try {
        const r = await api.post('/auth/refresh');
        setAccessToken(r.data.access);
        setUser(r.data.user);
      } catch { /* chưa login */ }
      finally { setLoading(false); }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.post('/auth/login', { username, password });
    setAccessToken(r.data.access);
    setUser(r.data.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return { user, loading, login, logout, token: getAccessToken() };
}
