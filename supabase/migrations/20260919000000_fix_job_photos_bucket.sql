-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- The original job-photos bucket + policy migration
-- (20260916000000_job_photos_storage.sql) was apparently never actually run
-- against this project — the bucket didn't exist, which is why photo
-- uploads have been failing with "Bucket not found" the whole time. You've
-- now created the bucket by hand in the dashboard, but a hand-created
-- bucket defaults to private and has no access policies.
--
-- This file is self-contained (doesn't depend on 20260916 having run) and
-- safe to run whether the bucket already exists or not, and however it's
-- currently configured: the upsert below creates the bucket if missing or
-- flips an existing one to public, and the policies are dropped and
-- recreated so no stale versions linger.

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do update set public = true;

drop policy if exists job_photos_storage_insert on storage.objects;
create policy job_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and exists (
      select 1 from jobs j
      where j.id::text = (storage.foldername(name))[1]
      and j.client_id = auth.uid()
    )
  );

drop policy if exists job_photos_storage_delete on storage.objects;
create policy job_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'job-photos'
    and exists (
      select 1 from jobs j
      where j.id::text = (storage.foldername(name))[1]
      and j.client_id = auth.uid()
    )
  );
