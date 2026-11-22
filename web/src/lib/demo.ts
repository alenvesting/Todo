import { isoDate } from './dates';
import type { DataState } from './types';

/** Exempeldata för demoläget (när ingen Supabase är kopplad) */
export function demoSeed(userId: string): DataState {
  const now = new Date().toISOString();
  const today = isoDate();
  const shop = 'demo-list-shop';
  const home = 'demo-list-home';
  const task = (id: string, list_id: string, title: string, position: number, extra: Partial<DataState['tasks'][number]> = {}) => ({
    id,
    list_id,
    title,
    note: '',
    completed: false,
    completed_at: null,
    important: false,
    due_date: null,
    recurrence: null,
    assigned_to: null,
    position,
    created_by: userId,
    created_at: now,
    ...extra,
  });
  return {
    lists: [
      { id: shop, owner_id: userId, name: 'Inköpslista', emoji: '🛒', color: 'green', created_at: now },
      { id: home, owner_id: userId, name: 'Hemma', emoji: '🏠', color: 'blue', created_at: now },
    ],
    members: [
      { list_id: shop, user_id: userId, role: 'owner', position: 0 },
      { list_id: home, user_id: userId, role: 'owner', position: 1 },
    ],
    profiles: [{ id: userId, email: null, display_name: 'Du', avatar_url: null }],
    tasks: [
      task('demo-t1', shop, 'Mjölk', 0),
      task('demo-t2', shop, 'Bröd', 1),
      task('demo-t3', shop, 'Ägg', 2, { important: true }),
      task('demo-t4', shop, 'Kaffe', 3, { completed: true, completed_at: now }),
      task('demo-t5', home, 'Betala räkningar', 0, { due_date: today, recurrence: 'monthly', important: true }),
      task('demo-t6', home, 'Boka tvättid', 1),
    ],
    steps: [
      { id: 'demo-s1', task_id: 'demo-t1', title: 'Laktosfri', completed: false, position: 0, created_at: now },
      { id: 'demo-s2', task_id: 'demo-t1', title: 'Havremjölk', completed: true, position: 1, created_at: now },
    ],
    myDay: [{ user_id: userId, task_id: 'demo-t6', day: today }],
    invitations: [],
    pending: [],
  };
}
