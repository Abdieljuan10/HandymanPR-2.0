-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Section 1 of the per-user chat deletion/archiving + attachments batch
-- (see TODO.md, "Per-user chat deletion/archiving + photo attachments").
-- Schema only, no enum changes, safe to run alone.
--
-- job_conversations gets:
--   - archived_at: set once the job hits a terminal status (completed/
--     cancelled/expired), starts the 90-day auto-delete clock. Written by a
--     separate trigger migration (section 3), not this one.
--   - last_message_at: bumped on every new job_messages row, so a per-user
--     hide (below) can correctly "come back" if a new message arrives after
--     it was hidden, same as WhatsApp. Also fixes a separate gap: the
--     conversations list currently shows zero last-activity info.
--
-- job_conversation_hides is per-user, like job_archives
-- (20260930010000_job_archives.sql) -- deleting a chat must never affect the
-- other person's copy (client's own reasoning: if one side could wipe a
-- conversation for both, a handyman could erase what he promised right
-- before disputing a bad review). Hiding a conversation never touches
-- Storage or the underlying rows by itself -- those are only actually
-- removed once BOTH parties have hidden the same conversation, or by the
-- 90-day cron backstop (both built in later sections of this batch).
--
-- Safe to run more than once -- columns/table are guarded, the trigger and
-- policies are dropped and recreated.

alter table job_conversations add column if not exists archived_at timestamptz;
alter table job_conversations add column if not exists last_message_at timestamptz not null default now();

-- Backfill from the latest existing message per conversation, so ordering
-- by last_message_at is correct immediately for conversations that already
-- have history, not just new ones going forward.
update job_conversations c
set last_message_at = coalesce(
  (select max(m.created_at) from job_messages m where m.conversation_id = c.id),
  c.created_at
);

create table if not exists job_conversation_hides (
  conversation_id uuid not null references job_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_job_conversation_hides_user on job_conversation_hides(user_id);

alter table job_conversation_hides enable row level security;

drop policy if exists job_conversation_hides_select on job_conversation_hides;
create policy job_conversation_hides_select on job_conversation_hides for select to authenticated using (user_id = auth.uid());

drop policy if exists job_conversation_hides_insert on job_conversation_hides;
create policy job_conversation_hides_insert on job_conversation_hides for insert to authenticated with check (user_id = auth.uid());

drop policy if exists job_conversation_hides_delete on job_conversation_hides;
create policy job_conversation_hides_delete on job_conversation_hides for delete to authenticated using (user_id = auth.uid());

-- job_conversations has no update policy for participants (only select +
-- insert), so bumping last_message_at from a plain trigger would hit RLS --
-- security definer, same pattern as auth_owns_job()/auth_has_bid_on_job()
-- in 20260917000000_fix_jobs_bids_rls_recursion.sql.
create or replace function bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update job_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_conversation_last_message on job_messages;
create trigger trg_bump_conversation_last_message
after insert on job_messages
for each row execute function bump_conversation_last_message();
