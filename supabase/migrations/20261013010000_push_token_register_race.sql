-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER 20261013000000_push_token_one_owner.sql.
--
-- Bug found on-device 2026-09-23, right after 20261013000000: logging in
-- logged "duplicate key value violates unique constraint
-- push_tokens_expo_push_token_key" from register_push_token().
--
-- Cause: a race, not bad data. The app registers twice at the same instant
-- on every login (its startup getSession() and the auth library's
-- simultaneous INITIAL_SESSION/SIGNED_IN event -- deduplicated app-side in
-- the same change). Two register_push_token() transactions ran
-- concurrently: both deleted the old owner's row, both inserted the new
-- one. INSERT ... ON CONFLICT only resolves conflicts on its arbiter
-- constraint -- (user_id, device_id) -- gracefully; a simultaneous conflict
-- on any OTHER unique index (the new expo_push_token one) is raised as an
-- error instead. One call won (so the phone did switch owners correctly),
-- the other failed loudly.
--
-- Fix: serialize registrations per token with a transaction-scoped
-- advisory lock taken before anything else. The second call now waits for
-- the first to commit, then sees its row and takes the ON CONFLICT DO
-- UPDATE path. The lock is released automatically at commit/rollback and
-- the function body is a couple of indexed statements, so it's held for
-- milliseconds.
--
-- Identical to 20261013000000's version apart from the lock.
-- Safe to run more than once -- create-or-replace, grants idempotent.

create or replace function register_push_token(p_device_id text, p_expo_push_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Unsupported platform.';
  end if;

  -- One registration per token at a time (see header). Keyed on the token,
  -- so unrelated devices never wait on each other.
  perform pg_advisory_xact_lock(hashtextextended('register_push_token:' || p_expo_push_token, 0));

  -- Whoever held this device or this token before -- another account that
  -- logged in on this phone, or this account under an old device id --
  -- stops receiving pushes here.
  delete from push_tokens
  where (expo_push_token = p_expo_push_token or device_id = p_device_id)
    and not (user_id = auth.uid() and device_id = p_device_id);

  insert into push_tokens (user_id, device_id, expo_push_token, platform)
  values (auth.uid(), p_device_id, p_expo_push_token, p_platform)
  on conflict (user_id, device_id) do update
    set expo_push_token = excluded.expo_push_token,
        platform = excluded.platform;
end;
$$;

revoke all on function register_push_token(text, text, text) from public, anon;
grant execute on function register_push_token(text, text, text) to authenticated;
