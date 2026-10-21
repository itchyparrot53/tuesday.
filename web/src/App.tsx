import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { useMe } from './hooks/useMe';
import { Spinner } from './components/ui/Spinner';
import { AppLayout } from './components/layout/AppLayout';
import { SetupPage } from './pages/SetupPage';
import { LoginPage } from './pages/LoginPage';
import { InvitePage } from './pages/InvitePage';
import { HomePage } from './pages/HomePage';
import { WorkspacePage } from './pages/WorkspacePage';
import { BoardPage } from './pages/BoardPage';
import { InboxPage } from './pages/InboxPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { DashboardPage } from './pages/DashboardPage';
import { PublicFormPage } from './pages/PublicFormPage';
import { DocPage } from './pages/DocPage';
import { TrashPage } from './pages/TrashPage';
import { AdminPage } from './pages/AdminPage';
import { ProfilePage } from './pages/ProfilePage';
import { WelcomePage } from './pages/WelcomePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AiPage } from './ai/page/AiPage';
import { SearchPage } from './pages/SearchPage';
import { SharePage } from './pages/SharePage';
import { UnsubscribePage } from './pages/UnsubscribePage';
import { ReleasePage } from './pages/ReleasePage';

export interface AuthState {
  needsSetup: boolean;
  orgName: string | null;
  sso: { enabled: boolean; label: string; only: boolean };
  mail: boolean;
}

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner size={20} />
    </div>
  );
}

function Guard() {
  const location = useLocation();
  const state = useQuery({
    queryKey: ['auth', 'state'],
    queryFn: () => api<AuthState>('GET', '/auth/state'),
    staleTime: 0,
  });
  const me = useMe();
  if (state.isLoading) return <FullScreenSpinner />;
  if (state.data?.needsSetup) return <Navigate to="/setup" replace />;
  if (me.isLoading) return <FullScreenSpinner />;
  if (!me.data)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/f/:token" element={<PublicFormPage />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route element={<Guard />}>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspaces/:id" element={<WorkspacePage />} />
            <Route path="/boards/:id" element={<BoardPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/my-work" element={<MyWorkPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/dashboards/:id" element={<DashboardPage />} />
            <Route path="/docs/:id" element={<DocPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/ai" element={<AiPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/share" element={<SharePage />} />
            <Route path="/release" element={<ReleasePage />} />
            <Route path="/ai/:id" element={<AiPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
