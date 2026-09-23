-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER 20261006010000_restrict_chat_delete_to_ended_jobs.sql (safe
-- even if that one was never run -- everything it defined that still
-- matters is redefined here).
--
-- Chat delete/archive redesign, client's call 2026-09-23 after on-device
-- testing. Replaces the "live job stays hidden" rule from 20261006010000.
-- No enum changes, so this is safe as one file.
--
-- 1. DELETE is per-user and never restricted by job status.
--    chat_conversation_deletable() drops the "job has ended" condition. It
--    keeps its name so the RLS policy and any old app bundle still calling
--    it keep working. The real delete (the bonus cleanup path) still only
--    happens once BOTH parties have deleted their own view -- and now also
--    requires each of those deletes to still be current. Before, a chat
--    that had resurfaced for one side (new message after they deleted it)
--    could be erased the moment the other side deleted it, even though the
--    first person could see it in their list again.
--
-- 2. hide_conversation() RPC stamps hidden_at with the SERVER clock. The
--    app used to send new Date().toISOString() (the DEVICE clock), while
--    last_message_at / job_messages.created_at come from the server's
--    now(). Every "has this chat resurfaced" comparison mixed the two
--    clocks, so a skewed device could make a deleted chat reappear
--    instantly, or hide a new message that should have brought it back.
--
-- 3. ARCHIVE is new: job_conversation_archives, per-user, same shape as
--    job_archives (20260930010000). Purely a view preference -- touches no
--    messages, no Storage, nothing on the other party's side. Not to be
--    confused with job_conversations.archived_at, which is the 90-day
--    cleanup clock (set by the trigger below) and predates this table.
--
-- 4. The 90-day clock (job_conversations.archived_at) covers every ended
--    job -- completed, cancelled AND expired:
--    - auto_archive_job_conversations() is recreated exactly as
--      20261006010000 left it (sets on entering a terminal status, clears
--      on leaving one, e.g. renew_job() taking expired -> open), so it
--      holds even if that migration never ran.
--    - New: a conversation created while its job is already ended (a
--      handyman messaging about an expired job) starts its clock at
--      creation. The status trigger only ever fired for conversations
--      that existed at the moment the job ended, so these never got one.
--    - New: backfill for conversations whose job ended before the trigger
--      existed. Those had no clock at all and the cron would never have
--      removed them. Their clock starts now, not retroactively.
--
-- Safe to run more than once -- everything is create-or-replace, guarded,
-- or dropped and recreated.

-- ------------------------------------------------------------
-- 1. Deletability: both parties' deletes exist AND are still current.
-- ------------------------------------------------------------
create or replace function chat_conversation_deletable(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from job_conversations c
    where c.id = p_conversation_id
    -- caller is a party to this conversation
    and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
    -- both parties have deleted it, and nothing new has arrived since
    -- either delete (otherwise it's back in that person's list)
    and exists (
      select 1 from job_conversation_hides h
      where h.conversation_id = c.id and h.user_id = c.client_id
      and h.hidden_at >= c.last_message_at
    )
    and exists (
      select 1 from job_conversation_hides h
      where h.conversation_id = c.id and h.user_id = c.handyman_id
      and h.hidden_at >= c.last_message_at
    )
  );
$$;

-- Same policy as before; recreated so it binds to the function above even
-- if 20261006010000 never ran.
drop policy if exists job_conversations_delete on job_conversations;
create policy job_conversations_delete on job_conversations for delete to authenticated using (
  (client_id = auth.uid() or handyman_id = auth.uid())
  and chat_conversation_deletable(id)
);

-- ------------------------------------------------------------
-- 2. Server-clock delete. Returns whether the bonus cleanup can run.
-- ------------------------------------------------------------
create or replace function hide_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from job_conversations c
    where c.id = p_conversation_id
    and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
  ) then
    raise exception 'Conversation not found.';
  end if;

  insert into job_conversation_hides (conversation_id, user_id, hidden_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set hidden_at = excluded.hidden_at;

  return chat_conversation_deletable(p_conversation_id);
end;
$$;

grant execute on function hide_conversation(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Per-user archive.
-- ------------------------------------------------------------
create table if not exists job_conversation_archives (
  conversation_id uuid not null references job_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_job_conversation_archives_user on job_conversation_archives(user_id);

alter table job_conversation_archives enable row level security;

drop policy if exists job_conversation_archives_select on job_conversation_archives;
create policy job_conversation_archives_select on job_conversation_archives for select to authenticated using (user_id = auth.uid());

drop policy if exists job_conversation_archives_insert on job_conversation_archives;
create policy job_conversation_archives_insert on job_conversation_archives for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from job_conversations c
    where c.id = job_conversation_archives.conversation_id
    and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
  )
);

drop policy if exists job_conversation_archives_delete on job_conversation_archives;
create policy job_conversation_archives_delete on job_conversation_archives for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 4. 90-day clock: status trigger, creation trigger, backfill.
-- ------------------------------------------------------------
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

drop trigger if exists trg_auto_archive_job_conversations on jobs;
create trigger trg_auto_archive_job_conversations
after update of status on jobs
for each row execute function auto_archive_job_conversations();

create or replace function start_clock_for_ended_job_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from jobs j
    where j.id = new.job_id and j.status in ('completed', 'cancelled', 'expired')
  ) then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_start_clock_for_ended_job_conversation on job_conversations;
create trigger trg_start_clock_for_ended_job_conversation
before insert on job_conversations
for each row execute function start_clock_for_ended_job_conversation();

update job_conversations c
set archived_at = now()
from jobs j
where j.id = c.job_id
and j.status in ('completed', 'cancelled', 'expired')
and c.archived_at is null;
