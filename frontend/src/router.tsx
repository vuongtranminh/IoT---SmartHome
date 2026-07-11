import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AuditLog } from './pages/admin/AuditLog';
import { useAuth } from './hooks/useAuth';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-400">Đang tải…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AdminRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8">Đang tải…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [{ path: '/', element: <Dashboard /> }],
  },
  {
    element: <AdminRoute />,
    children: [{ path: '/admin/audit', element: <AuditLog /> }],
  },
]);
