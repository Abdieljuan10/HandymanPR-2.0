-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Minimal agreed-date field for a hired job -- deliberately NOT full
-- scheduling (no availability calendars, no negotiation UI beyond
-- propose/confirm; that's its own later feature). Client proposes a date
-- after hiring, handyman confirms; either side can propose a change, the
-- other confirms.
--
-- Mutual by construction: confirm_job_date() rejects confirming your own
-- proposal, so neither side can set the date unilaterally -- a handyman
-- delaying the date to dodge a bad review, or a client backdating it to
-- review early, both need the other party to go along with it.
--
-- Also finishes the ordering note left in
-- 20260924000000_job_cancellation_reopen.sql: cancel_hired_job() now
-- clears these columns too, so a stale agreed date doesn't carry into a
-- fresh round of bidding after a cancellation reopens the job.
--
-- Safe to run more than once -- column adds are guarded, functions are
-- create-or-replace, triggers are drop-and-recreate.

alter table jobs add column if not exists agreed_date date;
alter table jobs add column if not exists proposed_date date;
alter table jobs add column if not exists proposed_by uuid references auth.users(id);

-- ============================================================
-- Propose / confirm
-- ============================================================

create or replace function propose_job_date(p_job_id uuid, p_date date)
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

  if v_job.status <> 'hired' then
    raise exception 'This job must be hired before a date can be proposed.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() <> v_job.client_id and auth.uid() <> v_handyman_id then
    raise exception 'You are not a party to this job.';
  end if;

  -- Always overwrites any prior pending proposal, from either side --
  -- proposing a counter-date just replaces what's waiting for confirmation.
  update jobs set proposed_date = p_date, proposed_by = auth.uid() where id = p_job_id;
end;
$$;

create or replace function confirm_job_date(p_job_id uuid)
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

  if v_job.proposed_date is null then
    raise exception 'There is no proposed date to confirm.';
  end if;

  -- The enforcement point for mutuality: you can't confirm your own
  -- proposal.
  if v_job.proposed_by = auth.uid() then
    raise exception 'The other side needs to confirm this date -- you proposed it.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() <> v_job.client_id and auth.uid() <> v_handyman_id then
    raise exception 'You are not a party to this job.';
  end if;

  update jobs
  set agreed_date = v_job.proposed_date,
      proposed_date = null,
      proposed_by = null
  where id = p_job_id;
end;
$$;

grant execute on function propose_job_date(uuid, date) to authenticated;
grant execute on function confirm_job_date(uuid) to authenticated;

-- ============================================================
-- Push notifications: the other party when a date is proposed (they're the
-- one who needs to act); both parties once it's confirmed.
-- ============================================================

create or replace function notify_job_date_proposed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handyman_id uuid;
  v_recipient uuid;
begin
  if new.proposed_date is distinct from old.proposed_date and new.proposed_date is not null then
    select handyman_id into v_handyman_id from bids where id = new.hired_bid_id;
    v_recipient := case when new.proposed_by = new.client_id then v_handyman_id else new.client_id end;

    perform send_push_to_users(
      array[v_recipient],
      'Job date proposed',
      'A date was proposed for "' || new.title || '". Open the job to confirm.',
      jsonb_build_object('type', 'job_date_proposed', 'job_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_job_date_proposed on jobs;
create trigger trg_notify_job_date_proposed
after update on jobs
for each row execute function notify_job_date_proposed();

create or replace function notify_job_date_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handyman_id uuid;
begin
  if new.agreed_date is distinct from old.agreed_date and new.agreed_date is not null then
    select handyman_id into v_handyman_id from bids where id = new.hired_bid_id;

    perform send_push_to_users(
      array[new.client_id, v_handyman_id],
      'Job date confirmed',
      '"' || new.title || '" is agreed for ' || to_char(new.agreed_date, 'Mon DD, YYYY') || '.',
      jsonb_build_object('type', 'job_date_confirmed', 'job_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_job_date_confirmed on jobs;
create trigger trg_notify_job_date_confirmed
after update on jobs
for each row execute function notify_job_date_confirmed();

-- ============================================================
-- Ordering note from 20260924000000_job_cancellation_reopen.sql: now that
-- these columns exist, cancel_hired_job() must clear them too.
-- ============================================================

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

  update jobs
  set status = 'open',
      hired_bid_id = null,
      agreed_date = null,
      proposed_date = null,
      proposed_by = null
  where id = p_job_id;

  perform set_config('app.cancelling_job', 'true', true);
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
