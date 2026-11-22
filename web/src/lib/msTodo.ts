/**
 * Import från Microsoft To Do via Microsoft Graph.
 * Inloggningen sker direkt mot Microsoft (OAuth 2 med PKCE) och ger bara läsrätt (Tasks.Read).
 * Ingenting ändras eller tas bort i Microsoft To Do.
 */
import { isoDate } from './dates';
import type { Recurrence } from './types';

export const msClientId = import.meta.env.VITE_MS_CLIENT_ID as string | undefined;

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'Tasks.Read';
const SS_KEY = 'bocka:ms-auth';

export function importRedirectUri(): string {
  return `${window.location.origin}/import`;
}

// ---------------------------------------------------------------------------
// Inloggning (Authorization Code + PKCE, för "Single-page application" i Azure)
// ---------------------------------------------------------------------------
function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 32): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return base64url(a);
}

export async function startMicrosoftAuth(): Promise<void> {
  if (!msClientId) throw new Error('VITE_MS_CLIENT_ID saknas');
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(SS_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: msClientId,
    response_type: 'code',
    redirect_uri: importRedirectUri(),
    // Fragment (#code=…) så att Supabase inte tror att det är dess egen inloggning (?code=…)
    response_mode: 'fragment',
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  window.location.assign(`${AUTHORITY}/authorize?${params}`);
}

/** Byter koden från Microsoft mot en åtkomsttoken. Returnerar null om URL:en inte är en återkomst från Microsoft. */
export async function finishMicrosoftAuth(search: URLSearchParams): Promise<string | null> {
  const error = search.get('error');
  if (error) {
    const desc = search.get('error_description') ?? '';
    if (error === 'access_denied') throw new Error('Inloggningen hos Microsoft avbröts.');
    throw new Error(`Microsoft svarade med ett fel: ${desc || error}`);
  }
  const code = search.get('code');
  if (!code) return null;
  const saved = JSON.parse(sessionStorage.getItem(SS_KEY) ?? 'null') as { verifier: string; state: string } | null;
  sessionStorage.removeItem(SS_KEY);
  if (!saved || saved.state !== search.get('state')) throw new Error('Inloggningen gick ut. Försök igen.');

  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: msClientId!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: importRedirectUri(),
      code_verifier: saved.verifier,
      scope: SCOPE,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error_description?.split('\r')[0] || 'Kunde inte logga in hos Microsoft.');
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Microsoft Graph
// ---------------------------------------------------------------------------
export interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

export interface GraphList {
  id: string;
  displayName: string;
  isOwner?: boolean;
  isShared?: boolean;
  wellknownListName?: 'none' | 'defaultList' | 'flaggedEmails' | 'unknownFutureValue' | string;
}

export interface GraphChecklistItem {
  id: string;
  displayName: string;
  isChecked: boolean;
}

export interface GraphTask {
  id: string;
  title: string;
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred' | string;
  importance: 'low' | 'normal' | 'high' | string;
  createdDateTime?: string;
  completedDateTime?: GraphDateTime | null;
  dueDateTime?: GraphDateTime | null;
  body?: { content: string; contentType: 'text' | 'html' | string } | null;
  recurrence?: { pattern?: { type?: string; interval?: number; daysOfWeek?: string[] } } | null;
  checklistItems?: GraphChecklistItem[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphGet<T>(token: string, url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.startsWith('http') ? url : GRAPH + url, { headers: { Authorization: `Bearer ${token}` } });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = Number(res.headers.get('Retry-After')) || 2 ** attempt;
      await sleep(wait * 1000);
      continue;
    }
    if (res.status === 401) throw new Error('Inloggningen hos Microsoft har gått ut. Börja om importen.');
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw Object.assign(new Error(body.error?.message || `Microsoft Graph svarade ${res.status}`), { status: res.status });
    }
    return (await res.json()) as T;
  }
}

async function graphAll<T>(token: string, url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const page: { value: T[]; '@odata.nextLink'?: string } = await graphGet(token, next);
    out.push(...page.value);
    next = page['@odata.nextLink'];
  }
  return out;
}

export async function fetchMsLists(token: string): Promise<GraphList[]> {
  return graphAll<GraphList>(token, '/me/todo/lists');
}

export async function fetchMsTasks(token: string, listId: string): Promise<GraphTask[]> {
  const base = `/me/todo/lists/${encodeURIComponent(listId)}/tasks`;
  try {
    return await graphAll<GraphTask>(token, `${base}?$top=100&$expand=checklistItems`);
  } catch (e) {
    if ((e as { status?: number }).status !== 400) throw e;
    // Reserv om $expand inte stöds: hämta delstegen per uppgift
    const tasks = await graphAll<GraphTask>(token, `${base}?$top=100`);
    for (const t of tasks) {
      t.checklistItems = await graphAll<GraphChecklistItem>(token, `${base}/${encodeURIComponent(t.id)}/checklistItems`);
    }
    return tasks;
  }
}

