-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Section 3 of the per-user chat deletion/archiving + attachments batch
-- (see TODO.md). Starts the 90-day auto-delete clock the moment a job ends.
--
-- One choke-point trigger on jobs.status itself, rather than patching every
-- RPC that can produce a terminal transition (confirm_job_completion,
-- auto_confirm_stale_completions, cancel_hired_job, expire_stale_jobs,
-- etc.) -- matches the client's own framing that it's the job ending that
-- matters, not which code path caused it. A conversation whose job never
-- got hired (client picked someone else, job expired with no bids) still
-- gets archived here too, since 'expired' is one of the terminal statuses --
-- there's no separate "no completion event" case to handle.
--
-- Only sets archived_at the first time a job reaches a terminal status --
-- deliberately does not clear/reset it if a job somehow moves between
-- terminal statuses again (not a real transition in this schema today, but
-- guarding with "and archived_at is null" costs nothing and avoids
-- resetting an already-ticking 90-day clock).
--
-- Safe to run more than once -- function/trigger are created or replaced.

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_archive_job_conversations on jobs;
create trigger trg_auto_archive_job_conversations
after update of status on jobs
for each row execute function auto_archive_job_conversations();
