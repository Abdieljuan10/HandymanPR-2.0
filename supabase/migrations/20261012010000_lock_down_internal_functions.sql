-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- SECURITY FIX, found 2026-09-23 while reviewing the client_profiles
-- lockdown. Supabase grants EXECUTE on every function in the public schema
-- to anon and authenticated by default, and this project only ever
-- GRANTED execute on app-facing RPCs -- it never REVOKED it on internal
-- ones. The anon key ships inside the app bundle, so anyone -- no account
-- needed -- could call these straight through the REST API
-- (POST /rest/v1/rpc/<name>):
--
--   send_push_to_users(ids, title_es, body_es, title_en, body_en, data)
--       -> push ANY text to ANY user ids: phishing / spam to the whole
--          user base, appearing to come from the app. The serious one.
--   get_user_language(user_id)          -> reads anyone's language setting
--   expire_stale_jobs()                 -> runs the expiry sweep on demand
--   notify_free_tier_new_jobs()         -> runs the free-tier push sweep
--   auto_confirm_stale_completions()    -> runs the auto-confirm sweep
--   publish_expired_review_windows()    -> runs the review-publish sweep
--   cleanup_expired_conversations()     -> runs the 90-day chat cleanup
--
-- The sweeps only do what their cron would do anyway, but on an
-- attacker's schedule. None of these are called by the app. Every caller
-- inside the database (triggers, other functions -- all SECURITY DEFINER,
-- verified 2026-09-23) runs as the function owner, and pg_cron runs as its
-- job owner, so revoking from anon/authenticated/public changes nothing
-- for them.
--
-- NOT touched: functions the app calls (renew_job, cancel_hired_job,
-- propose_job_date, confirm_job_date, mark/confirm/dispute/undo job
-- completion, hide_conversation, handyman_public_reviews) and the helpers
-- used inside RLS policies (auth_owns_job, auth_has_bid_on_job,
-- auth_is_invited_to_job, auth_handyman_connected_to_client,
-- chat_conversation_deletable) -- those must stay executable by
-- authenticated, and each only answers about the caller.
--
-- Revokes by NAME over every signature found in the live catalogue, so an
-- older overload left behind by an earlier migration is covered too, and a
-- function that doesn't exist is simply skipped instead of erroring.
--
-- Safe to run more than once.

do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'send_push_to_users',
        'get_user_language',
        'expire_stale_jobs',
        'notify_free_tier_new_jobs',
        'auto_confirm_stale_completions',
        'publish_expired_review_windows',
        'cleanup_expired_conversations'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    raise notice 'locked down %', v_fn;
  end loop;
end $$;

-- Check: this should return NO rows. Any row is a function that anon or
-- authenticated can still execute.
select p.oid::regprocedure as still_callable, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and p.proname in (
    'send_push_to_users', 'get_user_language', 'expire_stale_jobs', 'notify_free_tier_new_jobs',
    'auto_confirm_stale_completions', 'publish_expired_review_windows', 'cleanup_expired_conversations'
  )
  and has_function_privilege(r.rolname, p.oid, 'execute');
