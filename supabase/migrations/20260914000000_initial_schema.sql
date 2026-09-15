-- HandymanPR initial schema
-- Run this whole file once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- After this succeeds, run seed.sql (in this same folder) to load pueblos/trades/categories.

create extension if not exists pgcrypto;

-- ============================================================
-- Enums
-- ============================================================

create type job_status as enum ('open', 'hired', 'completed', 'cancelled');
create type job_visibility as enum ('public', 'invite_only');
create type bid_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');
create type account_role as enum ('client', 'handyman');

-- ============================================================
-- Reference tables (small, admin-managed lookup lists)
-- ============================================================

create table service_categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null
);

-- Specific specialties within a category (plumbing, electrical, etc).
-- Scoped to a category so a future non-handyman category can have its own trade list.
create table trades (
  id smallint generated always as identity primary key,
  category_id smallint not null references service_categories(id),
  slug text not null unique,
  name text not null,
  sort_order smallint not null default 0
);

-- The 78 municipios of Puerto Rico.
create table pueblos (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  sort_order smallint not null default 0
);

alter table service_categories enable row level security;
alter table trades enable row level security;
alter table pueblos enable row level security;

create policy service_categories_select on service_categories for select to authenticated using (true);
create policy trades_select on trades for select to authenticated using (true);
create policy pueblos_select on pueblos for select to authenticated using (true);

