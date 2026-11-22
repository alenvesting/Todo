import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { applyOp, applyRemote } from './lib/apply';
import { isoDate } from './lib/dates';
import { demoSeed } from './lib/demo';
import * as api from './lib/supabase';
import { isDemo, supabase } from './lib/supabase';
import { emptyState, type DataState, type Invitation, type List, type Op, type Step, type Task } from './lib/types';

// ---------------------------------------------------------------------------
// Inloggning
// ---------------------------------------------------------------------------
export interface AppUser {
  id: string;
  email: string | null;
  name: string;
  avatar: string | null;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

const DEMO_USER: AppUser = { id: 'demo-user', email: null, name: 'Du', avatar: null };

function toUser(session: Session | null): AppUser | null {
  const u = session?.user;
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? null,
    name: meta.full_name || meta.name || u.email?.split('@')[0] || 'Jag',
    avatar: meta.avatar_url || meta.picture || null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(isDemo ? DEMO_USER : null);
  const [loading, setLoading] = useState(!isDemo);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(toUser(data.session));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => {
        const next = toUser(session);
        return prev?.id === next?.id && prev?.name === next?.name ? prev : next;
      });
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export type SyncStatus = 'synced' | 'syncing' | 'offline';

export interface Store {
  user: AppUser;
  data: DataState;
  loaded: boolean;
  sync: SyncStatus;
  pendingOps: number;
  toasts: Toast[];
  toast: (text: string, action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
  reload: () => Promise<void>;

  createList: (name: string, emoji: string | null, color: string) => string;
  updateList: (id: string, patch: Partial<Pick<List, 'name' | 'emoji' | 'color'>>) => void;
  deleteList: (id: string) => void;
  leaveList: (id: string) => void;
  removeMember: (listId: string, userId: string) => void;

  addTask: (listId: string, title: string, extra?: { important?: boolean; due_date?: string | null; myDay?: boolean }) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'created_at' | 'created_by' | 'completed_at'>>) => void;
  deleteTask: (id: string) => void;
  restoreTask: (task: Task, steps: Step[]) => void;
  setMyDay: (taskId: string, on: boolean) => void;

  addStep: (taskId: string, title: string) => void;
  updateStep: (id: string, patch: Partial<Pick<Step, 'title' | 'completed'>>) => void;
  deleteStep: (id: string) => void;

