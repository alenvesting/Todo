-- Säkerhets- och funktionstester för schemat. Körs av supabase/tests/run.sh.
-- Användare: Anna (ägare), Bo (bjuds in), Eve (utomstående).
\set ON_ERROR_STOP 1

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Anna@Example.com', '{"full_name":"Anna Andersson"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bo@example.com',   '{"name":"Bo"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com',  '{}');

create or replace function pg_temp.as_user(p_id text, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email)::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'TEST FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % (%)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'TEST FAILED: förväntade fel: %', p_msg;
end $$;

-- Profiler skapades
select pg_temp.check((select display_name from profiles where email = 'anna@example.com') = 'Anna Andersson', 'profil skapas med namn och gemener i e-post');
select pg_temp.check((select display_name from profiles where id = '00000000-0000-0000-0000-00000000000e') = 'eve', 'profil utan namn får e-postprefix');

-- ===== Anna skapar en lista =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'anna@example.com');
insert into lists (id, name, emoji) values ('10000000-0000-0000-0000-000000000001', 'Inköpslista', '🛒');
insert into tasks (id, list_id, title) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mjölk'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Bröd');
insert into steps (task_id, title) values ('20000000-0000-0000-0000-000000000001', 'Laktosfri');
select pg_temp.check((select role from list_members where user_id = auth.uid()) = 'owner', 'skaparen blir ägare');
select pg_temp.check((select count(*) from tasks) = 2, 'Anna ser sina uppgifter');
select pg_temp.fails($$ update list_members set role = 'member' where user_id = auth.uid() $$, 'kan inte ändra roll');
select pg_temp.fails($$ update lists set owner_id = '00000000-0000-0000-0000-00000000000e' $$, 'kan inte byta ägare');
select pg_temp.fails($$ insert into list_members (list_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b') $$, 'kan inte lägga till medlemmar direkt');
select pg_temp.fails($$ update tasks set assigned_to = '00000000-0000-0000-0000-00000000000b' where id = '20000000-0000-0000-0000-000000000001' $$, 'kan inte tilldela icke-medlem');

-- Completed_at sätts automatiskt
update tasks set completed = true where id = '20000000-0000-0000-0000-000000000002';
select pg_temp.check((select completed_at is not null from tasks where id = '20000000-0000-0000-0000-000000000002'), 'completed_at sätts');
update tasks set completed = false where id = '20000000-0000-0000-0000-000000000002';
select pg_temp.check((select completed_at is null from tasks where id = '20000000-0000-0000-0000-000000000002'), 'completed_at nollställs');

-- Återkommande uppgift
insert into tasks (id, list_id, title, recurrence, due_date) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Kaffe', 'weekly', current_date);
insert into steps (task_id, title) values ('20000000-0000-0000-0000-000000000003', 'Mellanrost');
update tasks set completed = true where id = '20000000-0000-0000-0000-000000000003';
select pg_temp.check((select count(*) from tasks where title = 'Kaffe' and not completed and recurrence = 'weekly' and due_date = current_date + 7) = 1, 'återkommande skapar nästa förekomst');
select pg_temp.check((select recurrence is null from tasks where id = '20000000-0000-0000-0000-000000000003'), 'avklarad förekomst slutar återkomma');
select pg_temp.check((select count(*) from steps s join tasks t on t.id = s.task_id where t.title = 'Kaffe' and not t.completed) = 1, 'delsteg kopieras');
select pg_temp.check(next_due_date('2026-11-20', 'weekdays') = '2026-11-23', 'vardagar hoppar över helg');
select pg_temp.check(next_due_date('2026-01-31', 'monthly') = '2026-02-28', 'månadsvis hanterar kort månad');

-- Min dag
insert into my_day (task_id, day) values ('20000000-0000-0000-0000-000000000001', current_date);

-- Inbjudningar
insert into invitations (id, list_id, token) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'linktoken');
insert into invitations (id, list_id, token, email) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'mailtoken', 'bo@example.com');
reset role;

