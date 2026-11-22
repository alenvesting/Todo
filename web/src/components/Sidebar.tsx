import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { isoDate } from '../lib/dates';
import { isShared, myLists, smartViews, tasksForSmartView } from '../lib/selectors';
import { isDemo } from '../lib/supabase';
import type { SmartView } from '../lib/types';
import { useAuth, useStore } from '../store';
import { CalendarIcon, CloudIcon, CloudOffIcon, ListIcon, LogoutIcon, PlusIcon, StarIcon, SunIcon, UserIcon, UsersIcon } from './Icons';
import { ListDialog } from './ListDialog';
import { Avatar, colorOf, Menu } from './ui';

const viewIcons: Record<SmartView, JSX.Element> = {
  myday: <SunIcon />,
  important: <StarIcon />,
  planned: <CalendarIcon />,
  assigned: <UserIcon />,
};

export function Sidebar() {
  const store = useStore();
  const { signOut } = useAuth();
  const { data, user } = store;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const today = isoDate();
  const lists = myLists(data, user.id);
  const hasShared = lists.some((l) => isShared(data, l.id));

  const syncLabel =
    store.sync === 'offline'
      ? `Offline${store.pendingOps ? ` – ${store.pendingOps} ändring${store.pendingOps > 1 ? 'ar' : ''} väntar` : ''}`
      : store.sync === 'syncing'
        ? 'Synkar…'
        : 'Synkad';

  const accept = async (token: string) => {
    try {
      const listId = await store.acceptInvite(token);
      navigate(`/list/${listId}`);
      store.toast('Du är nu med i listan');
    } catch (e) {
      store.toast((e as Error).message);
    }
  };

  return (
    <nav className="sidebar" aria-label="Listor">
      <header className="sidebar-head">
        <Avatar profile={data.profiles.find((p) => p.id === user.id)} name={user.name} size={36} />
        <div className="who">
          <strong>{user.name}</strong>
          <span>{isDemo ? 'Demoläge – sparas bara här' : user.email}</span>
        </div>
        {!isDemo && (
          <Menu
            label="Konto"
            trigger={<LogoutIcon />}
            items={[{ label: 'Logga ut', icon: <LogoutIcon size={18} />, onClick: () => void signOut() }]}
          />
        )}
      </header>

      {data.pending.length > 0 && (
        <section className="pending">
          {data.pending.map((p) => (
            <div key={p.id} className="pending-card">
              <p>
                <strong>{p.inviter_name}</strong> har bjudit in dig till{' '}
                <strong>
                  {p.list_emoji} {p.list_name}
                </strong>
              </p>
              <div className="row">
                <button className="btn btn-primary btn-sm" onClick={() => void accept(p.token)}>
                  Gå med
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void store.declineInvite(p.id).catch((e) => store.toast(e.message))}>
                  Avböj
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <ul className="nav-list">
        {smartViews
          .filter((v) => v.id !== 'assigned' || hasShared)
          .map((v) => {
            const count = tasksForSmartView(data, user.id, v.id, today).filter((t) => !t.completed).length;
            return (
              <li key={v.id}>
                <NavLink to={`/${v.id}`} className="nav-item" style={{ ['--accent' as string]: colorOf(v.color) }}>
                  <span className="nav-icon">{viewIcons[v.id]}</span>
                  <span className="nav-label">{v.label}</span>
                  {count > 0 && <span className="count">{count}</span>}
                </NavLink>
              </li>
            );
          })}
      </ul>

      <div className="divider" />

      <ul className="nav-list lists">
        {lists.map((l) => {
          const count = data.tasks.filter((t) => t.list_id === l.id && !t.completed).length;
          return (
            <li key={l.id}>
              <NavLink to={`/list/${l.id}`} className="nav-item" style={{ ['--accent' as string]: colorOf(l.color) }}>
                <span className="nav-icon">{l.emoji ? <span className="emoji">{l.emoji}</span> : <ListIcon />}</span>
                <span className="nav-label">{l.name}</span>
                {isShared(data, l.id) && <UsersIcon size={16} className="muted" aria-label="Delad" />}
                {count > 0 && <span className="count">{count}</span>}
              </NavLink>
            </li>
          );
        })}
        {lists.length === 0 && store.loaded && <li className="empty-hint">Skapa din första lista – t.ex. en inköpslista.</li>}
      </ul>

      <footer className="sidebar-foot">
        <button className="new-list" onClick={() => setCreating(true)}>
          <PlusIcon /> Ny lista
        </button>
        {!isDemo && (
          <span className={'sync sync-' + store.sync} title={syncLabel}>
            {store.sync === 'offline' ? <CloudOffIcon size={16} /> : <CloudIcon size={16} />}
            <span>{syncLabel}</span>
          </span>
        )}
      </footer>

      {creating && (
        <ListDialog
          onClose={() => setCreating(false)}
          onSave={(name, emoji, color) => {
            const id = store.createList(name, emoji, color);
            setCreating(false);
            navigate(`/list/${id}`);
          }}
        />
      )}
    </nav>
  );
}
