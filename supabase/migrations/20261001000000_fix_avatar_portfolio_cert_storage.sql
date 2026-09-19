-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run whether or not 20260918000000_storage_bidding_messaging.sql
-- ever actually applied -- every statement below is drop-if-exists /
-- on-conflict-do-update, so a blind re-apply is harmless either way.
--
-- Reported bug: adding an avatar on profile edit fails with "new row
-- violates row-level security policy." Reviewed the upload code against
-- every other bucket's policy in this schema -- job-photos,
-- portfolio-photos, and certifications all use the identical
-- `(storage.foldername(name))[1] = <owner id>` pattern, and the avatar
-- upload path (`{user_id}/avatar.jpg`) plus the avatars policies' own logic
-- both match that pattern exactly. There's no path/indexing mismatch to
-- fix in the code. The most likely explanation, matching exactly what
-- happened with job-photos before (see
-- 20260919000000_fix_job_photos_bucket.sql's comment): this migration's
-- bucket+policy statements were never actually run against this project.
--
-- Also re-applies portfolio-photos and certifications for the same
-- reason -- they're defined in that same original file, so if avatars
-- never landed, those probably didn't either, even though only avatars has
-- actually been exercised (and failed) so far.
--
-- To confirm the cause before just re-running this, check what's live:
--   select id, public from storage.buckets
--   where id in ('avatars', 'portfolio-photos', 'certifications');
--
--   select policyname from pg_policies
--   where schemaname = 'storage'
--     and (policyname like 'avatars_%' or policyname like 'portfolio_photos_%'
--          or policyname like 'certifications_%');
-- Missing buckets or missing policies in either result confirm the
-- "never ran" theory. Either way, running the statements below is safe.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

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

insert into storage.buckets (id, name, public)
values ('portfolio-photos', 'portfolio-photos', true)
on conflict (id) do update set public = true;

drop policy if exists portfolio_photos_storage_insert on storage.objects;
create policy portfolio_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists portfolio_photos_storage_delete on storage.objects;
create policy portfolio_photos_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('certifications', 'certifications', false)
on conflict (id) do update set public = false;

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
