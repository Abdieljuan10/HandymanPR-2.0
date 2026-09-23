-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Bug found on-device 2026-09-23: one phone received push notifications
-- for BOTH accounts that had ever logged in on it -- including one that was
-- logged out.
--
-- Two causes:
--   1. push_tokens was unique on (user_id, device_id), not on the device's
--      Expo push token. Logging into a second account on the same phone
--      added a second row carrying the SAME token, so every push to either
--      account reached that phone.
--   2. Logging out never deleted the row (app-side fix ships alongside:
--      the app now deletes this device's row BEFORE signing out, while it
--      still has the session to pass RLS).
-- Beyond noise, that's a privacy leak: a logged-out phone kept showing the
-- old account's message previews (sender name + text).
--
-- Fix here: a device token has exactly ONE owner -- whoever logged in on
-- that device most recently.
--   - register_push_token() replaces the app's direct upsert. It removes
--     any other row holding this token or this device id (any account;
--     RLS would never let the app delete another account's row, hence
--     security definer), then saves the row for the caller.
--   - Existing duplicates are cleaned up: per token, only the most recently
--     updated row (the most recent login on that phone) is kept.
--   - A unique index on expo_push_token makes a shared token impossible
--     from now on, whatever the app does.
--
-- Safe to run more than once -- the cleanup is idempotent, the index is
-- guarded, the function is create-or-replace.

-- ------------------------------------------------------------
-- 1. Clean up: keep only the newest row per token
-- ------------------------------------------------------------
delete from push_tokens p
where exists (
  select 1 from push_tokens q
  where q.expo_push_token = p.expo_push_token
    and (q.updated_at > p.updated_at or (q.updated_at = p.updated_at and q.id > p.id))
);

create unique index if not exists push_tokens_expo_push_token_key on push_tokens(expo_push_token);

-- ------------------------------------------------------------
-- 2. Registration: claim this device for the caller
-- ------------------------------------------------------------
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
