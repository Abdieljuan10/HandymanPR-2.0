-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Bug found on-device 2026-09-22: deleting a conversation you had already
-- deleted once before failed with
--   "new row violates row-level security policy (USING expression)
--    for table job_conversation_hides"
--
-- 20261005000000_chat_delete_hide_schema.sql gave this table select/insert/
-- delete policies but NO update policy. The app upserts the hide row (it has
-- to -- re-hiding a conversation that resurfaced after a new message must
-- move hidden_at forward, not fail on the existing primary key), and an
-- upsert is INSERT ... ON CONFLICT DO UPDATE. When the row already exists,
-- Postgres takes the UPDATE path, which is gated by an UPDATE policy's
-- USING expression -- with no such policy, no existing row qualifies, hence
-- the "(USING expression)" error on what looks like a plain insert.
--
-- First delete of a given conversation always worked (pure INSERT path,
-- covered by the insert policy); only the second one hit this.
--
-- Safe to run more than once -- the policy is dropped and recreated.

drop policy if exists job_conversation_hides_update on job_conversation_hides;
create policy job_conversation_hides_update on job_conversation_hides
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
