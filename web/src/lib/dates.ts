/** Lokalt datum som YYYY-MM-DD */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

export function nextWeekday(today: string, isoDow: number): string {
  // isoDow: 1 = måndag
  const d = parseIso(today);
  const cur = ((d.getDay() + 6) % 7) + 1;
  let diff = (isoDow - cur + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(today, diff);
}

const weekday = new Intl.DateTimeFormat('sv-SE', { weekday: 'long' });
const short = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
const long = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function formatDue(due: string, today: string = isoDate()): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return 'Idag';
  if (diff === 1) return 'Imorgon';
  if (diff === -1) return 'Igår';
  const d = parseIso(due);
  if (diff > 1 && diff < 7) return capitalize(weekday.format(d));
  if (d.getFullYear() === parseIso(today).getFullYear()) return capitalize(short.format(d));
  return capitalize(long.format(d));
}

export function formatToday(d: Date = new Date()): string {
  return capitalize(new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(d));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
