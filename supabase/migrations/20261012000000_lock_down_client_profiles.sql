-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- PRIVACY FIX, same severity class as 20261004000000 (any user could read
-- any chat). Found 2026-09-23: client_profiles_select has been
-- `using (true)` since the initial schema, so ANY signed-in account --
-- including a throwaway one -- could read every client's full name, phone
-- number and avatar. handyman_profiles also exposed every handyman's phone.
-- Nothing in the app reads anyone else's phone, and nothing writes phone
-- at all today.
--
-- Client's rules (2026-09-23):
--   1. A phone number is readable only by its owner.
--   2. A client's name/avatar is readable only by that client, plus
--      handymen with a real connection to them: a bid on one of their
--      jobs, a conversation, or an invite (private invite_only job or a
--      job_invitations row).
-- Handyman profiles stay publicly readable (they advertise themselves on
-- Browse) -- only their phone number moves out.
--
-- PHONE: moved to a new owner-only table rather than hidden with column
-- privileges. Column-level grants would mean every column added to these
-- tables in future is silently unreadable until someone remembers to grant
-- it -- an app-wide breakage waiting to happen. A separate table keeps the
-- rule structural: private data lives in the private table. Existing
-- numbers are copied over and the copy is verified BEFORE the old columns
-- are dropped; if the counts don't match, the script raises and (the SQL
-- Editor runs it as one transaction) nothing at all is changed.
--
-- Safe to run more than once -- guarded create, idempotent copy, drop
-- column if exists, function create-or-replace, policies dropped and
-- recreated.

-- ------------------------------------------------------------
-- 1. Phone numbers -> owner-only table
-- ------------------------------------------------------------
create table if not exists profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  updated_at timestamptz not null default now()
);

alter table profile_private enable row level security;

drop policy if exists profile_private_select on profile_private;
create policy profile_private_select on profile_private for select to authenticated using (user_id = auth.uid());

drop policy if exists profile_private_insert on profile_private;
create policy profile_private_insert on profile_private for insert to authenticated with check (user_id = auth.uid());

drop policy if exists profile_private_update on profile_private;
create policy profile_private_update on profile_private for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare
  v_expected int := 0;
  v_copied int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'client_profiles' and column_name = 'phone') then
    execute 'insert into profile_private (user_id, phone)
             select id, phone from client_profiles where phone is not null
             on conflict (user_id) do nothing';
    execute 'select count(*) from client_profiles where phone is not null' into v_copied;
    v_expected := v_expected + v_copied;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'handyman_profiles' and column_name = 'phone') then
    execute 'insert into profile_private (user_id, phone)
             select id, phone from handyman_profiles where phone is not null
             on conflict (user_id) do nothing';
    execute 'select count(*) from handyman_profiles where phone is not null' into v_copied;
    v_expected := v_expected + v_copied;
  end if;

  -- Every non-null phone must now exist in profile_private before anything
  -- is dropped. (A user is only ever a client OR a handyman, so there's no
  -- double counting.)
  select count(*) into v_copied from profile_private where phone is not null;
  if v_copied < v_expected then
    raise exception 'Phone copy incomplete: expected %, found % -- nothing changed.', v_expected, v_copied;
  end if;
end $$;

alter table client_profiles drop column if exists phone;
alter table handyman_profiles drop column if exists phone;

-- ------------------------------------------------------------
-- 2. Who can read a client's profile row
-- ------------------------------------------------------------
-- Security definer for the same reason as auth_owns_job() (20260917000000):
-- it reads bids/jobs/conversations/invitations, whose own policies would
-- otherwise recurse or hide rows from the check. Only ever answers "is the
-- CALLER connected to this client", never anything about anyone else.
create or replace function auth_handyman_connected_to_client(p_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null and (
    -- bid on one of their jobs (any status -- the relationship happened)
    exists (
      select 1 from bids b join jobs j on j.id = b.job_id
      where j.client_id = p_client_id and b.handyman_id = auth.uid()
    )
    -- a conversation with them
    or exists (
      select 1 from job_conversations c
      where c.client_id = p_client_id and c.handyman_id = auth.uid()
    )
    -- invited to a private job of theirs
    or exists (
      select 1 from jobs j
      where j.client_id = p_client_id and j.visibility = 'invite_only' and j.invited_handyman_id = auth.uid()
    )
    -- invited by name to one of their public jobs
    or exists (
      select 1 from job_invitations i join jobs j on j.id = i.job_id
      where j.client_id = p_client_id and i.handyman_id = auth.uid()
    )
  );
$$;

revoke all on function auth_handyman_connected_to_client(uuid) from public, anon;
grant execute on function auth_handyman_connected_to_client(uuid) to authenticated;

drop policy if exists client_profiles_select on client_profiles;
create policy client_profiles_select on client_profiles for select to authenticated using (
  id = auth.uid() or auth_handyman_connected_to_client(id)
);
