-- =============================================================================
-- Bocka – databasschema för listor, uppgifter, delning och inbjudningar.
-- Körs i Supabase (SQL Editor eller `supabase db push`).
-- All åtkomst skyddas med Row Level Security: man ser bara listor man är medlem i.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Profiler (en per inloggad användare, skapas automatiskt vid registrering)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Listor och medlemskap
-- -----------------------------------------------------------------------------
create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  emoji      text check (emoji is null or char_length(emoji) <= 16),
  color      text not null default 'blue' check (char_length(color) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.list_members (
  list_id   uuid not null references public.lists (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  position  double precision not null default 0, -- användarens egen sortering i sidomenyn
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_members_user_idx on public.list_members (user_id);

-- Hjälpfunktioner (security definer för att undvika rekursiv RLS)
create or replace function public.is_list_member(p_list_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.list_members
    where list_id = p_list_id and user_id = p_user_id
  );
$$;

create or replace function public.is_list_owner(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lists
    where id = p_list_id and owner_id = auth.uid()
  );
$$;

-- Skaparen blir automatiskt ägare/medlem
create or replace function public.handle_new_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.list_members (list_id, user_id, role, position)
  values (
    new.id,
    new.owner_id,
    'owner',
    coalesce((select max(position) + 1 from public.list_members where user_id = new.owner_id), 0)
  );
  return new;
end;
$$;

create trigger on_list_created
  after insert on public.lists
  for each row execute function public.handle_new_list();

-- -----------------------------------------------------------------------------
-- Uppgifter och delsteg
-- -----------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.lists (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 1000),
  note         text not null default '' check (char_length(note) <= 20000),
  completed    boolean not null default false,
  completed_at timestamptz,
  important    boolean not null default false,
  due_date     date,
  recurrence   text check (recurrence in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  assigned_to  uuid references auth.users (id) on delete set null,
  position     double precision not null default 0,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_list_idx on public.tasks (list_id);
create index tasks_assigned_idx on public.tasks (assigned_to) where assigned_to is not null;

create table public.steps (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 1000),
  completed  boolean not null default false,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index steps_task_idx on public.steps (task_id);

-- "Min dag" är personlig – även i delade listor
create table public.my_day (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  day     date not null default current_date,
  primary key (user_id, task_id)
);
create index my_day_task_idx on public.my_day (task_id);

-- -----------------------------------------------------------------------------
-- Inbjudningar
--   email null  => delningslänk, kan användas av flera tills den återkallas/går ut
--   email satt  => personlig inbjudan, engångs. Visas även i appen för den adressen.
-- -----------------------------------------------------------------------------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists (id) on delete cascade,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  email       text check (email is null or email = lower(email)),
  invited_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);
create index invitations_list_idx on public.invitations (list_id);
create index invitations_email_idx on public.invitations (email) where email is not null;

-- -----------------------------------------------------------------------------
-- Triggers: updated_at, completed_at, återkommande uppgifter, städning
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger steps_touch before update on public.steps
  for each row execute function public.touch_updated_at();

create or replace function public.next_due_date(p_base date, p_rule text)
returns date
language sql
immutable
as $$
  select case p_rule
    when 'daily'    then p_base + 1
    when 'weekdays' then p_base + case extract(isodow from p_base)::int when 5 then 3 when 6 then 2 else 1 end
    when 'weekly'   then p_base + 7
    when 'monthly'  then (p_base + interval '1 month')::date
    when 'yearly'   then (p_base + interval '1 year')::date
  end;
$$;

create or replace function public.handle_task_completion()
returns trigger
language plpgsql
as $$
declare
  v_next_id uuid;
  v_due     date;
begin
  if tg_op = 'INSERT' then
    if new.completed then new.completed_at := coalesce(new.completed_at, now()); end if;
    return new;
  end if;

  if new.completed and not old.completed then
    new.completed_at := now();

    -- Återkommande: skapa nästa förekomst och låt den avklarade bli en vanlig uppgift
    if new.recurrence is not null then
      -- Nästa datum efter förfallodatum, men aldrig i det förflutna
      v_due := coalesce(new.due_date, current_date);
      loop
        v_due := public.next_due_date(v_due, new.recurrence);
        exit when v_due >= current_date;
      end loop;

      insert into public.tasks (list_id, title, note, important, due_date, recurrence, assigned_to, position, created_by)
      values (
        new.list_id, new.title, new.note, new.important,
        v_due, new.recurrence, new.assigned_to, new.position, new.created_by
      )
      returning id into v_next_id;

      insert into public.steps (task_id, title, position)
      select v_next_id, s.title, s.position from public.steps s where s.task_id = new.id;

      new.recurrence := null;
    end if;
  elsif not new.completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completion
  before insert or update of completed on public.tasks
  for each row execute function public.handle_task_completion();

-- När någon lämnar/tas bort från en lista: ta bort tilldelningar och "Min dag"
create or replace function public.handle_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks set assigned_to = null
   where list_id = old.list_id and assigned_to = old.user_id;
  delete from public.my_day m
   using public.tasks t
   where m.task_id = t.id and t.list_id = old.list_id and m.user_id = old.user_id;
  return old;
end;
$$;

create trigger on_member_removed
  after delete on public.list_members
  for each row execute function public.handle_member_removed();

-- Tilldelad person måste vara medlem i listan
create or replace function public.check_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and not public.is_list_member(new.list_id, new.assigned_to) then
    if tg_op = 'UPDATE' and new.list_id <> old.list_id then
      new.assigned_to := null; -- flyttad till lista där personen inte är med
    else
      raise exception 'Personen är inte medlem i listan' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_check_assignee
  before insert or update of assigned_to, list_id on public.tasks
  for each row execute function public.check_task_assignee();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.lists        enable row level security;
alter table public.list_members enable row level security;
alter table public.tasks        enable row level security;
alter table public.steps        enable row level security;
alter table public.my_day       enable row level security;
alter table public.invitations  enable row level security;

-- Profiler: sig själv + personer man delar en lista med
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.list_members mine
      join public.list_members theirs on theirs.list_id = mine.list_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Listor
create policy lists_select on public.lists for select to authenticated
  using (public.is_list_member(id));
create policy lists_insert on public.lists for insert to authenticated
  with check (owner_id = auth.uid());
create policy lists_update on public.lists for update to authenticated
  using (public.is_list_member(id)) with check (public.is_list_member(id));
create policy lists_delete on public.lists for delete to authenticated
  using (owner_id = auth.uid());

-- Medlemskap (läggs till via trigger / accept_invitation)
create policy members_select on public.list_members for select to authenticated
  using (public.is_list_member(list_id));
create policy members_update on public.list_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete on public.list_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.is_list_owner(list_id)));

-- Uppgifter
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_list_member(list_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_list_member(list_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_list_member(list_id)) with check (public.is_list_member(list_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_list_member(list_id));

-- Delsteg
create policy steps_all on public.steps for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_list_member(t.list_id)))
  with check (exists (select 1 from public.tasks t where t.id = task_id and public.is_list_member(t.list_id)));

-- Min dag
create policy my_day_select on public.my_day for select to authenticated
  using (user_id = auth.uid());
create policy my_day_insert on public.my_day for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and public.is_list_member(t.list_id))
  );
