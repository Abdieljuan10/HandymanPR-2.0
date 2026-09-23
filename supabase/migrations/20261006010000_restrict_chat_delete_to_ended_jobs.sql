-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER 20261006000000_fix_job_conversation_hides_update.sql.
--
-- Design change, client's call 2026-09-22: mutual delete must never
-- actually erase a conversation while its job is still live. Before this,
-- both parties deleting a chat mid-job destroyed the message history for
-- good -- which cuts directly against the reason per-user delete exists at
-- all (a handyman shouldn't be able to erase what he promised before
-- disputing a bad review, and "we both tidied up our inbox" shouldn't
-- achieve the same thing by accident). On a live job, mutual delete now
-- only ever hides. Once the job has ended, real deletion works as before.
--
-- Two changes:
--
-- 1. chat_both_parties_hidden() is replaced by chat_conversation_deletable(),
--    which adds the "job has ended" condition. Renamed rather than widened
--    in place because the name is now load-bearing -- both the RLS policy
--    and the app call this single function to decide whether a real delete
--    is allowed, so they can't drift apart. Checks the job's CURRENT status
--    rather than job_conversations.archived_at: status is the source of
--    truth, and it's also correct for conversations whose job ended before
--    the auto-archive trigger existed.
--
--    Note cancel_hired_job() reopens a cancelled job to 'open' rather than
--    leaving it 'cancelled', so a cancelled-and-reopened job is correctly
--    treated as live here -- it is live, it's back in the feed taking bids.
--
-- 2. auto_archive_job_conversations() now CLEARS archived_at when a job
--    leaves the terminal statuses, not just sets it when a job enters them.
--    Without this, renewing an expired job (renew_job() puts it back to
--    'open') left a stale archived_at ticking, and the 90-day cleanup cron
--    -- which reads archived_at, not job status -- would eventually delete
--    the conversation of a perfectly live job. Same invariant as change 1,
--    applied to the other consumer of "has this job ended".
--
-- Safe to run more than once -- policy/function/trigger are all dropped or
-- replaced.

-- The policy depends on the old function, so it has to go first.
drop policy if exists job_conversations_delete on job_conversations;
drop function if exists chat_both_parties_hidden(uuid);

create or replace function chat_conversation_deletable(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    -- caller is a party to this conversation
    exists (
      select 1 from job_conversations c
      where c.id = p_conversation_id
      and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
    )
    -- the job has actually ended
    and exists (
      select 1 from job_conversations c
      join jobs j on j.id = c.job_id
      where c.id = p_conversation_id
      and j.status in ('completed', 'cancelled', 'expired')
    )
    -- ...and nobody is left to see it: both parties have hidden it
    and exists (
      select 1 from job_conversation_hides h
      join job_conversations c on c.id = h.conversation_id
      where h.conversation_id = p_conversation_id and h.user_id = c.client_id
    )
    and exists (
      select 1 from job_conversation_hides h
      join job_conversations c on c.id = h.conversation_id
      where h.conversation_id = p_conversation_id and h.user_id = c.handyman_id
    );
$$;

create policy job_conversations_delete on job_conversations for delete to authenticated using (
  (client_id = auth.uid() or handyman_id = auth.uid())
  and chat_conversation_deletable(id)
);

create or replace function auto_archive_job_conversations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'cancelled', 'expired') and old.status not in ('completed', 'cancelled', 'expired') then
    update job_conversations
    set archived_at = now()
    where job_id = new.id and archived_at is null;
  elsif new.status not in ('completed', 'cancelled', 'expired') and old.status in ('completed', 'cancelled', 'expired') then
    -- Job came back to life (renew_job() on an expired job). Stop the
    -- 90-day clock -- its conversation is live again.
    update job_conversations
    set archived_at = null
    where job_id = new.id and archived_at is not null;
  end if;
  return new;
end;
$$;
