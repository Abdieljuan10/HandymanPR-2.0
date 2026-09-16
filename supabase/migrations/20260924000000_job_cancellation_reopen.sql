-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Finishes the cancellation gap flagged in TODO.md: cancelling a hired job
-- used to dead-end at status = 'cancelled'. Now it returns the job to
-- 'open' (back in the feed for new bids -- this doubles as "repost," no
-- separate repost flow needed) and logs who cancelled, privately.
--
-- Replaces cancel_job_as_handyman() (20260921000000_handyman_cancel_job.sql)
-- with cancel_hired_job(), usable by either the client or the hired
-- handyman, since both sides now do the same reopen-and-log transition.
--
-- Also fixes a latent bug this reopen would otherwise immediately hit:
-- enforce_bid_insert's bid-cap count used `status <> 'withdrawn'`, so old
-- `rejected` bids from before the job was hired would still count against
-- max_bids once the job reopens -- on a job that was already at its cap,
-- that would block every new bid immediately. Jobs have never reopened
-- before this migration, so the bug never fired. Fixed by counting only
-- `pending` bids, the only ones that are actually live contenders on an
-- open job.
--
-- Safe to run more than once -- enum value adds are guarded, the table
-- create is guarded, and every function is create-or-replace.

alter type bid_status add value if not exists 'cancelled';

-- ============================================================
-- Fix the bid-cap counting bug (see header comment above).
-- Everything else in this function is unchanged from
-- 20260914000000_initial_schema.sql.
-- ============================================================

create or replace function enforce_bid_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_bid_count int;
begin
  select * into v_job from jobs where id = new.job_id;

  if v_job.status <> 'open' then
    raise exception 'This job is no longer open for bids.';
  end if;

  if v_job.visibility = 'invite_only' then
    if new.handyman_id <> v_job.invited_handyman_id then
      raise exception 'This job is a direct invite to another handyman.';
    end if;
  else
    if not exists (select 1 from handyman_pueblos hp where hp.handyman_id = new.handyman_id and hp.pueblo_id = v_job.pueblo_id) then
      raise exception 'You do not work in this job''s pueblo.';
    end if;
    if not exists (select 1 from handyman_trades ht where ht.handyman_id = new.handyman_id and ht.trade_id = v_job.trade_id) then
      raise exception 'You do not have this job''s trade listed on your profile.';
    end if;

    select count(*) into v_bid_count from bids where job_id = new.job_id and status = 'pending';
    if v_bid_count >= v_job.max_bids then
      raise exception 'This job has reached its maximum number of bids.';
    end if;

    if now() < v_job.visible_to_free_at then
      if not exists (
        select 1 from handyman_profiles h
        where h.id = new.handyman_id and h.is_subscribed
        and (h.subscription_expires_at is null or h.subscription_expires_at > now())
      ) then
        raise exception 'This job is currently only visible to subscribed handymen.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
-- Private cancellation record -- RLS on, zero policies, so it's readable
-- only via the Supabase dashboard's admin access. Not surfaced anywhere in
-- the app. This is where a future reputation feature would read from.
-- ============================================================

create table if not exists job_cancellations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  cancelled_by_role account_role not null,
  cancelled_by_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_job_cancellations_job on job_cancellations(job_id);
create index if not exists idx_job_cancellations_cancelled_by on job_cancellations(cancelled_by_id);

alter table job_cancellations enable row level security;

-- ============================================================
-- Unified cancel: either the client or the hired handyman can call this on
-- a hired job. Replaces cancel_job_as_handyman.
-- ============================================================

drop function if exists cancel_job_as_handyman(uuid);

create or replace function cancel_hired_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
  v_role account_role;
  v_other_party uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'hired' then
    raise exception 'This job is not currently hired.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() = v_job.client_id then
    v_role := 'client';
    v_other_party := v_handyman_id;
  elsif auth.uid() = v_handyman_id then
    v_role := 'handyman';
    v_other_party := v_job.client_id;
  else
    raise exception 'You are not a party to this job.';
  end if;

  -- NOTE: once Phase 3 (20260925000000_agreed_job_date.sql) adds
  -- agreed_date/proposed_date/proposed_by, that migration's create-or-
  -- replace of this function must also clear those columns here -- a
  -- stale agreed date shouldn't carry into a fresh round of bidding.
  update jobs
  set status = 'open',
      hired_bid_id = null
  where id = p_job_id;

  update bids set status = 'cancelled' where id = v_job.hired_bid_id;

  insert into job_cancellations (job_id, cancelled_by_role, cancelled_by_id)
  values (p_job_id, v_role, auth.uid());

  perform send_push_to_users(
    array[v_other_party],
    'Job cancelled',
    '"' || v_job.title || '" was cancelled and is open again.',
    jsonb_build_object('type', 'job_cancelled', 'job_id', p_job_id)
  );
end;
$$;

grant execute on function cancel_hired_job(uuid) to authenticated;