-- ============================================================
-- Accounts: two fully separate profile tables, one per account type.
-- Both reference auth.users(id) (Supabase's shared login table) but
-- share no columns and no "role" flag with each other.
-- ============================================================

create table client_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table handyman_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  bio text,
  years_experience smallint,
  -- Admin-controlled fields. See trg_protect_handyman_admin_fields below:
  -- a logged-in handyman can never change these through the normal app connection.
  is_verified boolean not null default false,
  is_subscribed boolean not null default false,
  subscription_expires_at timestamptz,
  is_promoted boolean not null default false,
  promotion_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table client_profiles enable row level security;
alter table handyman_profiles enable row level security;

-- Client profiles: readable by anyone logged in (so handymen can see who posted a job),
-- writable only by the owner.
create policy client_profiles_select on client_profiles for select to authenticated using (true);
create policy client_profiles_insert on client_profiles for insert to authenticated with check (id = auth.uid());
create policy client_profiles_update on client_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Handyman profiles are public/browsable by design (client discovery feature).
create policy handyman_profiles_select on handyman_profiles for select to authenticated using (true);
create policy handyman_profiles_insert on handyman_profiles for insert to authenticated with check (id = auth.uid());
create policy handyman_profiles_update on handyman_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Admin-only fields stay frozen for any update coming from a normal logged-in user.
-- Changing them for real (verifying a cert, activating a subscription/promotion) is
-- something you do yourself in the Supabase Table Editor, which connects as an
-- admin/service role, not as 'authenticated'.
create or replace function protect_handyman_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    new.is_verified := old.is_verified;
    new.is_subscribed := old.is_subscribed;
    new.subscription_expires_at := old.subscription_expires_at;
    new.is_promoted := old.is_promoted;
    new.promotion_expires_at := old.promotion_expires_at;
  end if;
  return new;
end;
$$;

create trigger trg_protect_handyman_admin_fields
before update on handyman_profiles
for each row execute function protect_handyman_admin_fields();

-- ============================================================
-- Handyman detail tables
-- ============================================================

create table handyman_pueblos (
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  pueblo_id smallint not null references pueblos(id),
  primary key (handyman_id, pueblo_id)
);
create index idx_handyman_pueblos_pueblo on handyman_pueblos(pueblo_id);

create table handyman_trades (
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  trade_id smallint not null references trades(id),
  primary key (handyman_id, trade_id)
);
create index idx_handyman_trades_trade on handyman_trades(trade_id);

create table handyman_certifications (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  title text not null,
  issuing_org text,
  file_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_handyman_certifications_handyman on handyman_certifications(handyman_id);

create table handyman_portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  photo_url text not null,
  caption text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index idx_handyman_portfolio_photos_handyman on handyman_portfolio_photos(handyman_id);

alter table handyman_pueblos enable row level security;
alter table handyman_trades enable row level security;
alter table handyman_certifications enable row level security;
alter table handyman_portfolio_photos enable row level security;

create policy handyman_pueblos_select on handyman_pueblos for select to authenticated using (true);
create policy handyman_pueblos_write on handyman_pueblos for all to authenticated using (handyman_id = auth.uid()) with check (handyman_id = auth.uid());

create policy handyman_trades_select on handyman_trades for select to authenticated using (true);
create policy handyman_trades_write on handyman_trades for all to authenticated using (handyman_id = auth.uid()) with check (handyman_id = auth.uid());

create policy handyman_certifications_select on handyman_certifications for select to authenticated using (true);
create policy handyman_certifications_insert on handyman_certifications for insert to authenticated with check (handyman_id = auth.uid());
create policy handyman_certifications_delete on handyman_certifications for delete to authenticated using (handyman_id = auth.uid());
create policy handyman_certifications_update on handyman_certifications for update to authenticated using (handyman_id = auth.uid()) with check (handyman_id = auth.uid());

-- is_verified on a certification is admin-only too, same pattern as the profile flags.
create or replace function protect_certification_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$;

create trigger trg_protect_certification_verified
before update on handyman_certifications
for each row execute function protect_certification_verified();

create policy handyman_portfolio_photos_select on handyman_portfolio_photos for select to authenticated using (true);
create policy handyman_portfolio_photos_write on handyman_portfolio_photos for all to authenticated using (handyman_id = auth.uid()) with check (handyman_id = auth.uid());

-- ============================================================
-- Jobs
-- ============================================================

create table jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client_profiles(id) on delete cascade,
  trade_id smallint not null references trades(id),
  pueblo_id smallint not null references pueblos(id),
  title text not null,
  description text not null,
  status job_status not null default 'open',
  visibility job_visibility not null default 'public',
  invited_handyman_id uuid references handyman_profiles(id),
  max_bids smallint not null default 5 check (max_bids >= 3),
  -- Subscribed handymen see the job immediately; free-tier handymen's queries
  -- filter on "now() >= visible_to_free_at". Both default to the same insert
  -- moment, 15 minutes apart.
  created_at timestamptz not null default now(),
  visible_to_free_at timestamptz not null default (now() + interval '15 minutes'),
  hired_bid_id uuid, -- FK added below, after the bids table exists
  constraint jobs_invite_consistency check (
    (visibility = 'invite_only' and invited_handyman_id is not null)
    or (visibility = 'public' and invited_handyman_id is null)
  )
);
create index idx_jobs_discovery on jobs(pueblo_id, trade_id, status);
create index idx_jobs_client on jobs(client_id);

create table job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  photo_url text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index idx_job_photos_job on job_photos(job_id);

-- Exact address: kept in its own table so it can have tighter RLS than the
-- job itself. Only the client who posted the job and the handyman with the
-- accepted bid can ever read a row here.
create table job_locations (
  job_id uuid primary key references jobs(id) on delete cascade,
  full_address text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Bids
-- ============================================================

create table bids (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  price numeric(10,2) not null check (price > 0),
  note text,
  status bid_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (job_id, handyman_id)
);
create index idx_bids_job on bids(job_id);
create index idx_bids_handyman on bids(handyman_id);

alter table jobs add column hired_bid_id_fk uuid references bids(id) on delete set null;
alter table jobs drop column hired_bid_id;
alter table jobs rename column hired_bid_id_fk to hired_bid_id;

alter table jobs enable row level security;
alter table job_photos enable row level security;
alter table job_locations enable row level security;
alter table bids enable row level security;

-- A handyman can see a public job only if: it's open, matches one of their
-- pueblos AND one of their trades, and (the 15-minute subscriber head start
-- has passed OR they're currently subscribed). They can also always see a
-- job they were personally invited to, or one they've already bid on
-- (so their bid history keeps working after a job closes).
create policy jobs_select on jobs for select to authenticated using (
  client_id = auth.uid()
  or (visibility = 'invite_only' and invited_handyman_id = auth.uid())
  or exists (select 1 from bids b where b.job_id = jobs.id and b.handyman_id = auth.uid())
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

create policy jobs_insert on jobs for insert to authenticated with check (client_id = auth.uid());
create policy jobs_update on jobs for update to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy jobs_delete on jobs for delete to authenticated using (client_id = auth.uid() and status = 'open');

-- job_photos/job_locations don't repeat the eligibility logic: they just ask
-- "can this user see the parent job row at all?", which re-runs the jobs
-- policy above automatically.
create policy job_photos_select on job_photos for select to authenticated using (
  exists (select 1 from jobs j where j.id = job_photos.job_id)
);
create policy job_photos_write on job_photos for all to authenticated
  using (exists (select 1 from jobs j where j.id = job_photos.job_id and j.client_id = auth.uid()))
  with check (exists (select 1 from jobs j where j.id = job_photos.job_id and j.client_id = auth.uid()));

create policy job_locations_select on job_locations for select to authenticated using (
  exists (select 1 from jobs j where j.id = job_locations.job_id and j.client_id = auth.uid())
  or exists (select 1 from bids b where b.job_id = job_locations.job_id and b.handyman_id = auth.uid() and b.status = 'accepted')
);
create policy job_locations_write on job_locations for all to authenticated
  using (exists (select 1 from jobs j where j.id = job_locations.job_id and j.client_id = auth.uid()))
  with check (exists (select 1 from jobs j where j.id = job_locations.job_id and j.client_id = auth.uid()));

create policy bids_select on bids for select to authenticated using (
  handyman_id = auth.uid()
  or exists (select 1 from jobs j where j.id = bids.job_id and j.client_id = auth.uid())
);
create policy bids_insert on bids for insert to authenticated with check (handyman_id = auth.uid());
create policy bids_update_by_handyman on bids for update to authenticated
  using (handyman_id = auth.uid()) with check (handyman_id = auth.uid());
create policy bids_update_by_client on bids for update to authenticated
  using (exists (select 1 from jobs j where j.id = bids.job_id and j.client_id = auth.uid()))
  with check (exists (select 1 from jobs j where j.id = bids.job_id and j.client_id = auth.uid()));

-- Server-side rules a bid must satisfy, enforced no matter what the app sends:
-- job must be open; invite-only jobs only accept the invited handyman;
-- public jobs require a pueblo+trade match; the bid cap can't be exceeded;
-- and during the 15-minute head start, only subscribed handymen get through.
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

    select count(*) into v_bid_count from bids where job_id = new.job_id and status <> 'withdrawn';
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

create trigger trg_enforce_bid_insert
before insert on bids
for each row execute function enforce_bid_insert();

-- When a client accepts a bid: mark the job hired, remember which bid won,
-- and auto-reject the other still-pending bids so the list doesn't linger.
create or replace function handle_bid_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update jobs set status = 'hired', hired_bid_id = new.id where id = new.job_id;
    update bids set status = 'rejected' where job_id = new.job_id and id <> new.id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger trg_bid_accepted
after update on bids
for each row execute function handle_bid_accepted();

-- ============================================================
-- Chat: one thread per (job, handyman) pair, so an open job with several
-- interested handymen doesn't mix everyone's questions into one thread.
-- ============================================================

create table job_conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  client_id uuid not null references client_profiles(id) on delete cascade,
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, handyman_id)
);
create index idx_job_conversations_client on job_conversations(client_id);
create index idx_job_conversations_handyman on job_conversations(handyman_id);

create table job_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references job_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null,
  photo_url text, -- unused for now; photos are a later add-on per the spec
  created_at timestamptz not null default now()
);
create index idx_job_messages_conversation on job_messages(conversation_id, created_at);

alter table job_conversations enable row level security;
alter table job_messages enable row level security;

create policy job_conversations_select on job_conversations for select to authenticated using (
  client_id = auth.uid() or handyman_id = auth.uid()
);
create policy job_conversations_insert on job_conversations for insert to authenticated with check (
  (client_id = auth.uid() and exists (select 1 from jobs j where j.id = job_conversations.job_id and j.client_id = auth.uid()))
  or
  (handyman_id = auth.uid() and exists (select 1 from jobs j where j.id = job_conversations.job_id))
);

create policy job_messages_select on job_messages for select to authenticated using (
  exists (select 1 from job_conversations c where c.id = job_messages.conversation_id)
);
create policy job_messages_insert on job_messages for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (
    select 1 from job_conversations c
    where c.id = job_messages.conversation_id
    and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
  )
);

