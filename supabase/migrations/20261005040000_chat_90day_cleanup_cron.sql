-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Section 6 (final) of the per-user chat deletion/archiving + attachments
-- batch (see TODO.md). 90-day backstop: once a job has been ended
-- (completed/cancelled/expired -- see 20261005020000, which sets
-- job_conversations.archived_at) for 90+ days, its conversation is deleted
-- for real, chat photos included, regardless of whether either party ever
-- swiped to hide it. This is the only piece needing real service-role
-- access -- a pg_cron job has no logged-in user's JWT to call the Storage
-- REST API with, and raw SQL `delete from storage.objects` only removes the
-- metadata row, not the underlying file.
--
-- ================================================================
-- >>> MANUAL STEP REQUIRED BEFORE THIS CRON DOES ANYTHING <<<
--
-- This migration alone does NOT make cleanup happen. It will run once a
-- day, find nothing to do (skip silently, logging a NOTICE), and keep
-- doing that forever until you add the project's service-role key to
-- Supabase Vault:
--
--   1. Dashboard -> Project Settings -> API -> copy the "service_role"
--      secret key (NOT the anon key -- never commit this anywhere).
--   2. Dashboard -> Project Settings -> Vault -> New secret.
--      Name it EXACTLY:  service_role_key
--      Paste the key as the secret value. Save.
--
-- That's it -- no code change needed after that, the function below reads
-- it by that exact name every run. This mirrors the project's own
-- hard-won lesson about migrations that silently do nothing until a
-- manual dashboard step happens (see the avatar/portfolio/cert
-- storage-policy saga in TODO.md).
-- ================================================================
--
-- Safe to run more than once -- function is create-or-replace, the cron
-- schedule is dropped and recreated.

create or replace function cleanup_expired_conversations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_key text;
  v_conv record;
  v_paths text[];
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_service_key is null then
    raise notice 'cleanup_expired_conversations: no "service_role_key" secret in Supabase Vault yet -- skipping. See the comment at the top of 20261005040000_chat_90day_cleanup_cron.sql.';
    return;
  end if;

  for v_conv in
    select id from job_conversations
    where archived_at is not null and archived_at < now() - interval '90 days'
  loop
    select coalesce(array_agg(name), array[]::text[])
    into v_paths
    from storage.objects
    where bucket_id = 'chat-photos' and (storage.foldername(name))[1] = v_conv.id::text;

    if array_length(v_paths, 1) > 0 then
      -- Storage's bulk-delete endpoint, same one supabase-js's
      -- .remove(paths) calls under the hood. net.http_delete, not
      -- net.http_post, per this project's existing pg_net-from-SQL
      -- pattern in send_push_to_users() -- that one only ever needed POST.
      perform net.http_delete(
        url := 'https://uswacxdfunopsggkqxgh.supabase.co/storage/v1/object/chat-photos',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'apikey', v_service_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('prefixes', to_jsonb(v_paths))
      );
    end if;

    -- Bypasses job_conversations_delete's "both parties hidden" RLS check
    -- (this function runs as its owner, not as 'authenticated') --
    -- deliberately: the 90-day window is its own independent authorization,
    -- not conditioned on either party ever having hidden the chat. Cascades
    -- to job_messages and job_conversation_hides automatically.
    delete from job_conversations where id = v_conv.id;
  end loop;
end;
$$;

select cron.unschedule('cleanup-expired-conversations')
where exists (select 1 from cron.job where jobname = 'cleanup-expired-conversations');

select cron.schedule('cleanup-expired-conversations', '0 5 * * *', 'select cleanup_expired_conversations();');