create policy my_day_update on public.my_day for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy my_day_delete on public.my_day for delete to authenticated
  using (user_id = auth.uid());

-- Inbjudningar (alla medlemmar får bjuda in)
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_list_member(list_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_list_member(list_id) and invited_by = auth.uid() and accepted_by is null);
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_list_member(list_id));

-- -----------------------------------------------------------------------------
-- Behörigheter (kolumnnivå där det spelar roll)
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.lists, public.list_members, public.tasks,
              public.steps, public.my_day, public.invitations from anon;

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select, insert, delete on public.lists to authenticated;
revoke update on public.lists from authenticated;
grant update (name, emoji, color) on public.lists to authenticated;

grant select, delete on public.list_members to authenticated;
revoke insert, update on public.list_members from authenticated;
grant update (position) on public.list_members to authenticated;

grant select, insert, update, delete on public.tasks, public.steps, public.my_day to authenticated;

grant select, insert, delete on public.invitations to authenticated;
revoke update on public.invitations from authenticated;

-- -----------------------------------------------------------------------------
-- RPC: inbjudningsflödet
-- -----------------------------------------------------------------------------

-- Förhandsvisning av en inbjudan (fungerar även utloggad – token är hemligheten)
create or replace function public.get_invitation(p_token text)
returns table (list_id uuid, list_name text, list_emoji text, inviter_name text, valid boolean, already_member boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.emoji,
         coalesce(p.display_name, p.email, 'Någon'),
         (i.expires_at > now() and (i.email is null or i.accepted_by is null)),
         coalesce(public.is_list_member(l.id, auth.uid()), false)
  from public.invitations i
  join public.lists l on l.id = i.list_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad' using errcode = '28000';
  end if;

  select * into v_inv from public.invitations where token = p_token for update;
  if not found then
    raise exception 'Inbjudan finns inte eller har återkallats' using errcode = 'P0002';
  end if;

  if public.is_list_member(v_inv.list_id) then
    return v_inv.list_id;
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'Inbjudan har gått ut' using errcode = 'P0001';
  end if;
  if v_inv.email is not null and v_inv.accepted_by is not null then
    raise exception 'Inbjudan har redan använts' using errcode = 'P0001';
  end if;

  insert into public.list_members (list_id, user_id, role, position)
  values (
    v_inv.list_id, auth.uid(), 'member',
    coalesce((select max(position) + 1 from public.list_members where user_id = auth.uid()), 0)
  )
  on conflict do nothing;

  if v_inv.email is not null then
    update public.invitations set accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  end if;

  return v_inv.list_id;
end;
$$;

-- Inbjudningar skickade till min e-postadress (oavsett inloggningsmetod med samma adress)
create or replace function public.my_pending_invitations()
returns table (id uuid, token text, list_id uuid, list_name text, list_emoji text, inviter_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.token, l.id, l.name, l.emoji, coalesce(p.display_name, p.email, 'Någon'), i.created_at
  from public.invitations i
  join public.lists l on l.id = i.list_id
  left join public.profiles p on p.id = i.invited_by
  where i.email is not null
    and i.email = lower(auth.jwt() ->> 'email')
    and i.accepted_by is null
    and i.expires_at > now()
    and not public.is_list_member(i.list_id)
  order by i.created_at desc;
$$;

create or replace function public.decline_invitation(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.invitations
  where id = p_id
    and email is not null
    and email = lower(auth.jwt() ->> 'email')
    and accepted_by is null;
$$;

-- Ägaren slutar dela: tar bort alla andra medlemmar och alla inbjudningar
create or replace function public.stop_sharing(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_list_owner(p_list_id) then
    raise exception 'Bara ägaren kan sluta dela listan' using errcode = '42501';
  end if;
  delete from public.invitations where list_id = p_list_id;
  delete from public.list_members where list_id = p_list_id and role <> 'owner';
end;
$$;

revoke execute on function public.get_invitation(text) from public;
revoke execute on function public.accept_invitation(text) from public;
revoke execute on function public.my_pending_invitations() from public;
revoke execute on function public.decline_invitation(uuid) from public;
revoke execute on function public.stop_sharing(uuid) from public;

grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.my_pending_invitations() to authenticated;
grant execute on function public.decline_invitation(uuid) to authenticated;
grant execute on function public.stop_sharing(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtid: ändringar pushas direkt till alla medlemmar (RLS gäller även här)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.lists, public.list_members, public.tasks, public.steps, public.my_day, public.invitations;
  end if;
end;
$$;