-- ============================================================
-- Reviews: app only ever sends (job_id, author_role, rating, comment).
-- The trigger below looks up who's allowed to write it and fills in
-- author_id/subject_id itself, so nobody can forge a review.
-- ============================================================

create table reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  author_role account_role not null,
  author_id uuid,
  subject_id uuid,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (job_id, author_role)
);
create index idx_reviews_subject on reviews(subject_id);

alter table reviews enable row level security;

create policy reviews_select on reviews for select to authenticated using (true);
create policy reviews_insert on reviews for insert to authenticated with check (true);

create or replace function set_review_parties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
begin
  select * into v_job from jobs where id = new.job_id;

  if v_job.status <> 'completed' then
    raise exception 'Reviews can only be left on completed jobs.';
  end if;

  select handyman_id into v_handyman_id from bids where job_id = new.job_id and status = 'accepted';

  if new.author_role = 'client' then
    if v_job.client_id <> auth.uid() then
      raise exception 'Only the client who posted this job can leave this review.';
    end if;
    new.author_id := v_job.client_id;
    new.subject_id := v_handyman_id;
  else
    if v_handyman_id is distinct from auth.uid() then
      raise exception 'Only the hired handyman for this job can leave this review.';
    end if;
    new.author_id := v_handyman_id;
    new.subject_id := v_job.client_id;
  end if;

  return new;
end;
$$;

create trigger trg_set_review_parties
before insert on reviews
for each row execute function set_review_parties();

-- ============================================================
-- Payment log: optional, informational only, no enforcement.
-- ============================================================

create table payment_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  amount numeric(10,2),
  method text,
  note text,
  logged_by_role account_role not null,
  created_at timestamptz not null default now()
);
create index idx_payment_logs_job on payment_logs(job_id);

alter table payment_logs enable row level security;

create policy payment_logs_select on payment_logs for select to authenticated using (
  exists (
    select 1 from jobs j
    where j.id = payment_logs.job_id
    and (
      j.client_id = auth.uid()
      or exists (select 1 from bids b where b.job_id = j.id and b.handyman_id = auth.uid() and b.status = 'accepted')
    )
  )
);
create policy payment_logs_insert on payment_logs for insert to authenticated with check (
  exists (
    select 1 from jobs j
    where j.id = payment_logs.job_id
    and (
      j.client_id = auth.uid()
      or exists (select 1 from bids b where b.job_id = j.id and b.handyman_id = auth.uid() and b.status = 'accepted')
    )
  )
);
