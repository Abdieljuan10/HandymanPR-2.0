-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once: every statement below either uses
-- "on conflict do nothing", "create or replace", "drop policy if exists",
-- or an explicit existence check first.
--
-- This migration:
--   1. Creates the remaining Storage buckets (avatars, portfolio photos,
--      certifications) — job-photos already existed.
--   2. Locks down what a bid UPDATE is allowed to do: a handyman may only
--      withdraw their own still-pending bid; a client may only accept or
--      reject a still-pending bid on their own job. Nobody can change a
--      bid's price/note/job/handyman after the fact through the app.
--   3. Closes a gap in job_conversations_insert: a handyman could
--      previously write any client_id into a new conversation row, not
--      necessarily the job's real client — which would let a wrong user's
--      client_id see a conversation they have nothing to do with once
--      they log in. Now it must match the job's actual client.
--   4. Turns on Realtime for job_messages, so chat screens can subscribe
--      to new messages instead of polling.

-- ============================================================
-- 1. Storage buckets
-- ============================================================

-- Avatars (client + handyman profile photos). Public, same trust level as
-- job photos. Path convention: avatars/{user_id}/{filename} — user_id is
-- the same id as the profile row (client_profiles.id or
-- handyman_profiles.id), which is always auth.uid() for its owner.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_storage_insert on storage.objects;
create policy avatars_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_storage_update on storage.objects;
create policy avatars_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_storage_delete on storage.objects;
create policy avatars_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Portfolio photos (handyman_portfolio_photos). Public, same reasoning as
-- job photos — these are meant to be shown on a browsable public profile.
-- Path convention: portfolio-photos/{handyman_id}/{filename}.
insert into storage.buckets (id, name, public)
values ('portfolio-photos', 'portfolio-photos', true)
on conflict (id) do nothing;

drop policy if exists portfolio_photos_storage_insert on storage.objects;
create policy portfolio_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists portfolio_photos_storage_delete on storage.objects;
create policy portfolio_photos_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Certifications (handyman_certifications.file_url). PRIVATE, unlike the
-- other three — a license/certification document can carry more personal
-- detail than the row metadata (title/org) that's already public, so only
-- the owning handyman can read or write their own files. The app must
-- fetch these with supabase.storage.from('certifications').createSignedUrl(...),
-- not a public URL, once certification upload is actually built.
-- Path convention: certifications/{handyman_id}/{filename}.
insert into storage.buckets (id, name, public)
values ('certifications', 'certifications', false)
on conflict (id) do nothing;

drop policy if exists certifications_storage_select on storage.objects;
create policy certifications_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'certifications' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists certifications_storage_insert on storage.objects;
create policy certifications_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certifications' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists certifications_storage_delete on storage.objects;
create policy certifications_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'certifications' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 2. Bid update guard
-- ============================================================

create or replace function enforce_bid_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists trg_enforce_bid_update on bids;
create trigger trg_enforce_bid_update
before update on bids
for each row execute function enforce_bid_update();

-- ============================================================
-- 3. job_conversations_insert: require the client_id a handyman writes
--    to actually be the job's real client.
-- ============================================================

drop policy if exists job_conversations_insert on job_conversations;
create policy job_conversations_insert on job_conversations for insert to authenticated with check (
  (client_id = auth.uid() and exists (select 1 from jobs j where j.id = job_conversations.job_id and j.client_id = auth.uid()))
  or
  (handyman_id = auth.uid() and exists (select 1 from jobs j where j.id = job_conversations.job_id and j.client_id = job_conversations.client_id))
);

-- ============================================================
-- 4. Realtime for chat
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_messages'
  ) then
    alter publication supabase_realtime add table job_messages;
  end if;
end $$;
