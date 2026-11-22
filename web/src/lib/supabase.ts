import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DataState, Invitation, Op, PendingInvite } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null = demoläge (ingen Supabase konfigurerad, allt sparas bara i webbläsaren) */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

export const isDemo = supabase === null;

export type OAuthProvider = 'azure' | 'google' | 'facebook';

export const enabledProviders: OAuthProvider[] = (
  (import.meta.env.VITE_AUTH_PROVIDERS as string | undefined) ?? 'azure,google,facebook'
)
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is OAuthProvider => s === 'azure' || s === 'google' || s === 'facebook');

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase är inte konfigurerat');
  return supabase;
}

async function fetchAllRows<T>(table: string): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await client()
      .from(table)
      .select('*')
      .range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

export async function fetchState(): Promise<DataState> {
  const [lists, members, profiles, tasks, steps, myDay, invitations, pending] = await Promise.all([
    fetchAllRows<DataState['lists'][number]>('lists'),
    fetchAllRows<DataState['members'][number]>('list_members'),
    fetchAllRows<DataState['profiles'][number]>('profiles'),
    fetchAllRows<DataState['tasks'][number]>('tasks'),
    fetchAllRows<DataState['steps'][number]>('steps'),
    fetchAllRows<DataState['myDay'][number]>('my_day'),
    fetchAllRows<Invitation>('invitations'),
    client()
      .rpc('my_pending_invitations')
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as PendingInvite[];
      }),
  ]);
  return { lists, members, profiles, tasks, steps, myDay, invitations, pending };
}

export type ExecResult = { ok: true } | { ok: false; retry: boolean; message: string };

/** Skickar en köad ändring till servern */
export async function executeOp(op: Op): Promise<ExecResult> {
  const c = client();
  let q;
  if (op.action === 'insert') {
    q = c.from(op.table).insert(op.values ?? {});
  } else if (op.action === 'update') {
    q = c.from(op.table).update(op.values ?? {}).match(op.match);
  } else {
    q = c.from(op.table).delete().match(op.match);
  }
  const { error, status } = await q;
  if (!error) return { ok: true };
  // Redan skapad (t.ex. omsänd efter tappad uppkoppling) räknas som lyckad
  if (op.action === 'insert' && error.code === '23505') return { ok: true };
  const retry = status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
  return { ok: false, retry, message: error.message };
}

export async function createInvitation(listId: string, email: string | null): Promise<Invitation> {
  const { data, error } = await client()
    .from('invitations')
    .insert({ list_id: listId, email: email ? email.trim().toLowerCase() : null })
    .select()
    .single();
  if (error) throw error;
  return data as Invitation;
}

export async function deleteInvitation(id: string): Promise<void> {
  const { error } = await client().from('invitations').delete().eq('id', id);
  if (error) throw error;
}

export async function acceptInvitation(token: string): Promise<string> {
  const { data, error } = await client().rpc('accept_invitation', { p_token: token });
  if (error) throw error;
  return data as string;
}

export async function declineInvitation(id: string): Promise<void> {
  const { error } = await client().rpc('decline_invitation', { p_id: id });
  if (error) throw error;
}

export async function stopSharing(listId: string): Promise<void> {
  const { error } = await client().rpc('stop_sharing', { p_list_id: listId });
  if (error) throw error;
}

export interface InvitationPreview {
  list_id: string;
  list_name: string;
  list_emoji: string | null;
  inviter_name: string;
  valid: boolean;
  already_member: boolean;
}

export async function getInvitation(token: string): Promise<InvitationPreview | null> {
  const { data, error } = await client().rpc('get_invitation', { p_token: token });
  if (error) throw error;
  return ((data as InvitationPreview[] | null) ?? [])[0] ?? null;
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}
