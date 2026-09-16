-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Two follow-ups to 20260923000000_job_expiry.sql, both requested after the
-- client tested Phase 1 on-device:
--
-- 1. Renewing an expired job needs to re-notify matching handymen -- not
--    just reopen silently -- since some may have joined or started working
--    that pueblo/trade in the 21 days since the original post. This needs
--    a real function (not a plain client-side update, which is all renewal
--    used before this) because it has to: reset the 15-minute subscriber
--    head start (visible_to_free_at) and free_tier_notified_at so the
--    existing once-a-minute notify_free_tier_new_jobs() cron in
--    20260922000000_push_notifications_send.sql picks it up again for
--    free-tier handymen; and send the immediate subscribed-handyman push
--    itself, mirroring notify_subscribed_new_job()'s query exactly. It does
--    NOT touch created_at, so a renewed job doesn't jump the feed ordering
--    ahead of fresher listings -- promoted placement is a paid feature for
--    later, not something a renewal should give away for free.
--
-- 2. The expiry push copy now nudges the client toward fixing *why* the job
--    got no bids (photos/detail) rather than just offering to re-list it
--    as-is.
--
-- Safe to run more than once -- both functions are create-or-replace.

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
      '"' || v_job.title || '" got no bids in 21 days. Adding photos or more detail often helps -- renew it from the job screen when you''re ready.',
      jsonb_build_object('type', 'job_expired', 'job_id', v_job.id)
    );
  end loop;
end;
$$;

create or replace function renew_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_ids uuid[];
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.client_id <> auth.uid() then
    raise exception 'Only the client who posted this job can renew it.';
  end if;
  if v_job.status <> 'expired' then
    raise exception 'Only an expired job can be renewed.';
  end if;

  -- Resets the 21-day clock and the 15-minute subscriber head start, and
  -- clears free_tier_notified_at so notify_free_tier_new_jobs() treats this
  -- as a fresh job for free-tier handymen once the head start passes again.
  -- created_at is deliberately untouched -- no feed-order boost.
  update jobs
  set status = 'open',
      expires_at = now() + interval '21 days',
      visible_to_free_at = now() + interval '15 minutes',
      free_tier_notified_at = null
  where id = p_job_id;

  if v_job.visibility = 'public' then
    select coalesce(array_agg(distinct hp.handyman_id), array[]::uuid[])
    into v_handyman_ids
    from handyman_pueblos hp
    join handyman_trades ht on ht.handyman_id = hp.handyman_id
    join handyman_profiles h on h.id = hp.handyman_id
    where hp.pueblo_id = v_job.pueblo_id
      and ht.trade_id = v_job.trade_id
      and h.is_subscribed
      and (h.subscription_expires_at is null or h.subscription_expires_at > now());

    if array_length(v_handyman_ids, 1) > 0 then
      perform send_push_to_users(
        v_handyman_ids,
        'Job renewed near you',
        v_job.title,
        jsonb_build_object('type', 'new_job', 'job_id', v_job.id)
      );
    end if;
  end if;
end;
$$;

grant execute on function renew_job(uuid) to authenticated;
