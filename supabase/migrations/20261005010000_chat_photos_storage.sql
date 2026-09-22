-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Section 2 of the per-user chat deletion/archiving + attachments batch
-- (see TODO.md). Creates the Storage bucket chat photo attachments upload
-- into.
--
-- Private bucket: chat photos are personal, never public (unlike job-photos,
-- which are marketplace listing photos anyone can see). Path convention:
-- chat-photos/{conversation_id}/{filename} -- folder = the parent
-- conversation, not the uploader, since BOTH parties (client and handyman)
-- need read/write access, not just whoever sent a given photo. Same
-- ownership-via-parent-id shape as job-photos
-- (20260916000000_job_photos_storage.sql), just keyed off job_conversations
-- instead of jobs, rather than the flatter {owner_id}/... pattern
-- avatars/portfolio-photos/certifications use.
--
-- Safe to run more than once -- bucket insert is guarded, policies are
-- dropped and recreated.

insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', false)
on conflict (id) do nothing;

drop policy if exists chat_photos_storage_insert on storage.objects;
create policy chat_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and exists (
      select 1 from job_conversations c
      where c.id::text = (storage.foldername(name))[1]
      and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
    )
  );

drop policy if exists chat_photos_storage_select on storage.objects;
create policy chat_photos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and exists (
      select 1 from job_conversations c
      where c.id::text = (storage.foldername(name))[1]
      and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
    )
  );

drop policy if exists chat_photos_storage_delete on storage.objects;
create policy chat_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-photos'
    and exists (
      select 1 from job_conversations c
      where c.id::text = (storage.foldername(name))[1]
      and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
    )
  );
