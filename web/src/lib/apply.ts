import type { DataState, List, Member, Op, TableName, Task } from './types';

/** Nyckel per tabell för att identifiera en rad */
export function rowKey(table: TableName | 'invitations', row: Record<string, unknown>): string {
  switch (table) {
    case 'list_members':
      return `${row.list_id}:${row.user_id}`;
    case 'my_day':
      return `${row.user_id}:${row.task_id}`;
    default:
      return String(row.id);
  }
}

const stateKey = {
  lists: 'lists',
  list_members: 'members',
  tasks: 'tasks',
  steps: 'steps',
  my_day: 'myDay',
} as const satisfies Record<TableName, keyof DataState>;

function matches(row: Record<string, unknown>, match: Record<string, string>): boolean {
  return Object.entries(match).every(([k, v]) => row[k] === v);
}

/** Tar bort rader som hänger på borttagna listor/uppgifter (som ON DELETE CASCADE i databasen) */
function cascade(s: DataState): DataState {
  const listIds = new Set(s.lists.map((l) => l.id));
  const tasks = s.tasks.filter((t) => listIds.has(t.list_id));
  const taskIds = new Set(tasks.map((t) => t.id));
  return {
    ...s,
    members: s.members.filter((m) => listIds.has(m.list_id)),
    tasks,
    steps: s.steps.filter((x) => taskIds.has(x.task_id)),
    myDay: s.myDay.filter((x) => taskIds.has(x.task_id)),
    invitations: s.invitations.filter((i) => listIds.has(i.list_id)),
  };
}

/** Tillämpar en ändring lokalt (optimistiskt) – speglar vad databasen gör */
export function applyOp(state: DataState, op: Op, nowIso: string = new Date().toISOString()): DataState {
  const key = stateKey[op.table];
  const rows = state[key] as unknown as Record<string, unknown>[];
  let next: DataState;

  if (op.action === 'insert') {
    const row = { ...op.values } as Record<string, unknown>;
    const k = rowKey(op.table, row);
    const without = rows.filter((r) => rowKey(op.table, r) !== k);
    next = { ...state, [key]: [...without, row] };

    if (op.table === 'lists') {
      // Databasen gör skaparen till ägare via trigger
      const list = row as unknown as List;
      const mine = state.members.filter((m) => m.user_id === list.owner_id);
      const member: Member = {
        list_id: list.id,
        user_id: list.owner_id,
        role: 'owner',
        position: mine.length ? Math.max(...mine.map((m) => m.position)) + 1 : 0,
      };
      next = { ...next, members: [...next.members.filter((m) => m.list_id !== list.id), member] };
    }
    if (op.table === 'tasks') {
      const t = row as unknown as Task;
      if (t.completed && !t.completed_at) t.completed_at = nowIso;
    }
    return next;
  }

  if (op.action === 'update') {
    next = {
      ...state,
      [key]: rows.map((r) => {
        if (!matches(r, op.match)) return r;
        const updated = { ...r, ...op.values };
        if (op.table === 'tasks' && op.values && 'completed' in op.values) {
          const was = (r as unknown as Task).completed;
          const now = Boolean(op.values.completed);
          if (now && !was) updated.completed_at = nowIso;
          if (!now) updated.completed_at = null;
        }
        return updated;
      }),
    };
    if (op.table === 'tasks' && op.values && 'list_id' in op.values) {
      // Flyttad uppgift: tilldelning rensas om personen inte är med i nya listan
      next = {
        ...next,
        tasks: next.tasks.map((t) =>
          matches(t as unknown as Record<string, unknown>, op.match) &&
          t.assigned_to &&
          !next.members.some((m) => m.list_id === t.list_id && m.user_id === t.assigned_to)
            ? { ...t, assigned_to: null }
            : t,
        ),
      };
    }
    return next;
  }

  // delete
  next = { ...state, [key]: rows.filter((r) => !matches(r, op.match)) };
  if (op.table === 'list_members') {
    const removed = rows.filter((r) => matches(r, op.match)) as unknown as Member[];
    for (const m of removed) {
      next = {
        ...next,
        tasks: next.tasks.map((t) =>
          t.list_id === m.list_id && t.assigned_to === m.user_id ? { ...t, assigned_to: null } : t,
        ),
      };
    }
  }
  return cascade(next);
}

/** Tillämpar en realtidshändelse från servern på bas-tillståndet */
export function applyRemote(
  state: DataState,
  table: 'tasks' | 'steps' | 'my_day',
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: Record<string, unknown>,
  oldRow: Record<string, unknown>,
): DataState {
  const key = stateKey[table];
  const rows = state[key] as unknown as Record<string, unknown>[];
  if (eventType === 'DELETE') {
    const k = rowKey(table, oldRow);
    return cascade({ ...state, [key]: rows.filter((r) => rowKey(table, r) !== k) });
  }
  if (table === 'tasks' && !state.lists.some((l) => l.id === (newRow as unknown as Task).list_id)) {
    // Flyttad till / skapad i en lista vi inte har laddad
    const k = rowKey(table, newRow);
    return cascade({ ...state, [key]: rows.filter((r) => rowKey(table, r) !== k) });
  }
  const k = rowKey(table, newRow);
  const exists = rows.some((r) => rowKey(table, r) === k);
  const merged = exists ? rows.map((r) => (rowKey(table, r) === k ? { ...r, ...newRow } : r)) : [...rows, newRow];
  return { ...state, [key]: merged };
}

