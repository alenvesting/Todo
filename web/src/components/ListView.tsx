import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTaskNav } from '../nav';
import { addDays, daysBetween, formatToday, isoDate } from '../lib/dates';
import { isShared, membersOf, myLists, smartViews, sortLabels, sortTasks, tasksForSmartView, type SortMode } from '../lib/selectors';
import type { SmartView, Task } from '../lib/types';
import { useStore } from '../store';
import { ChevronDown, ChevronLeft, EditIcon, LogoutIcon, MoreIcon, PlusIcon, SortIcon, TrashIcon, UsersIcon } from './Icons';
import { ListDialog } from './ListDialog';
import { ShareDialog } from './ShareDialog';
import { TaskItem } from './TaskItem';
import { Avatar, colorOf, Menu, useLocalSetting } from './ui';

export function ListView({ view, listId }: { view?: SmartView; listId?: string }) {
  const store = useStore();
  const { data, user } = store;
  const navigate = useNavigate();
  const { taskId: selectedId, open } = useTaskNav();
  const today = isoDate();

  const list = listId ? data.lists.find((l) => l.id === listId) : undefined;
  const smart = view ? smartViews.find((v) => v.id === view) : undefined;
  const [sort, setSort] = useLocalSetting<SortMode>(`bocka:sort:${listId ?? view}`, view === 'planned' ? 'due' : 'position');
  const [showDone, setShowDone] = useLocalSetting<boolean>(`bocka:done:${listId ?? view}`, true);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const tasks: Task[] = useMemo(() => {
    if (list) return data.tasks.filter((t) => t.list_id === list.id);
    if (view) return tasksForSmartView(data, user.id, view, today);
    return [];
  }, [data, list, view, user.id, today]);

  if (listId && !list) {
    return (
      <section className="listview">
        <div className="empty-state">
          <p>{store.loaded ? 'Listan finns inte eller så har du inte längre tillgång till den.' : 'Laddar…'}</p>
          <Link to="/" className="btn btn-ghost">
            Till listorna
          </Link>
        </div>
      </section>
    );
  }

  const title = list ? list.name : smart?.label ?? '';
  const accent = colorOf(list ? list.color : smart?.color);
  const owner = list && list.owner_id === user.id;
  const members = list ? membersOf(data, list.id) : [];
  const shared = list ? isShared(data, list.id) : false;

  const open_ = sortTasks(tasks.filter((t) => !t.completed), sort);
  const done = tasks
    .filter((t) => t.completed)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  const menuItems = [];
  if (list) {
    menuItems.push({ label: 'Byt namn och utseende', icon: <EditIcon size={18} />, onClick: () => setEditing(true) });
    menuItems.push({ label: 'Dela lista', icon: <UsersIcon size={18} />, onClick: () => setSharing(true) });
  }
  menuItems.push({
    label: showDone ? 'Dölj slutförda' : 'Visa slutförda',
    icon: <ChevronDown size={18} />,
    onClick: () => setShowDone(!showDone),
  });
  if (list && owner)
    menuItems.push({
      label: 'Ta bort lista',
      icon: <TrashIcon size={18} />,
      danger: true,
      onClick: () => {
        if (confirm(`Ta bort "${list.name}" och alla dess uppgifter${shared ? ' för alla medlemmar' : ''}? Det går inte att ångra.`)) {
          store.deleteList(list.id);
          navigate('/');
        }
      },
    });
  if (list && !owner)
    menuItems.push({
      label: 'Lämna lista',
      icon: <LogoutIcon size={18} />,
      danger: true,
      onClick: () => {
        if (confirm(`Lämna "${list.name}"? Du behöver en ny inbjudan för att komma tillbaka.`)) {
          store.leaveList(list.id);
          navigate('/');
        }
      },
    });

  return (
    <section className="listview" style={{ ['--accent' as string]: accent }}>
      <header className="list-head">
        <Link to="/" className="icon-btn back" aria-label="Tillbaka till listorna">
          <ChevronLeft />
        </Link>
        <div className="list-title">
          <h1>
            {list?.emoji && <span className="emoji">{list.emoji}</span>}
            {title}
          </h1>
          {view === 'myday' && <p className="subtitle">{formatToday()}</p>}
        </div>
        {list && (
          <button className={'share-btn' + (shared ? ' shared' : '')} onClick={() => setSharing(true)} aria-label="Dela lista">
            {shared ? (
              <span className="avatars">
                {members.slice(0, 3).map((m) => (
                  <Avatar key={m.user_id} profile={data.profiles.find((p) => p.id === m.user_id)} size={26} />
                ))}
              </span>
            ) : (
              <UsersIcon />
            )}
            <span className="share-label">{shared ? `${members.length}` : 'Dela'}</span>
          </button>
        )}
        <Menu
          label="Sortera"
          trigger={<SortIcon />}
          items={(Object.keys(sortLabels) as SortMode[]).map((m) => ({
            label: sortLabels[m],
            checked: sort === m,
            onClick: () => setSort(m),
          }))}
        />
        <Menu label="Fler alternativ" trigger={<MoreIcon />} items={menuItems} />
      </header>

      <AddTask view={view} listId={list?.id} accent={accent} />

      <div className="tasks-scroll">
        {view === 'planned' ? (
          <PlannedGroups tasks={open_} today={today} selectedId={selectedId} onOpen={open} />
        ) : (
          <ul className="tasks">
            {open_.map((t) => (
              <TaskItem key={t.id} task={t} showList={!!view} hideMyDay={view === 'myday'} selected={t.id === selectedId} onOpen={open} />
            ))}
          </ul>
        )}

        {open_.length === 0 && done.length === 0 && store.loaded && <EmptyState view={view} />}

        {done.length > 0 && view !== 'planned' && (
          <div className="done-section">
            <button className="done-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
              <ChevronDown size={16} className={showDone ? '' : 'rot'} /> Slutförda <span className="count">{done.length}</span>
            </button>
            {showDone && (
              <ul className="tasks">
                {done.map((t) => (
                  <TaskItem key={t.id} task={t} showList={!!view} hideMyDay={view === 'myday'} selected={t.id === selectedId} onOpen={open} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {editing && list && (
        <ListDialog
          initial={list}
          onClose={() => setEditing(false)}
          onSave={(name, emoji, color) => {
            store.updateList(list.id, { name, emoji, color });
            setEditing(false);
          }}
        />
      )}
      {sharing && list && <ShareDialog list={list} onClose={() => setSharing(false)} />}
    </section>
  );
}

function PlannedGroups({ tasks, today, selectedId, onOpen }: { tasks: Task[]; today: string; selectedId: string | null; onOpen: (id: string) => void }) {
  const groups: { label: string; items: Task[] }[] = [
    { label: 'Försenat', items: [] },
    { label: 'Idag', items: [] },
    { label: 'Imorgon', items: [] },
    { label: 'Den här veckan', items: [] },
    { label: 'Senare', items: [] },
  ];
  const tomorrow = addDays(today, 1);
  for (const t of tasks) {
    const d = t.due_date!;
    if (d < today) groups[0].items.push(t);
    else if (d === today) groups[1].items.push(t);
    else if (d === tomorrow) groups[2].items.push(t);
    else if (daysBetween(today, d) < 7) groups[3].items.push(t);
    else groups[4].items.push(t);
  }
  return (
    <>
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.label} className="group">
            <h3 className={'group-head' + (g.label === 'Försenat' ? ' overdue' : '')}>
              {g.label} <span className="count">{g.items.length}</span>
            </h3>
            <ul className="tasks">
              {g.items.map((t) => (
                <TaskItem key={t.id} task={t} showList selected={t.id === selectedId} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        ))}
    </>
  );
}

function EmptyState({ view }: { view?: SmartView }) {
  const text: Record<SmartView | 'list', string> = {
    myday: 'Fokusera på dagen. Lägg till uppgifter här eller via "Lägg till i Min dag".',
    important: 'Stjärnmärk uppgifter för att samla dem här.',
    planned: 'Uppgifter med förfallodatum visas här.',
    assigned: 'Uppgifter som tilldelats dig i delade listor visas här.',
    list: 'Inga uppgifter ännu. Skriv något ovan och tryck Enter.',
  };
  return <p className="empty-state">{text[view ?? 'list']}</p>;
}

function AddTask({ view, listId, accent }: { view?: SmartView; listId?: string; accent: string }) {
  const store = useStore();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastList, setLastList] = useLocalSetting<string | null>('bocka:lastList', null);
  const lists = myLists(store.data, store.user.id);

  // I smarta vyer hamnar nya uppgifter i senast använda (eller första) listan
  const targetId = listId ?? (lists.find((l) => l.id === lastList) ?? lists[0])?.id;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    let target = targetId;
    if (!target) target = store.createList('Uppgifter', '✅', 'blue');
    store.addTask(target, t, {
      important: view === 'important',
      due_date: view === 'planned' ? isoDate() : null,
      myDay: view === 'myday',
    });
    if (listId) setLastList(listId);
    setTitle('');
    inputRef.current?.focus();
  };

  return (
    <form
      className="add-task"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <button type="submit" className="add-plus" aria-label="Lägg till" style={{ color: accent }}>
        <PlusIcon />
      </button>
      <input
        ref={inputRef}
        value={title}
        maxLength={1000}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Lägg till en uppgift"
        aria-label="Lägg till en uppgift"
        enterKeyHint="done"
      />
      {view && lists.length > 1 && title && (
        <select className="add-target" value={targetId} onChange={(e) => setLastList(e.target.value)} aria-label="Lista">
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.emoji} {l.name}
            </option>
          ))}
        </select>
      )}
    </form>
  );
}
