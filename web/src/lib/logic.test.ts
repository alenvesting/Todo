import { describe, expect, it } from 'vitest';
import { applyOp, applyRemote } from './apply';
import { addDays, formatDue, nextWeekday } from './dates';
import { demoSeed } from './demo';
import { myLists, sortTasks, tasksForSmartView } from './selectors';
import type { Op } from './types';

const U = 'demo-user';
const op = (o: Omit<Op, 'id'>): Op => ({ id: Math.random().toString(), ...o });

describe('applyOp', () => {
  it('skapar lista och gör skaparen till ägare', () => {
    const s = applyOp(demoSeed(U), op({ table: 'lists', action: 'insert', match: { id: 'L' }, values: { id: 'L', owner_id: U, name: 'Ny', emoji: null, color: 'blue', created_at: 'z' } }));
    expect(s.members.find((m) => m.list_id === 'L')).toMatchObject({ user_id: U, role: 'owner', position: 2 });
    expect(myLists(s, U).map((l) => l.name)).toEqual(['Inköpslista', 'Hemma', 'Ny']);
  });

  it('sätter och nollställer completed_at', () => {
    let s = applyOp(demoSeed(U), op({ table: 'tasks', action: 'update', match: { id: 'demo-t1' }, values: { completed: true } }), 'T');
    expect(s.tasks.find((t) => t.id === 'demo-t1')?.completed_at).toBe('T');
    s = applyOp(s, op({ table: 'tasks', action: 'update', match: { id: 'demo-t1' }, values: { completed: false } }));
    expect(s.tasks.find((t) => t.id === 'demo-t1')?.completed_at).toBeNull();
  });

  it('borttagen lista tar med sig uppgifter, steg och Min dag', () => {
    const s = applyOp(demoSeed(U), op({ table: 'lists', action: 'delete', match: { id: 'demo-list-shop' } }));
    expect(s.tasks.some((t) => t.list_id === 'demo-list-shop')).toBe(false);
    expect(s.steps).toHaveLength(0);
    expect(s.members.some((m) => m.list_id === 'demo-list-shop')).toBe(false);
  });

  it('borttagen medlem tappar tilldelningar', () => {
    let s = demoSeed(U);
    s = { ...s, members: [...s.members, { list_id: 'demo-list-shop', user_id: 'bo', role: 'member', position: 0 }] };
    s = applyOp(s, op({ table: 'tasks', action: 'update', match: { id: 'demo-t1' }, values: { assigned_to: 'bo' } }));
    s = applyOp(s, op({ table: 'list_members', action: 'delete', match: { list_id: 'demo-list-shop', user_id: 'bo' } }));
    expect(s.tasks.find((t) => t.id === 'demo-t1')?.assigned_to).toBeNull();
  });

  it('dubbel insert ersätter i stället för att duplicera', () => {
    const ins = op({ table: 'steps', action: 'insert', match: { id: 'x' }, values: { id: 'x', task_id: 'demo-t1', title: 'a', completed: false, position: 5, created_at: '' } });
    const s = applyOp(applyOp(demoSeed(U), ins), ins);
    expect(s.steps.filter((x) => x.id === 'x')).toHaveLength(1);
  });
});

describe('applyRemote', () => {
  it('lägger till, uppdaterar och tar bort uppgifter från realtid', () => {
    let s = demoSeed(U);
    const row = { ...s.tasks[0], id: 'R', title: 'Från fru' };
    s = applyRemote(s, 'tasks', 'INSERT', row, {});
    expect(s.tasks.find((t) => t.id === 'R')?.title).toBe('Från fru');
    s = applyRemote(s, 'tasks', 'UPDATE', { ...row, completed: true }, {});
    expect(s.tasks.find((t) => t.id === 'R')?.completed).toBe(true);
    s = applyRemote(s, 'tasks', 'DELETE', {}, { id: 'R' });
    expect(s.tasks.find((t) => t.id === 'R')).toBeUndefined();
  });

  it('ignorerar/ tar bort uppgift som flyttats till okänd lista', () => {
    let s = demoSeed(U);
    s = applyRemote(s, 'tasks', 'UPDATE', { ...s.tasks[0], list_id: 'okänd' }, {});
    expect(s.tasks.find((t) => t.id === 'demo-t1')).toBeUndefined();
    expect(s.steps.some((x) => x.task_id === 'demo-t1')).toBe(false);
  });
});

describe('smarta vyer', () => {
  it('Min dag, Viktigt, Planerat', () => {
    const s = demoSeed(U);
    expect(tasksForSmartView(s, U, 'myday').map((t) => t.title)).toEqual(['Boka tvättid']);
    expect(tasksForSmartView(s, U, 'important').map((t) => t.title).sort()).toEqual(['Betala räkningar', 'Ägg']);
    expect(tasksForSmartView(s, U, 'planned').map((t) => t.title)).toEqual(['Betala räkningar']);
  });

  it('Min dag från igår syns inte idag', () => {
    const s = { ...demoSeed(U), myDay: [{ user_id: U, task_id: 'demo-t1', day: '2000-01-01' }] };
    expect(tasksForSmartView(s, U, 'myday')).toHaveLength(0);
  });

  it('sorterar alfabetiskt på svenska', () => {
    const s = demoSeed(U);
    expect(sortTasks(s.tasks.filter((t) => t.list_id === 'demo-list-shop'), 'alpha').map((t) => t.title)).toEqual(['Bröd', 'Kaffe', 'Mjölk', 'Ägg']);
  });
});

describe('datum', () => {
  it('formaterar relativa datum', () => {
    expect(formatDue('2026-11-22', '2026-11-22')).toBe('Idag');
    expect(formatDue('2026-11-23', '2026-11-22')).toBe('Imorgon');
    expect(formatDue('2026-11-21', '2026-11-22')).toBe('Igår');
    expect(formatDue('2026-11-25', '2026-11-22')).toBe('Onsdag');
  });
  it('räknar fram datum', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(nextWeekday('2026-11-22', 1)).toBe('2026-11-23'); // söndag -> måndag
    expect(nextWeekday('2026-11-23', 1)).toBe('2026-11-30'); // måndag -> nästa måndag
  });
});
