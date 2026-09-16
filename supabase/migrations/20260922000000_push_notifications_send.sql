-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Before running this: enable the "pg_net" and "pg_cron" extensions via
-- Database -> Extensions in the Supabase dashboard (Supabase restricts
-- `create extension` for these two to the dashboard toggle rather than
-- allowing it from the SQL Editor directly). Both are free-tier available.
--
-- This is the SENDING half of push notifications — 20260920000000_push_tokens.sql
-- only stored tokens. Sends go straight from Postgres via pg_net rather than
-- through an Edge Function, since that needs no separate deploy step (the
-- rest of this schema is already applied by hand via the SQL Editor, so this
-- matches how the project actually ships changes).
--
-- Four notification types, matching the roadmap:
--   1. New bid on your job -> notify the client
--   2. Bid accepted/rejected -> notify the handyman
--   3. New message -> notify whichever party didn't send it
--   4. New job posted -> notify matching handymen, respecting the
--      15-minute subscriber head start (jobs.visible_to_free_at): subscribed
--      matching handymen are notified immediately on insert; free-tier
--      matching handymen are caught by a once-a-minute pg_cron job once
--      their head start passes.
--
-- Not included (see TODO.md): de-duplicating notifications when the
-- recipient already has the conversation open in the foreground — there's
-- no "last read" marker in the schema yet to base that on.
--
-- Safe to run more than once — every function is create-or-replace, and
-- the cron schedule is dropped and recreated.

-- ============================================================
-- Core sender: looks up push tokens for a set of users and fires one
-- batched request to Expo's push API. Fire-and-forget (pg_net queues the
-- HTTP call asynchronously) — a failed push shouldn't roll back the bid/
-- message/job insert that triggered it.
-- ============================================================

create or replace function send_push_to_users(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages jsonb;
begin
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'to', pt.expo_push_token,
      'title', p_title,
      'body', p_body,
      'data', p_data
    )),
    '[]'::jsonb
  )
  into v_messages
  from push_tokens pt
  where pt.user_id = any(p_user_ids);

  if jsonb_array_length(v_messages) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := v_messages
  );
end;
$$;

-- ============================================================
-- 1. New bid -> notify the client who owns the job.
-- ============================================================

