import { describe, expect, it } from 'vitest';
import { applyOp } from './apply';
import { demoSeed } from './demo';
import { graphDate, htmlToText, listName, mapRecurrence, mapTask, splitEmoji, type GraphTask } from './msTodo';

describe('listnamn', () => {
  it('plockar ut emoji som Microsoft To Do använder som ikon', () => {
    expect(splitEmoji('🛒 Inköpslista')).toEqual({ emoji: '🛒', name: 'Inköpslista' });
    expect(splitEmoji('🏠Hemma')).toEqual({ emoji: '🏠', name: 'Hemma' });
    expect(splitEmoji('👨‍👩‍👧 Familjen')).toEqual({ emoji: '👨‍👩‍👧', name: 'Familjen' });
    expect(splitEmoji('❤️ Kärlek')).toEqual({ emoji: '❤️', name: 'Kärlek' });
    expect(splitEmoji('Jobb')).toEqual({ emoji: null, name: 'Jobb' });
    expect(splitEmoji('🎉')).toEqual({ emoji: null, name: '🎉' }); // bara emoji = behåll som namn
    expect(splitEmoji('2024 budget')).toEqual({ emoji: null, name: '2024 budget' });
  });

  it('översätter standardlistor', () => {
    expect(listName({ id: '1', displayName: 'Tasks', wellknownListName: 'defaultList' }).name).toBe('Uppgifter');
    expect(listName({ id: '2', displayName: 'Uppgifter', wellknownListName: 'defaultList' }).name).toBe('Uppgifter');
    expect(listName({ id: '3', displayName: 'Flagged Emails', wellknownListName: 'flaggedEmails' }).name).toBe('Flaggad e-post');
  });
});

describe('datum från Graph', () => {
  it('midnatt UTC blir samma dag', () => {
    expect(graphDate({ dateTime: '2026-11-25T00:00:00.0000000', timeZone: 'UTC' })).toBe('2026-11-25');
  });
  it('23:00 UTC dagen innan blir rätt dag i Sverige', () => {
    expect(graphDate({ dateTime: '2026-11-24T23:00:00.0000000', timeZone: 'UTC' })).toBe('2026-11-25');
  });
  it('annan tidszon: använd datumdelen', () => {
    expect(graphDate({ dateTime: '2026-11-25T00:00:00.0000000', timeZone: 'W. Europe Standard Time' })).toBe('2026-11-25');
  });
  it('saknat datum', () => {
    expect(graphDate(null)).toBeNull();
  });
});

describe('upprepning', () => {
  it('mappar mönster', () => {
    expect(mapRecurrence({ pattern: { type: 'daily', interval: 1 } })).toBe('daily');
    expect(mapRecurrence({ pattern: { type: 'weekly', daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] } })).toBe('weekdays');
    expect(mapRecurrence({ pattern: { type: 'weekly', daysOfWeek: ['sunday'] } })).toBe('weekly');
    expect(mapRecurrence({ pattern: { type: 'absoluteMonthly' } })).toBe('monthly');
    expect(mapRecurrence({ pattern: { type: 'relativeYearly' } })).toBe('yearly');
    expect(mapRecurrence(null)).toBeNull();
  });
});

describe('uppgifter', () => {
  const sample: GraphTask = {
    id: 'AAMk',
    title: '  Mjölk ',
    status: 'notStarted',
    importance: 'high',
    createdDateTime: '2025-03-01T10:00:00.123Z',
    dueDateTime: { dateTime: '2026-11-24T23:00:00.0000000', timeZone: 'UTC' },
    body: { content: '<html><body><p>Laktosfri &amp; ekologisk</p><p>2 liter</p></body></html>', contentType: 'html' },
    recurrence: { pattern: { type: 'weekly', daysOfWeek: ['saturday'] } },
    checklistItems: [
      { id: 'c1', displayName: 'Arla', isChecked: true },
      { id: 'c2', displayName: '  ', isChecked: false },
      { id: 'c3', displayName: 'Oatly', isChecked: false },
    ],
  };

  it('konverterar alla fält', () => {
    expect(mapTask(sample)).toEqual({
      title: 'Mjölk',
      note: 'Laktosfri & ekologisk\n2 liter',
      completed: false,
      completed_at: null,
      important: true,
      due_date: '2026-11-25',
      recurrence: 'weekly',
      created_at: '2025-03-01T10:00:00.123Z',
      steps: [
        { title: 'Arla', completed: true },
        { title: 'Oatly', completed: false },
      ],
    });
  });

  it('slutförd uppgift får slutdatum och slutar upprepas', () => {
    const t = mapTask({
      ...sample,
      status: 'completed',
      completedDateTime: { dateTime: '2026-11-20T00:00:00.0000000', timeZone: 'UTC' },
    });
    expect(t.completed).toBe(true);
    expect(t.completed_at).toBe('2026-11-20T00:00:00.000Z');
    expect(t.recurrence).toBeNull();
  });

  it('tom titel och textanteckning', () => {
    const t = mapTask({ id: 'x', title: '', status: 'notStarted', importance: 'normal', body: { content: ' Hej \n', contentType: 'text' } });
    expect(t.title).toBe('Namnlös uppgift');
    expect(t.note).toBe('Hej');
    expect(t.important).toBe(false);
    expect(t.steps).toEqual([]);
  });

  it('html med listor och radbrytningar', () => {
    expect(htmlToText('<ul><li>Ett</li><li>Två</li></ul>Rad<br>Ny')).toBe('• Ett\n• Två\nRad\nNy');
  });
});

describe('massinsättning', () => {
  it('lägger till många rader i ett steg', () => {
    const s = applyOp(demoSeed('u'), {
      id: 'op',
      table: 'tasks',
      action: 'insert',
      match: {},
      values: [
        { id: 'a', list_id: 'demo-list-home', title: 'A', completed: true, completed_at: null },
        { id: 'b', list_id: 'demo-list-home', title: 'B', completed: false, completed_at: null },
      ],
    }, 'NU');
    expect(s.tasks.filter((t) => t.id === 'a' || t.id === 'b')).toHaveLength(2);
    expect(s.tasks.find((t) => t.id === 'a')?.completed_at).toBe('NU');
  });
});
