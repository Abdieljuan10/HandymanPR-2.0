-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Job expiry: a job with no accepted bid expires 21 days after it's posted
-- (or after a renewal resets the clock), so dead listings don't pile up
-- forever. 21 days, not 30 -- handyman jobs are urgency-driven, and a job
-- with zero bids after three weeks is effectively dead.
--
-- Renewal needs no new RPC: the existing jobs_update policy (client_id =
-- auth.uid()) already lets a client set any column on their own job
-- regardless of current status -- same as how cancellation already worked
-- before this migration. The app just does
-- .update({ status: 'open', expires_at: <now + 21 days> }).
--
-- No RLS changes needed either: jobs_select's public-discovery branch and
-- the handyman feed query both already filter status = 'open', so an
-- expired job drops out of the feed for free.
--
-- Safe to run more than once -- the column add is guarded, the enum value
-- add is guarded, and the function/cron are create-or-replace / drop-and-
-- recreate.

-- The default is a volatile expression (now()), so adding this column
-- backfills every existing open job with a fresh 21-day clock from
-- whenever this migration is actually run, not from each job's original
-- created_at.
alter table jobs add column if not exists expires_at timestamptz not null default (now() + interval '21 days');

alter type job_status add value if not exists 'expired';

-- ============================================================
-- Sweep: flip stale open jobs to expired and notify the client.
-- Same shape as notify_free_tier_new_jobs() in
-- 20260922000000_push_notifications_send.sql -- reuses send_push_to_users().
-- ============================================================

create or replace function expire_stale_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
begin
  for v_job in
    select * from jobs
    where status = 'open'
      and expires_at <= now()
  loop
    update jobs set status = 'expired' where id = v_job.id;

    perform send_push_to_users(
      array[v_job.client_id],
      'Your job listing expired',
      '"' || v_job.title || '" got no hires in 21 days. Renew it to keep it visible, or let it go.',
      jsonb_build_object('type', 'job_expired', 'job_id', v_job.id)
    );
  end loop;
end;
$$;

select cron.unschedule('expire-stale-jobs')
where exists (select 1 from cron.job where jobname = 'expire-stale-jobs');

select cron.schedule('expire-stale-jobs', '0 * * * *', 'select expire_stale_jobs();');
