import { isoDate } from './dates';
import type { DataState, List, Profile, SmartView, Task } from './types';

export function myLists(data: DataState, userId: string): List[] {
  const mine = new Map(data.members.filter((m) => m.user_id === userId).map((m) => [m.list_id, m.position]));
  return data.lists
    .filter((l) => mine.has(l.id))
    .sort((a, b) => (mine.get(a.id)! - mine.get(b.id)!) || a.created_at.localeCompare(b.created_at));
}

/** Uppgifter i listor jag är medlem i */
export function visibleTasks(data: DataState, userId: string): Task[] {
  const ids = new Set(data.members.filter((m) => m.user_id === userId).map((m) => m.list_id));
  return data.tasks.filter((t) => ids.has(t.list_id));
}

export function membersOf(data: DataState, listId: string) {
  return data.members.filter((m) => m.list_id === listId);
}

export function isShared(data: DataState, listId: string): boolean {
  return membersOf(data, listId).length > 1;
}

export function profileName(p: Profile | undefined): string {
  return p?.display_name || p?.email || 'Okänd';
}

export function isInMyDay(data: DataState, userId: string, taskId: string, today = isoDate()): boolean {
  return data.myDay.some((m) => m.user_id === userId && m.task_id === taskId && m.day === today);
}

export function tasksForSmartView(data: DataState, userId: string, view: SmartView, today = isoDate()): Task[] {
  const tasks = visibleTasks(data, userId);
  switch (view) {
    case 'myday': {
      const ids = new Set(data.myDay.filter((m) => m.user_id === userId && m.day === today).map((m) => m.task_id));
      return tasks.filter((t) => ids.has(t.id));
    }
    case 'important':
      return tasks.filter((t) => t.important);
    case 'planned':
      return tasks.filter((t) => t.due_date && !t.completed);
    case 'assigned':
      return tasks.filter((t) => t.assigned_to === userId);
  }
}

export type SortMode = 'position' | 'important' | 'due' | 'alpha' | 'created';

export const sortLabels: Record<SortMode, string> = {
  position: 'Egen ordning',
  important: 'Viktighet',
  due: 'Förfallodatum',
  alpha: 'Alfabetiskt',
  created: 'Skapad datum',
};

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const byPos = (a: Task, b: Task) => a.position - b.position || b.created_at.localeCompare(a.created_at);
  const arr = [...tasks];
  switch (mode) {
    case 'position':
      return arr.sort(byPos);
    case 'important':
      return arr.sort((a, b) => Number(b.important) - Number(a.important) || byPos(a, b));
    case 'due':
      return arr.sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date) || byPos(a, b);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return byPos(a, b);
      });
    case 'alpha':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'sv'));
    case 'created':
      return arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export const smartViews: { id: SmartView; label: string; color: string }[] = [
  { id: 'myday', label: 'Min dag', color: 'blue' },
  { id: 'important', label: 'Viktigt', color: 'pink' },
  { id: 'planned', label: 'Planerat', color: 'teal' },
  { id: 'assigned', label: 'Tilldelat mig', color: 'green' },
];