-- ===== Eve (utomstående) ser ingenting =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'eve@example.com');
select pg_temp.check((select count(*) from lists) = 0, 'Eve ser inga listor');
select pg_temp.check((select count(*) from tasks) = 0, 'Eve ser inga uppgifter');
select pg_temp.check((select count(*) from steps) = 0, 'Eve ser inga delsteg');
select pg_temp.check((select count(*) from invitations) = 0, 'Eve ser inga inbjudningar/tokens');
select pg_temp.check((select count(*) from profiles) = 1, 'Eve ser bara sin egen profil');
select pg_temp.check((select count(*) from my_day) = 0, 'Eve ser inte Annas Min dag');
select pg_temp.check((select count(*) from my_pending_invitations()) = 0, 'Eve har inga personliga inbjudningar');
select pg_temp.fails($$ insert into tasks (list_id, title) values ('10000000-0000-0000-0000-000000000001', 'Hack') $$, 'Eve kan inte skapa uppgift i Annas lista');
select pg_temp.fails($$ insert into invitations (list_id) values ('10000000-0000-0000-0000-000000000001') $$, 'Eve kan inte skapa inbjudan');
select pg_temp.fails($$ insert into my_day (task_id) values ('20000000-0000-0000-0000-000000000001') $$, 'Eve kan inte lägga Annas uppgift i Min dag');
update tasks set title = 'Hackad';
delete from tasks;
reset role;
select pg_temp.check((select count(*) from tasks where title = 'Hackad') = 0 and (select count(*) from tasks) = 4, 'Eves ändringar/raderingar påverkar inget');

-- ===== Bo tar emot personlig inbjudan =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'bo@example.com');
select pg_temp.check((select list_name from get_invitation('mailtoken')) = 'Inköpslista', 'förhandsvisning av inbjudan');
select pg_temp.check((select inviter_name from get_invitation('mailtoken')) = 'Anna Andersson', 'förhandsvisning visar avsändare');
select pg_temp.check((select count(*) from my_pending_invitations()) = 1, 'Bo ser sin personliga inbjudan');
select pg_temp.check(accept_invitation('mailtoken') = '10000000-0000-0000-0000-000000000001', 'Bo accepterar');
select pg_temp.check((select count(*) from tasks) = 4, 'Bo ser listans uppgifter');
select pg_temp.check((select count(*) from profiles) = 2, 'Bo ser Annas profil');
select pg_temp.check((select count(*) from my_day) = 0, 'Bo ser inte Annas Min dag');
select pg_temp.check((select count(*) from my_pending_invitations()) = 0, 'inbjudan försvinner efter accept');
update tasks set completed = true, assigned_to = auth.uid() where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.check((select completed from tasks where id = '20000000-0000-0000-0000-000000000001'), 'Bo kan bocka av');
delete from lists where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from lists) = 1, 'Bo kan inte radera listan');
delete from list_members where role = 'owner';
select pg_temp.check((select count(*) from list_members where role = 'owner') = 1, 'Bo kan inte ta bort ägaren');
reset role;

-- ===== Eve försöker använda den förbrukade personliga inbjudan, sedan länken =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'eve@example.com');
select pg_temp.fails($$ select accept_invitation('mailtoken') $$, 'personlig inbjudan är engångs');
select pg_temp.fails($$ select accept_invitation('finnsinte') $$, 'okänd token avvisas');
select pg_temp.check(accept_invitation('linktoken') = '10000000-0000-0000-0000-000000000001', 'delningslänk kan användas');
select pg_temp.check((select count(*) from list_members) = 3, 'tre medlemmar');
-- Eve lämnar
delete from list_members where user_id = auth.uid();
select pg_temp.check((select count(*) from lists) = 0, 'Eve har lämnat listan');
reset role;

-- ===== Anna tar bort Bo -> tilldelning rensas =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'anna@example.com');
delete from list_members where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select assigned_to is null from tasks where id = '20000000-0000-0000-0000-000000000001'), 'tilldelning rensas när medlem tas bort');
-- Utgången länk
select pg_temp.fails($$ update invitations set expires_at = now() + interval '1 year' $$, 'inbjudningar kan inte ändras');
reset role;
update invitations set expires_at = now() - interval '1 day' where token = 'linktoken';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'bo@example.com');
select pg_temp.fails($$ select accept_invitation('linktoken') $$, 'utgången länk avvisas');
reset role;

-- stop_sharing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'eve@example.com');
select pg_temp.fails($$ select stop_sharing('10000000-0000-0000-0000-000000000001') $$, 'bara ägaren kan sluta dela');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'anna@example.com');
select stop_sharing('10000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from invitations) = 0, 'stop_sharing tar bort inbjudningar');
delete from lists where id = '10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.check((select count(*) from tasks) = 0 and (select count(*) from steps) = 0, 'radera lista tar bort allt');

-- anon kan förhandsvisa men inte läsa tabeller
set role anon;
select pg_temp.fails($$ select * from tasks $$, 'anon har ingen tabellåtkomst');
reset role;

\echo 'ALLA TESTER GICK IGENOM'
