-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run, BY ITSELF.
--
-- This file must be run alone, in its own script, before
-- 20260927000001_mutual_job_completion.sql. Pasting both into the same
-- SQL Editor query box (or any single script with other statements after
-- this one) will fail: Supabase's SQL Editor sends a whole pasted script
-- as one implicit transaction, and `alter type ... add value` cannot
-- commit inside a transaction block alongside other statements -- it
-- aborts the entire transaction, silently rolling back everything else in
-- the same paste, including this line itself. See CLAUDE.md for the
-- general rule.
--
-- Safe to run more than once -- the add is guarded.

alter type job_status add value if not exists 'pending_completion';
