-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- REQUIRES 20260927000000_mutual_job_completion_enum.sql to have already
-- been run and committed on its own first -- this file's functions
-- reference the 'pending_completion' enum value that adds.
--
-- Makes job completion mutual, like the agreed date: one side marks the
-- job complete, the other gets a push and either confirms or disputes it.
-- If they do nothing for 7 days, it auto-confirms. Reviews only unlock
-- once completion is actually confirmed (or auto-confirmed) -- not the
-- moment either side taps "Mark Complete" alone, which is what
-- 20260926000000_job_completion_reviews.sql originally did (a handyman
-- could mark a job done that wasn't, or a client could tap it by mistake
-- with no undo).
--
-- New intermediate job_status value, 'pending_completion': hired ->
-- pending_completion (mark_job_complete) -> completed (confirm_job_completion
-- or the 7-day auto-confirm cron), or back to hired (dispute_job_completion,
-- or undo_job_completion by whoever marked it, while still pending).
--
-- set_review_parties (20260914000000_initial_schema.sql) already requires
-- status = 'completed' to write a review, so reviews staying locked out
-- during pending_completion needs no change there -- it's already correct.
--
-- Safe to run more than once -- column adds are guarded, every function
-- is create-or-replace, and the cron schedule is dropped and recreated.

alter table jobs add column if not exists completion_marked_by uuid references auth.users(id);
alter table jobs add column if not exists completion_marked_at timestamptz;

-- ============================================================
-- Mark complete -> now enters pending_completion instead of completing
-- outright. Same eligibility gate as before (hired, agreed_date set and
-- passed, caller is a party to the job).
-- ============================================================

create or replace function mark_job_complete(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
  v_other_party uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'hired' then
    raise exception 'This job is not currently hired.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() = v_job.client_id then
    v_other_party := v_handyman_id;
  elsif auth.uid() = v_handyman_id then
    v_other_party := v_job.client_id;
  else
    raise exception 'You are not a party to this job.';
  end if;

  if v_job.agreed_date is null then
    raise exception 'Agree on a job date before marking this complete.';
  end if;

  if current_date < v_job.agreed_date then
    raise exception 'The agreed date hasn''t arrived yet.';
  end if;

  update jobs
  set status = 'pending_completion',
      completion_marked_by = auth.uid(),
      completion_marked_at = now()
  where id = p_job_id;

  perform send_push_to_users(
    array[v_other_party],
    'Confirm job completion',
    '"' || v_job.title || '" was marked complete -- confirm or dispute it in the app.',
    jsonb_build_object('type', 'job_completion_pending', 'job_id', p_job_id)
  );
end;
$$;

-- ============================================================
-- Confirm: only the OTHER party (not whoever marked it) can confirm.
-- ============================================================

create or replace function confirm_job_completion(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'pending_completion' then
    raise exception 'This job has no pending completion to confirm.';
  end if;

  if v_job.completion_marked_by = auth.uid() then
    raise exception 'The other side needs to confirm this -- you marked it complete.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() <> v_job.client_id and auth.uid() <> v_handyman_id then
    raise exception 'You are not a party to this job.';
  end if;

  update jobs set status = 'completed', completed_at = now() where id = p_job_id;

  perform send_push_to_users(
    array[v_job.completion_marked_by],
    'Completion confirmed',
    '"' || v_job.title || '" completion was confirmed. You can leave a review now.',
    jsonb_build_object('type', 'job_completed', 'job_id', p_job_id)
  );
end;
$$;

-- ============================================================
-- Dispute: only the OTHER party can dispute. Reverts to hired -- the job
-- isn't cancelled, it just needs a real agreement on completion again.
-- ============================================================

create or replace function dispute_job_completion(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'pending_completion' then
    raise exception 'This job has no pending completion to dispute.';
  end if;

  if v_job.completion_marked_by = auth.uid() then
    raise exception 'You marked this complete -- use undo instead of dispute.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() <> v_job.client_id and auth.uid() <> v_handyman_id then
    raise exception 'You are not a party to this job.';
  end if;

  update jobs
  set status = 'hired',
      completion_marked_by = null,
      completion_marked_at = null
  where id = p_job_id;

  perform send_push_to_users(
    array[v_job.completion_marked_by],
    'Completion disputed',
    'The other side disputed marking "' || v_job.title || '" complete.',
    jsonb_build_object('type', 'job_completion_disputed', 'job_id', p_job_id)
  );
end;
$$;

-- ============================================================
-- Undo: only the person who marked it can undo, while still pending.
-- ============================================================

create or replace function undo_job_completion(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
  v_other_party uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'pending_completion' then
    raise exception 'This job has no pending completion to undo.';
  end if;

  if v_job.completion_marked_by <> auth.uid() then
    raise exception 'Only the person who marked this complete can undo it.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;
  v_other_party := case when auth.uid() = v_job.client_id then v_handyman_id else v_job.client_id end;

  update jobs
  set status = 'hired',
      completion_marked_by = null,
      completion_marked_at = null
  where id = p_job_id;

  perform send_push_to_users(
    array[v_other_party],
    'Completion undone',
    '"' || v_job.title || '" completion mark was undone.',
    jsonb_build_object('type', 'job_completion_undone', 'job_id', p_job_id)
  );
end;
$$;

grant execute on function mark_job_complete(uuid) to authenticated;
grant execute on function confirm_job_completion(uuid) to authenticated;
grant execute on function dispute_job_completion(uuid) to authenticated;
grant execute on function undo_job_completion(uuid) to authenticated;

-- ============================================================
-- 7-day auto-confirm: nobody disputed or confirmed in time -> completes
-- anyway. Daily cron, same pattern as the review-window force-publish.
-- ============================================================

create or replace function auto_confirm_stale_completions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_handyman_id uuid;
begin
  for v_job in
    select * from jobs
    where status = 'pending_completion'
      and completion_marked_at <= now() - interval '7 days'
  loop
    update jobs set status = 'completed', completed_at = now() where id = v_job.id;

    select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

    perform send_push_to_users(
      array[v_job.client_id, v_handyman_id],
      'Job auto-confirmed complete',
      '"' || v_job.title || '" was automatically confirmed complete after 7 days. You can leave a review now.',
      jsonb_build_object('type', 'job_completed', 'job_id', v_job.id)
    );
  end loop;
end;
$$;

select cron.unschedule('auto-confirm-stale-completions')
where exists (select 1 from cron.job where jobname = 'auto-confirm-stale-completions');

select cron.schedule('auto-confirm-stale-completions', '0 4 * * *', 'select auto_confirm_stale_completions();');
