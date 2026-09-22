-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Section 5 of the per-user chat deletion/archiving + attachments batch
-- (see TODO.md). "Both-sides-deleted" cleanup -- once BOTH parties have
-- hidden a conversation (nobody left to see it), the conversation row (and
-- its messages, via on-delete cascade) are actually removed, not just
-- hidden. Storage cleanup for the photos themselves still has to happen
-- from the deleting user's own authenticated client first (same pattern as
-- the existing job/portfolio-photo delete flows) -- this migration only
-- adds the DB-level pieces: a way to check the "both hidden" condition, and
-- a delete policy that enforces it so this can never be bypassed by a
-- direct client-side .delete() call.
--
-- job_conversation_hides' own select policy only lets a user see their OWN
-- hide rows (by design -- you shouldn't be able to tell whether the other
-- party has hidden a chat), so this check has to run as security definer,
-- same pattern as auth_owns_job()/auth_has_bid_on_job() in
-- 20260917000000_fix_jobs_bids_rls_recursion.sql.
--
-- Safe to run more than once -- function is created or replace, policy is
-- dropped and recreated.

create or replace function chat_both_parties_hidden(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from job_conversations c
      where c.id = p_conversation_id
      and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
    )
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

-- No update/insert delete policy existed on job_conversations before this --
-- only select + insert. The "both hidden" check is baked into the policy
-- itself (not just called from the app) so a real conversation can never be
-- deleted unilaterally by one side, even via a direct client-side call.
drop policy if exists job_conversations_delete on job_conversations;
create policy job_conversations_delete on job_conversations for delete to authenticated using (
  (client_id = auth.uid() or handyman_id = auth.uid())
  and chat_both_parties_hidden(id)
);
