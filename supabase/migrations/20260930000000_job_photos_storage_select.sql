-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Fixes the automatic Storage cleanup added in 20260929000000_job_deletion.sql:
-- the client reported deleting all but 3 jobs and still seeing 5 folders in
-- the job-photos bucket, meaning fresh deletions were STILL leaving orphans
-- even after that fix. Root cause: the job-photos bucket only ever had INSERT
-- and DELETE policies on storage.objects (20260919000000_fix_job_photos_bucket.sql)
-- -- no SELECT policy. The bucket's `public: true` flag only exempts
-- unauthenticated GET requests to an object's public URL from RLS; it does
-- NOT exempt list() (a query against storage.objects, gated by RLS like any
-- other table read) -- the certifications bucket already needed exactly this
-- same select policy for its own (private-bucket) reason. Without it,
-- handleDelete()'s `supabase.storage.from('job-photos').list(id)` silently
-- returned an empty array (RLS filters rows, it doesn't error), so remove()
-- was never called -- the job row still deleted successfully, with no error
-- surfaced, while its photos stayed behind. Exactly reproduces the report.
--
-- Scoped the same way as the existing insert/delete policies: only the job's
-- owning client can list its folder. Nobody else needs to -- a handyman
-- viewing job photos always goes through the public URL stored in
-- job_photos.photo_url, never list().
--
-- Safe to run more than once -- the policy is dropped and recreated.

drop policy if exists job_photos_storage_select on storage.objects;
create policy job_photos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-photos'
    and exists (
      select 1 from jobs j
      where j.id::text = (storage.foldername(name))[1]
      and j.client_id = auth.uid()
    )
  );
