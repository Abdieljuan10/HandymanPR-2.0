-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Two client-reported bugs, fixed together:
--
-- 1. Deleting a job only ever removed its Storage photos when the app did
--    it explicitly (job-edit's per-photo remove) -- a straight job delete
--    never touched Storage at all, since job_photos.job_id's on-delete
--    cascade only clears the DB rows, not the actual files. Fixed on the
--    app side (job/[id]/index.tsx's handleDelete now lists and removes the
--    job's Storage folder before deleting the row -- order matters, since
--    the bucket's own delete policy requires a matching jobs row to still
--    exist). This migration is just the DB half: nothing to add here for
--    that fix itself, but see the standalone cleanup script
--    (scripts/cleanup-orphaned-job-photos.js) for photos already orphaned
--    by every job deleted before this fix landed.
--
-- 2. jobs_delete only allowed deleting an 'open' job -- a cancelled or
--    expired job (dead, nobody hired, no reviews coming) couldn't be
--    deleted at all, cluttering the client's list. Widened to also allow
--    'cancelled' and 'expired'. Deliberately NOT widened to 'completed'
--    (or 'hired'/'pending_completion', unchanged from before) -- a
--    completed job has reviews attached, and those belong to whoever
--    received them; letting either side delete the job to erase a review
--    they didn't like would defeat the point of the whole review system.
--
-- Safe to run more than once -- the policy is dropped and recreated.

drop policy if exists jobs_delete on jobs;
create policy jobs_delete on jobs for delete to authenticated using (
  client_id = auth.uid() and status in ('open', 'cancelled', 'expired')
);
