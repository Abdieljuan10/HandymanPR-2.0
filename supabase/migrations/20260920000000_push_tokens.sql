-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Storage for Expo push tokens, one row per (user, device). A user can be
-- logged in on more than one device, so this isn't keyed by user_id alone —
-- device_id (Expo's own stable per-install identifier) disambiguates them,
-- and re-registering the same device just updates its token/platform in
-- place rather than accumulating duplicates.
--
-- Notification-sending (the triggers that actually call Expo's push API on
-- a new job/bid/message) comes in a later migration, once there's a real
-- device to test against — no point wiring up sends before anything can
-- receive them.

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);
create index idx_push_tokens_user on push_tokens(user_id);

alter table push_tokens enable row level security;

create policy push_tokens_select on push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert on push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update on push_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_delete on push_tokens for delete to authenticated using (user_id = auth.uid());

create or replace function set_push_token_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_push_tokens_updated_at
before update on push_tokens
for each row execute function set_push_token_updated_at();
