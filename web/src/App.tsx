import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useMatch } from 'react-router-dom';
import { useTaskNav } from './nav';
import { InviteAccept, InviteLogin } from './components/InvitePage';
import { ListView } from './components/ListView';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { TaskDetail } from './components/TaskDetail';
import { Toasts } from './components/ui';
import { smartViews } from './lib/selectors';
import type { SmartView } from './lib/types';
import { DataProvider, useAuth } from './store';

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}

function Shell() {
  const location = useLocation();
  const listMatch = useMatch('/list/:listId');
  const viewMatch = useMatch('/:view');
  const isDesktop = useMediaQuery('(min-width: 760px)');
  const { taskId, close } = useTaskNav();

  const isHome = location.pathname === '/';
  const view = smartViews.find((v) => v.id === viewMatch?.params.view)?.id as SmartView | undefined;
  const listId = listMatch?.params.listId;

  if (isHome && isDesktop) return <Navigate to="/myday" replace />;
  if (!isHome && !view && !listId) return <Navigate to="/" replace />;

  return (
    <div className="app" data-screen={isHome ? 'home' : 'list'} data-detail={taskId ? 'open' : 'closed'}>
      <Sidebar />
      {!isHome && <ListView key={listId ?? view} view={view} listId={listId} />}
      {taskId && <TaskDetail key={taskId} taskId={taskId} onClose={close} />}
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <img src="/icon.svg" alt="" width={64} height={64} />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InviteLogin />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <DataProvider key={user.id} user={user}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="*" element={<Shell />} />
      </Routes>
      <Toasts />
    </DataProvider>
  );
}
