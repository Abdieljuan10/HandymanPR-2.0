-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Run AFTER 20261008000000_job_invite_notify.sql (uses send_push_to_users
-- the same way; doesn't depend on that migration otherwise).
--
-- Invite a specific handyman to an ALREADY-POSTED public job, client's
-- call 2026-09-23. The job stays public and unchanged for everyone else;
-- the invitation is an extra, per-handyman grant on top of it. Distinct
-- from jobs.invited_handyman_id, which is one slot, tied by a check
-- constraint to visibility = 'invite_only', and means "private job".
--
-- A plain push wasn't enough: jobs_select only shows a public job to a
-- handyman who covers its pueblo AND trade, is past the free-tier head
-- start, and only while it has bid slots left -- and enforce_bid_insert
-- applies the same gates. A client who finds someone on Browse by name
-- would often be inviting a person who can't open or bid on the job. So an
-- invitation grants both:
--   - visibility of the job while it's open (jobs_select branch below;
--     job_photos follow automatically, their policy defers to jobs_select).
--     The address stays hidden until hired, exactly as for every bidder --
--     job_locations_select only ever shows it to the client and the
--     accepted handyman.
--   - bidding past the pueblo/trade, head-start and max_bids checks
--     (client's explicit call: a full job still takes a bid from someone
--     they invited by name -- that's the point of inviting them).
--
-- Rules, enforced in the insert trigger (not just the app):
--   - only the job's own client can invite (RLS),
--   - job must be open and public (invite_only jobs already have their one
--     handyman),
--   - one invitation per handyman per job (primary key),
--   - not to a handyman who has already bid on the job,
--   - at most 10 invitations per job (caps push spam from one job).
-- Deliberately NO delete policy (no revoke): delete + re-insert would be a
-- fresh row and a fresh push every time, letting a client ping the same
-- handyman without limit. Once sent, an invitation stays -- one push per
-- handyman per job, ever.
--
-- Safe to run more than once -- table/index guarded, functions
-- create-or-replace, policies and triggers dropped and recreated.

create table if not exists job_invitations (
  job_id uuid not null references jobs(id) on delete cascade,
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, handyman_id)
);
create index if not exists idx_job_invitations_handyman on job_invitations(handyman_id);

alter table job_invitations enable row level security;

-- ------------------------------------------------------------
-- Helper for jobs_select. Security definer for the same reason as
-- auth_owns_job()/auth_has_bid_on_job() (20260917000000): job_invitations'
-- own policies reference jobs, so querying it directly from jobs_select
-- would recurse. Only ever answers for the caller's own auth.uid().
-- ------------------------------------------------------------
create or replace function auth_is_invited_to_job(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from job_invitations where job_id = p_job_id and handyman_id = auth.uid());
$$;

-- Client sees the invitations on their own jobs; a handyman sees only the
-- ones addressed to them (never who else was invited).
drop policy if exists job_invitations_select on job_invitations;
create policy job_invitations_select on job_invitations for select to authenticated using (
  handyman_id = auth.uid() or auth_owns_job(job_id)
);

drop policy if exists job_invitations_insert on job_invitations;
create policy job_invitations_insert on job_invitations for insert to authenticated with check (
  auth_owns_job(job_id)
);

-- No update/delete policies: see the header (no revoke, by design).
drop policy if exists job_invitations_delete on job_invitations;

-- ------------------------------------------------------------
-- Insert guard: the business rules RLS can't express.
-- ------------------------------------------------------------
create or replace function enforce_job_invitation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
begin
  -- Ownership FIRST, before any message that depends on the job's data. A
  -- BEFORE trigger runs before the insert policy's WITH CHECK, so without
  -- this a non-owner could read the errors below as an oracle -- e.g. "has
  -- this competitor already bid on this job?". The policy re-checks
  -- ownership anyway; this just makes sure nothing leaks first.
  if not auth_owns_job(new.job_id) then
    raise exception 'You can only invite handymen to your own jobs.';
  end if;

  select * into v_job from jobs where id = new.job_id;

  if v_job.status <> 'open' then
    raise exception 'You can only invite handymen to an open job.';
  end if;
  if v_job.visibility <> 'public' then
    raise exception 'This job is already a private invite.';
  end if;
  if exists (select 1 from bids where job_id = new.job_id and handyman_id = new.handyman_id) then
    raise exception 'This handyman has already bid on this job.';
  end if;
  if (select count(*) from job_invitations where job_id = new.job_id) >= 10 then
    raise exception 'You can invite at most 10 handymen to one job.';
  end if;

  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_job_invitation_insert on job_invitations;
create trigger trg_enforce_job_invitation_insert
before insert on job_invitations
for each row execute function enforce_job_invitation_insert();

create or replace function notify_job_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from jobs where id = new.job_id;
  perform send_push_to_users(
    array[new.handyman_id],
    'Te invitaron a cotizar',
    v_title,
    'You''ve been invited to quote',
    v_title,
    jsonb_build_object('type', 'job_invite', 'job_id', new.job_id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_job_invitation on job_invitations;
create trigger trg_notify_job_invitation
after insert on job_invitations
for each row execute function notify_job_invitation();

-- ------------------------------------------------------------
-- Visibility: jobs_select exactly as 20260919010000 left it, plus one
-- branch -- an invited handyman sees the job while it's open. After they
-- bid, the existing auth_has_bid_on_job() branch keeps it visible.
-- ------------------------------------------------------------
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select to authenticated using (
  client_id = auth.uid()
  or (visibility = 'invite_only' and invited_handyman_id = auth.uid())
  or auth_has_bid_on_job(jobs.id)
  or (status = 'open' and auth_is_invited_to_job(jobs.id))
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

-- ------------------------------------------------------------
-- Bidding: enforce_bid_insert exactly as 20260924000000 left it, plus the
-- invitation bypass for public jobs. Status still has to be 'open', and
-- the bid itself still goes through bids_insert (handyman_id = auth.uid()).
-- ------------------------------------------------------------
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
  elsif exists (select 1 from job_invitations where job_id = new.job_id and handyman_id = new.handyman_id) then
    -- Invited by name on a public job: skip the pueblo/trade, max_bids and
    -- head-start gates below.
    null;
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
