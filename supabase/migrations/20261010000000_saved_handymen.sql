-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Saved handymen: a client can save (heart) a handyman from their public
-- profile and find them again from Browse without re-searching. Purely a
-- private bookmark list -- per-client, same shape as job_archives
-- (20260930010000). Nothing is shown to the handyman: they can't see who
-- saved them, and there's no notification.
--
-- client_id references client_profiles, not auth.users, so only a client
-- account can ever have a saved list (a handyman's id isn't in
-- client_profiles, so the foreign key rejects it).
--
-- Safe to run more than once -- table/index guarded, policies dropped and
-- recreated.

create table if not exists client_saved_handymen (
  client_id uuid not null references client_profiles(id) on delete cascade,
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, handyman_id)
);
create index if not exists idx_client_saved_handymen_client on client_saved_handymen(client_id);

alter table client_saved_handymen enable row level security;

-- Only ever your own list, for every operation. No update policy: a row is
-- just a pair of ids, there's nothing to edit.
drop policy if exists client_saved_handymen_select on client_saved_handymen;
create policy client_saved_handymen_select on client_saved_handymen for select to authenticated using (
  client_id = auth.uid()
);

drop policy if exists client_saved_handymen_insert on client_saved_handymen;
create policy client_saved_handymen_insert on client_saved_handymen for insert to authenticated with check (
  client_id = auth.uid()
);

drop policy if exists client_saved_handymen_delete on client_saved_handymen;
create policy client_saved_handymen_delete on client_saved_handymen for delete to authenticated using (
  client_id = auth.uid()
);