  createInvite: (listId: string, email: string | null) => Promise<Invitation>;
  revokeInvite: (id: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<string>;
  declineInvite: (id: string) => Promise<void>;
  stopSharing: (listId: string) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore utanför DataProvider');
  return s;
}

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* fullt eller blockerat – appen fungerar ändå */
  }
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export function DataProvider({ user, children }: { user: AppUser; children: ReactNode }) {
  const userId = user.id;
  const dataKey = `bocka:data:${userId}`;
  const queueKey = `bocka:queue:${userId}`;

  const baseRef = useRef<DataState>(load<DataState>(dataKey) ?? (isDemo ? demoSeed(userId) : emptyState));
  const queueRef = useRef<Op[]>(load<Op[]>(queueKey) ?? []);
  const [base, setBaseState] = useState(baseRef.current);
  const [queue, setQueueState] = useState(queueRef.current);
  const [loaded, setLoaded] = useState(isDemo || load(dataKey) !== null);
  const [sync, setSync] = useState<SyncStatus>('syncing');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const setBase = useCallback((fn: (s: DataState) => DataState) => {
    baseRef.current = fn(baseRef.current);
    setBaseState(baseRef.current);
  }, []);
  const setQueue = useCallback((fn: (q: Op[]) => Op[]) => {
    queueRef.current = fn(queueRef.current);
    setQueueState(queueRef.current);
  }, []);

  useEffect(() => save(dataKey, base), [dataKey, base]);
  useEffect(() => save(queueKey, queue), [queueKey, queue]);

  const data = useMemo(() => queue.reduce((s, op) => applyOp(s, op), base), [base, queue]);

  // ----- toasts -----
  const toastId = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, action?: Toast['action']) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-2), { id, text, action }]);
      setTimeout(() => dismissToast(id), action ? 6000 : 4000);
    },
    [dismissToast],
  );

  // ----- laddning från servern -----
  const fetching = useRef(false);
  const doneDuringFetch = useRef<Op[]>([]);
  const reload = useCallback(async () => {
    if (isDemo || fetching.current) return;
    fetching.current = true;
    doneDuringFetch.current = [];
    try {
      const fresh = await api.fetchState();
      setBase(() => doneDuringFetch.current.reduce((s, op) => applyOp(s, op), fresh));
      setLoaded(true);
      if (queueRef.current.length === 0) setSync('synced');
    } catch (e) {
      console.warn('Kunde inte hämta data', e);
      setSync('offline');
    } finally {
      fetching.current = false;
    }
  }, [setBase]);

  const reloadTimer = useRef<ReturnType<typeof setTimeout>>();
  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void reload(), 400);
  }, [reload]);

  // ----- kö: skicka ändringar i ordning, försök igen vid nätverksfel -----
  const flushing = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const retryDelay = useRef(1000);
  const flush = useCallback(async () => {
    if (isDemo || flushing.current) return;
    flushing.current = true;
    clearTimeout(retryTimer.current);
    try {
      while (queueRef.current.length > 0) {
        setSync('syncing');
        const op = queueRef.current[0];
        const res = await api.executeOp(op);
        if (res.ok) {
          retryDelay.current = 1000;
          if (fetching.current) doneDuringFetch.current.push(op);
          setBase((s) => applyOp(s, op));
          setQueue((q) => q.filter((x) => x.id !== op.id));
        } else if (res.retry) {
          setSync('offline');
          if (res.message.toLowerCase().includes('jwt')) await supabase?.auth.refreshSession();
          retryTimer.current = setTimeout(() => void flush(), retryDelay.current);
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
          return;
        } else {
          console.warn('Ändring avvisades', op, res.message);
          setQueue((q) => q.filter((x) => x.id !== op.id));
          toast('En ändring kunde inte sparas: ' + res.message);
          scheduleReload();
        }
      }
      setSync('synced');
    } finally {
      flushing.current = false;
    }
  }, [scheduleReload, setBase, setQueue, toast]);

  const enqueue = useCallback(
    (...ops: Omit<Op, 'id'>[]) => {
      const full = ops.map((o) => ({ ...o, id: uuid() }));
      if (isDemo) {
        setBase((s) => full.reduce((acc, op) => applyOp(acc, op), s));
        return;
      }
      setQueue((q) => [...q, ...full]);
      void flush();
    },
    [flush, setBase, setQueue],
  );

  // ----- start, realtid, återanslutning -----
  useEffect(() => {
    if (isDemo || !supabase) {
      setSync('synced');
      return;
    }
    void reload().then(() => flush());

    const channel = supabase.channel(`bocka-${userId}-${uuid()}`);
    for (const table of ['tasks', 'steps', 'my_day'] as const) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
        setBase((s) =>
          applyRemote(s, table, p.eventType, p.new as Record<string, unknown>, p.old as Record<string, unknown>),
        );
      });
    }
    for (const table of ['lists', 'list_members', 'invitations']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleReload());
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') scheduleReload();
    });

    const onWake = () => {
      if (document.visibilityState === 'visible') {
        scheduleReload();
        void flush();
      }
    };
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      void supabase?.removeChannel(channel);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      clearTimeout(retryTimer.current);
      clearTimeout(reloadTimer.current);
    };
  }, [flush, reload, scheduleReload, setBase, userId]);

  // ----- åtgärder -----
  const now = () => new Date().toISOString();

  const actions = useMemo(() => {
    const cur = () => queueRef.current.reduce((s, op) => applyOp(s, op), baseRef.current);
    const requireOnline = () => {
      if (isDemo) throw new Error('Delning kräver att appen är kopplad till Supabase (se README).');
    };

    return {
      createList(name: string, emoji: string | null, color: string) {
        const id = uuid();
        enqueue({
          table: 'lists',
          action: 'insert',
          match: { id },
          values: { id, owner_id: userId, name: name.trim() || 'Namnlös lista', emoji, color, created_at: now() },
        });
        return id;
      },
      updateList(id: string, patch: Partial<Pick<List, 'name' | 'emoji' | 'color'>>) {
        enqueue({ table: 'lists', action: 'update', match: { id }, values: patch });
      },
      deleteList(id: string) {
        enqueue({ table: 'lists', action: 'delete', match: { id } });
      },
      leaveList(id: string) {
        enqueue({ table: 'list_members', action: 'delete', match: { list_id: id, user_id: userId } });
      },
      removeMember(listId: string, memberId: string) {
        enqueue({ table: 'list_members', action: 'delete', match: { list_id: listId, user_id: memberId } });
      },

      addTask(listId: string, title: string, extra: { important?: boolean; due_date?: string | null; myDay?: boolean } = {}) {
        const id = uuid();
        const inList = cur().tasks.filter((t) => t.list_id === listId);
        const position = inList.length ? Math.min(...inList.map((t) => t.position)) - 1 : 0;
        const ops: Omit<Op, 'id'>[] = [
          {
            table: 'tasks',
            action: 'insert',
            match: { id },
            values: {
              id,
              list_id: listId,
              title: title.trim(),
              note: '',
              completed: false,
              completed_at: null,
              important: extra.important ?? false,
              due_date: extra.due_date ?? null,
              recurrence: null,
              assigned_to: null,
              position,
              created_by: userId,
              created_at: now(),
            },
          },
        ];
        if (extra.myDay) {
          ops.push({
            table: 'my_day',
            action: 'insert',
            match: { user_id: userId, task_id: id },
            values: { user_id: userId, task_id: id, day: isoDate() },
          });
        }
        enqueue(...ops);
        return id;
      },
      updateTask(id: string, patch: Partial<Task>) {
        enqueue({ table: 'tasks', action: 'update', match: { id }, values: patch });
      },
      deleteTask(id: string) {
        enqueue({ table: 'tasks', action: 'delete', match: { id } });
      },
      restoreTask(task: Task, steps: Step[]) {
        const { updated_at: _u, ...values } = task;
        void _u;
        enqueue(
          { table: 'tasks', action: 'insert', match: { id: task.id }, values },
          ...steps.map((s) => ({ table: 'steps' as const, action: 'insert' as const, match: { id: s.id }, values: { ...s } })),
        );
      },
      setMyDay(taskId: string, on: boolean) {
        const match = { user_id: userId, task_id: taskId };
        const exists = cur().myDay.some((m) => m.user_id === userId && m.task_id === taskId);
        if (!on) {
          if (exists) enqueue({ table: 'my_day', action: 'delete', match });
        } else if (exists) {
          enqueue({ table: 'my_day', action: 'update', match, values: { day: isoDate() } });
        } else {
          enqueue({ table: 'my_day', action: 'insert', match, values: { ...match, day: isoDate() } });
        }
      },

      addStep(taskId: string, title: string) {
        const id = uuid();
        const steps = cur().steps.filter((s) => s.task_id === taskId);
        const position = steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 0;
        enqueue({
          table: 'steps',
          action: 'insert',
          match: { id },
          values: { id, task_id: taskId, title: title.trim(), completed: false, position, created_at: now() },
        });
      },
      updateStep(id: string, patch: Partial<Pick<Step, 'title' | 'completed'>>) {
        enqueue({ table: 'steps', action: 'update', match: { id }, values: patch });
      },
      deleteStep(id: string) {
        enqueue({ table: 'steps', action: 'delete', match: { id } });
      },

      async createInvite(listId: string, email: string | null) {
        requireOnline();
        const inv = await api.createInvitation(listId, email);
        setBase((s) => ({ ...s, invitations: [...s.invitations.filter((i) => i.id !== inv.id), inv] }));
        return inv;
      },
      async revokeInvite(id: string) {
        requireOnline();
        await api.deleteInvitation(id);
        setBase((s) => ({ ...s, invitations: s.invitations.filter((i) => i.id !== id) }));
      },
      async acceptInvite(token: string) {
        requireOnline();
        const listId = await api.acceptInvitation(token);
        await reload();
        return listId;
      },
      async declineInvite(id: string) {
        requireOnline();
        await api.declineInvitation(id);
        setBase((s) => ({ ...s, pending: s.pending.filter((p) => p.id !== id) }));
      },
      async stopSharing(listId: string) {
        requireOnline();
        await api.stopSharing(listId);
        await reload();
      },
    };
  }, [enqueue, reload, setBase, userId]);

  const store: Store = {
    user,
    data,
    loaded,
    sync,
    pendingOps: queue.length,
    toasts,
    toast,
    dismissToast,
    reload,
    ...actions,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
