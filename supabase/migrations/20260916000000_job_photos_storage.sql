-- Creates the Storage bucket that job photos are uploaded into.
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Public bucket: anyone with a photo's URL can view it (same as most
-- marketplace listing photos — lower sensitivity than the exact address,
-- which stays locked down in job_locations). Uploading is still restricted
-- below to the job's own client, so nobody can write into another job's
-- folder or fill the bucket with unrelated files.
--
-- Path convention: job-photos/{job_id}/{filename}

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

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