// ---------------------------------------------------------------------------
// Konvertering till Bockas format (rena funktioner, enhetstestade)
// ---------------------------------------------------------------------------
const leadingEmoji = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|\p{Emoji_Modifier}|\p{Regional_Indicator})*)\s*/u;

/** Microsoft To Do använder en emoji först i namnet som listikon – plocka ut den */
export function splitEmoji(name: string): { name: string; emoji: string | null } {
  const trimmed = name.trim();
  const m = trimmed.match(leadingEmoji);
  if (m && trimmed.length > m[0].length) return { emoji: m[1], name: trimmed.slice(m[0].length).trim() };
  return { emoji: null, name: trimmed };
}

export function listName(l: GraphList): { name: string; emoji: string | null } {
  if (l.wellknownListName === 'defaultList' && (!l.displayName || l.displayName === 'Tasks')) return { name: 'Uppgifter', emoji: null };
  if (l.wellknownListName === 'flaggedEmails' && (!l.displayName || l.displayName === 'Flagged Emails')) return { name: 'Flaggad e-post', emoji: null };
  return splitEmoji(l.displayName || 'Namnlös lista');
}

/** Graph anger datum som klockslag i en tidszon – omvandla till lokalt datum */
export function graphDate(d: GraphDateTime | null | undefined): string | null {
  if (!d?.dateTime) return null;
  // Midnatt = ett rent datum (vanligast). Annars: omvandla från UTC till lokal tid.
  if (/T00:00(:00(\.0+)?)?$/.test(d.dateTime)) return d.dateTime.slice(0, 10);
  const tz = (d.timeZone || '').toUpperCase();
  if (tz === 'UTC' || tz === 'Z' || tz === 'GMT') {
    const parsed = new Date(d.dateTime.replace(/(\.\d{3})\d*$/, '$1') + 'Z');
    if (!isNaN(parsed.getTime())) return isoDate(parsed);
  }
  return d.dateTime.slice(0, 10);
}

export function graphDateTimeIso(d: GraphDateTime | null | undefined): string | null {
  if (!d?.dateTime) return null;
  const parsed = new Date(d.dateTime.replace(/(\.\d{3})\d*$/, '$1') + (/(Z|[+-]\d\d:?\d\d)$/.test(d.dateTime) ? '' : 'Z'));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function mapRecurrence(r: GraphTask['recurrence']): Recurrence | null {
  const p = r?.pattern;
  if (!p?.type) return null;
  switch (p.type) {
    case 'daily':
      return 'daily';
    case 'weekly': {
      const days = (p.daysOfWeek ?? []).map((d) => d.toLowerCase()).sort();
      const weekdays = ['friday', 'monday', 'thursday', 'tuesday', 'wednesday'];
      if (days.length === 5 && days.every((d, i) => d === weekdays[i])) return 'weekdays';
      return 'weekly';
    }
    case 'absoluteMonthly':
    case 'relativeMonthly':
      return 'monthly';
    case 'absoluteYearly':
    case 'relativeYearly':
      return 'yearly';
    default:
      return null;
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ImportTask {
  title: string;
  note: string;
  completed: boolean;
  completed_at: string | null;
  important: boolean;
  due_date: string | null;
  recurrence: Recurrence | null;
  created_at: string | null;
  steps: { title: string; completed: boolean }[];
}

export function mapTask(t: GraphTask): ImportTask {
  const completed = t.status === 'completed';
  const body = t.body?.content ?? '';
  const note = t.body?.contentType === 'html' ? htmlToText(body) : body.trim();
  return {
    title: (t.title || '').trim().slice(0, 1000) || 'Namnlös uppgift',
    note: note.slice(0, 20000),
    completed,
    completed_at: completed ? graphDateTimeIso(t.completedDateTime) : null,
    important: t.importance === 'high',
    due_date: graphDate(t.dueDateTime),
    recurrence: completed ? null : mapRecurrence(t.recurrence),
    created_at: t.createdDateTime ?? null,
    steps: (t.checklistItems ?? [])
      .filter((c) => c.displayName?.trim())
      .map((c) => ({ title: c.displayName.trim().slice(0, 1000), completed: !!c.isChecked })),
  };
}

export interface ImportList {
  name: string;
  emoji: string | null;
  color: string;
  tasks: ImportTask[];
}
