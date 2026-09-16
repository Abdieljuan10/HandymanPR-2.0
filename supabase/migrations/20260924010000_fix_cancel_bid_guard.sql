-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Fixes a real bug in 20260924000000_job_cancellation_reopen.sql, found by
-- on-device testing: cancel_hired_job()'s
-- `update bids set status = 'cancelled' ...` was being rejected by the
-- enforce_bid_update() trigger from
-- 20260918000000_storage_bidding_messaging.sql, which only knows about
-- pending -> withdrawn (handyman) and pending -> accepted/rejected
-- (client). Cancelling a hired job does accepted -> cancelled, which that
-- trigger had never heard of -- triggers fire regardless of who owns the
-- calling function (SECURITY DEFINER bypasses RLS, not triggers), so it
-- rejected the update every time, for both sides, with whichever of its
-- two existing messages matched who called it.
--
-- Fixed with a transaction-local flag (set_config) that only
-- cancel_hired_job() sets, rather than just widening the trigger's allowed
-- transitions -- widening it would let either party update a bid straight
-- to 'cancelled' from the client SDK directly (bids_update_by_handyman /
-- bids_update_by_client RLS already permits updating their own bid/job's
-- bids), bypassing cancel_hired_job() entirely and leaving the job stuck at
-- status = 'hired' with no job_cancellations record. This way 'cancelled'
-- stays reachable only through the sanctioned function.
--
-- Safe to run more than once -- both functions are create-or-replace.

create or replace function enforce_bid_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.cancelling_job', true) = 'true' then
    return new;
  end if;

  if auth.role() = 'authenticated' then
    if new.handyman_id = auth.uid() then
      -- The handyman's own bid: the only thing they can ever do through
      -- the app is withdraw it, and only while it's still pending.
      if old.status <> 'pending' or new.status <> 'withdrawn' then
        raise exception 'You can only withdraw a bid that is still pending.';
      end if;
      new.price := old.price;
      new.note := old.note;
      new.job_id := old.job_id;
    elsif auth_owns_job(old.job_id) then
      -- The client accepting/rejecting a bid on their own job. Rejected
      -- also covers the "other bids" side effect of handle_bid_accepted
      -- below, which runs inside the same request/role context.
      if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
        raise exception 'You can only accept or reject a bid that is still pending.';
      end if;
      new.price := old.price;
      new.note := old.note;
      new.job_id := old.job_id;
      new.handyman_id := old.handyman_id;
    end if;
  end if;
  return new;
end;
$$;

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
      hired_bid_id = null
  where id = p_job_id;

  -- Only this function ever sets this flag, so enforce_bid_update() only
  -- waves the accepted -> cancelled transition through when it's really
  -- coming from here, not from a direct client-side bid update.
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
