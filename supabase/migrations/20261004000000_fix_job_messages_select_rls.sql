-- Bug: job_messages_select only checked that a conversation row EXISTS,
-- not that the caller is actually a party to it -- any authenticated user
-- could read any conversation's messages. Found while researching the
-- per-user chat deletion/archiving + photo attachments work (see TODO.md);
-- fixing this now on its own since it's live and cheap, ahead of that
-- larger batch.
drop policy if exists job_messages_select on job_messages;

create policy job_messages_select on job_messages for select to authenticated using (
  exists (
    select 1 from job_conversations c
    where c.id = job_messages.conversation_id
    and (c.client_id = auth.uid() or c.handyman_id = auth.uid())
  )
);