create or replace function notify_client_new_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_name text;
begin
  select * into v_job from jobs where id = new.job_id;
  select full_name into v_handyman_name from handyman_profiles where id = new.handyman_id;

  perform send_push_to_users(
    array[v_job.client_id],
    'New bid on your job',
    coalesce(v_handyman_name, 'A handyman') || ' bid $' || new.price::text || ' on "' || v_job.title || '"',
    jsonb_build_object('type', 'new_bid', 'job_id', v_job.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_client_new_bid on bids;
create trigger trg_notify_client_new_bid
after insert on bids
for each row execute function notify_client_new_bid();

-- ============================================================
-- 2. Bid accepted/rejected -> notify the handyman who placed it.
-- Fires alongside the existing trg_bid_accepted trigger (20260914000000),
-- which is the one that also auto-rejects the other pending bids — this
-- trigger just adds the push, it doesn't touch bid/job status itself.
-- ============================================================

create or replace function notify_handyman_bid_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_title text;
begin
  if new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
    select title into v_job_title from jobs where id = new.job_id;

    perform send_push_to_users(
      array[new.handyman_id],
      case when new.status = 'accepted' then 'Bid accepted!' else 'Bid update' end,
      case
        when new.status = 'accepted' then 'You got the job: "' || v_job_title || '"'
        else 'Your bid on "' || v_job_title || '" wasn''t selected.'
      end,
      jsonb_build_object('type', 'bid_status', 'job_id', new.job_id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_handyman_bid_status on bids;
create trigger trg_notify_handyman_bid_status
after update on bids
for each row execute function notify_handyman_bid_status();

-- ============================================================
-- 3. New message -> notify whichever party in the conversation didn't
-- send it.
-- ============================================================

create or replace function notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv job_conversations%rowtype;
  v_recipient uuid;
  v_sender_name text;
begin
  select * into v_conv from job_conversations where id = new.conversation_id;

  if new.sender_id = v_conv.client_id then
    v_recipient := v_conv.handyman_id;
    select full_name into v_sender_name from client_profiles where id = v_conv.client_id;
  else
    v_recipient := v_conv.client_id;
    select full_name into v_sender_name from handyman_profiles where id = v_conv.handyman_id;
  end if;

  perform send_push_to_users(
    array[v_recipient],
    coalesce(v_sender_name, 'New message'),
    left(new.body, 120),
    jsonb_build_object('type', 'new_message', 'conversation_id', new.conversation_id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on job_messages;
create trigger trg_notify_new_message
after insert on job_messages
for each row execute function notify_new_message();

-- ============================================================
-- 4. New job posted -> notify matching handymen, respecting the
-- 15-minute subscriber head start.
-- ============================================================

alter table jobs add column if not exists free_tier_notified_at timestamptz;

-- Immediate: subscribed handymen matching pueblo+trade see (and are told
-- about) the job right away, same as their feed visibility.
create or replace function notify_subscribed_new_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handyman_ids uuid[];
begin
  if new.status = 'open' and new.visibility = 'public' then
    select coalesce(array_agg(distinct hp.handyman_id), array[]::uuid[])
    into v_handyman_ids
    from handyman_pueblos hp
    join handyman_trades ht on ht.handyman_id = hp.handyman_id
    join handyman_profiles h on h.id = hp.handyman_id
    where hp.pueblo_id = new.pueblo_id
      and ht.trade_id = new.trade_id
      and h.is_subscribed
      and (h.subscription_expires_at is null or h.subscription_expires_at > now());

    if array_length(v_handyman_ids, 1) > 0 then
      perform send_push_to_users(
        v_handyman_ids,
        'New job near you',
        new.title,
        jsonb_build_object('type', 'new_job', 'job_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_subscribed_new_job on jobs;
create trigger trg_notify_subscribed_new_job
after insert on jobs
for each row execute function notify_subscribed_new_job();

-- Delayed: once a minute, catch jobs whose 15-minute head start has just
-- passed and notify matching free-tier handymen (subscribed ones already
-- got the immediate push above, so this only needs to run once per job —
-- free_tier_notified_at marks that it has).
create or replace function notify_free_tier_new_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_handyman_ids uuid[];
begin
  for v_job in
    select * from jobs
    where status = 'open'
      and visibility = 'public'
      and visible_to_free_at <= now()
      and free_tier_notified_at is null
  loop
    -- Excludes currently-subscribed handymen: they already got the
    -- immediate push from notify_subscribed_new_job() at insert time, so
    -- including them here would double-notify.
    select coalesce(array_agg(distinct hp.handyman_id), array[]::uuid[])
    into v_handyman_ids
    from handyman_pueblos hp
    join handyman_trades ht on ht.handyman_id = hp.handyman_id
    join handyman_profiles h on h.id = hp.handyman_id
    where hp.pueblo_id = v_job.pueblo_id
      and ht.trade_id = v_job.trade_id
      and not (h.is_subscribed and (h.subscription_expires_at is null or h.subscription_expires_at > now()));

    if array_length(v_handyman_ids, 1) > 0 then
      perform send_push_to_users(
        v_handyman_ids,
        'New job near you',
        v_job.title,
        jsonb_build_object('type', 'new_job', 'job_id', v_job.id)
      );
    end if;

    update jobs set free_tier_notified_at = now() where id = v_job.id;
  end loop;
end;
$$;

select cron.unschedule('notify-free-tier-new-jobs')
where exists (select 1 from cron.job where jobname = 'notify-free-tier-new-jobs');

select cron.schedule('notify-free-tier-new-jobs', '* * * * *', 'select notify_free_tier_new_jobs();');
