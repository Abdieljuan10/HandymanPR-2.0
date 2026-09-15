-- Fixes: "infinite recursion detected in policy for relation jobs"
--
-- Cause: the jobs SELECT policy checks "does a bid by me exist on this job"
-- (a subquery against bids), and the bids SELECT policy checks "do I own
-- the job this bid is on" (a subquery against jobs). Each subquery re-runs
-- the OTHER table's RLS policy, which re-runs the first one, forever.
--
-- Fix: two small SECURITY DEFINER helper functions. Being SECURITY DEFINER,
-- they run with the function owner's privileges, which bypasses RLS for the
-- query INSIDE the function — so calling them from a policy can't trigger
-- the other table's policy again, breaking the cycle.
--
-- Safe to run more than once, and safe regardless of which earlier
-- migrations have or haven't fully applied — every statement below either
-- replaces or drop-and-recreates, nothing assumes a specific prior state.

create or replace function auth_owns_job(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from jobs where id = p_job_id and client_id = auth.uid());
$$;

create or replace function auth_has_bid_on_job(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from bids where job_id = p_job_id and handyman_id = auth.uid());
$$;

drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select to authenticated using (
  client_id = auth.uid()
  or (visibility = 'invite_only' and invited_handyman_id = auth.uid())
  or auth_has_bid_on_job(jobs.id)
  or (
    visibility = 'public'
    and status = 'open'
    and exists (select 1 from handyman_pueblos hp where hp.handyman_id = auth.uid() and hp.pueblo_id = jobs.pueblo_id)
    and exists (select 1 from handyman_trades ht where ht.handyman_id = auth.uid() and ht.trade_id = jobs.trade_id)
    and (
      now() >= jobs.visible_to_free_at
      or exists (
        select 1 from handyman_profiles h
        where h.id = auth.uid() and h.is_subscribed
        and (h.subscription_expires_at is null or h.subscription_expires_at > now())
      )
    )
  )
);

drop policy if exists bids_select on bids;
create policy bids_select on bids for select to authenticated using (
  handyman_id = auth.uid()
  or auth_owns_job(bids.job_id)
);

drop policy if exists bids_update_by_client on bids;
create policy bids_update_by_client on bids for update to authenticated
  using (auth_owns_job(bids.job_id))
  with check (auth_owns_job(bids.job_id));
