import axios from 'axios';

// Token access lưu memory (không localStorage — chống XSS lấy token)
let accessToken: string | null = null;

export function setAccessToken(t: string | null) {
  accessToken = t;
}
export function getAccessToken() {
  return accessToken;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // gửi cookie refresh
});

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

// Refresh access token 1 lần khi gặp 401
let refreshing: Promise<string | null> | null = null;
async function refreshOnce() {
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', null, { withCredentials: true })
      .then((r) => {
        setAccessToken(r.data.access);
        return r.data.access as string;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry && !err.config.url?.includes('/auth/')) {
      err.config._retry = true;
      const t = await refreshOnce();
      if (t) {
        err.config.headers.Authorization = `Bearer ${t}`;
        return api(err.config);
      }
    }
    return Promise.reject(err);
  }
);
