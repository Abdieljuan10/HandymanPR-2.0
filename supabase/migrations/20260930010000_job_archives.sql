-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Archive, Outlook-style: hide a completed job from a client's own list
-- without deleting it -- the job and its reviews stay exactly as they are,
-- just out of view. Client's own call on completed jobs staying permanently
-- undeletable (reviews belong to whoever received them) -- this is the
-- alternative for decluttering the list instead.
--
-- Per-user, not per-job: archiving is a personal view preference, not a
-- property of the job itself, so archiving it on one side must NOT affect
-- what the other party sees. A plain boolean on `jobs` couldn't represent
-- that (whose view would it be?) -- a join table keyed by (job_id, user_id)
-- can. Generic on purpose (any status, not just 'completed') even though
-- the app only surfaces the archive action for completed jobs today --
-- cancelled/expired jobs already have a real delete option, and there's no
-- reason to special-case the schema for a UI-only restriction. Same reason
-- it isn't scoped to the client role specifically: nothing here stops it
-- from covering a handyman's "My Bids" list later.
--
-- Safe to run more than once -- the table create is guarded and the
-- policies are dropped and recreated.

create table if not exists job_archives (
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index if not exists idx_job_archives_user on job_archives(user_id);

alter table job_archives enable row level security;

drop policy if exists job_archives_select on job_archives;
create policy job_archives_select on job_archives for select to authenticated using (user_id = auth.uid());

drop policy if exists job_archives_insert on job_archives;
create policy job_archives_insert on job_archives for insert to authenticated with check (user_id = auth.uid());

drop policy if exists job_archives_delete on job_archives;
create policy job_archives_delete on job_archives for delete to authenticated using (user_id = auth.uid());
