-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Bid cap enforcement already existed at write time (enforce_bid_insert
-- rejects a bid once a job has max_bids non-withdrawn bids), but a full job
-- stayed visible in the feed and on the job detail screen — a handyman
-- could open it and only find out it was full when their bid insert got
-- rejected. This makes a full job disappear from the public/matching branch
-- of jobs_select entirely (feed AND detail, since both run through this
-- same policy), the same way an already-closed job does. It reappears
-- automatically once a bid is rejected or withdrawn, since the count is
-- re-evaluated on every query — no separate "reopen" step needed.
--
-- Doesn't affect a handyman who already has a bid on the job (they still
-- see it via auth_has_bid_on_job, same as always) or the client who owns it.
--
-- Safe to run more than once — drops and recreates the policy.

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
    and (select count(*) from bids b2 where b2.job_id = jobs.id and b2.status <> 'withdrawn') < jobs.max_bids
  )
);
