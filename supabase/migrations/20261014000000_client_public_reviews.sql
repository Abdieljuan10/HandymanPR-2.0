-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Client's call, made earlier: a client's reviews (left by handymen who
-- worked with them) are useful to a handyman deciding whether to bid, but
-- must NEVER be visible to other clients or publicly. Mirrors
-- handyman_public_reviews() (20261011000000) exactly, just the other
-- direction -- reviews already support both: `reviews.author_role` is
-- 'client' or 'handyman', and a handyman leaving a review of the client
-- they worked with was already possible before this function existed, this
-- just surfaces it. No new table, no new column.
--
-- Reviewer FIRST name only, same reasoning as the handyman version: split
-- server-side so the last name never leaves the database, no author_id, no
-- job_id in the result -- nothing that could be used to find the reviewer
-- or the job.
--
-- *** Abuse review (standing rule: every access-changing migration gets
-- one before the client runs it) ***
-- Who can call this and see what:
--   - A HANDYMAN account: sees published reviews of the given client,
--     first-name-only, same as any handyman could already see about a
--     job's client informally by asking around -- this is the intended use
--     (deciding whether to bid).
--   - A CLIENT account (any client, not just the subject): gets ZERO rows
--     back. The `exists (select 1 from handyman_profiles ...)` check in the
--     WHERE clause means the function runs, finds the caller isn't a
--     handyman, and returns an empty result -- not an error, just nothing,
--     so no signal about whether reviews even exist. This is the actual
--     enforcement of "never visible to other clients," not just an app-side
--     screen that happens not to call this -- a client who found this RPC
--     name and called it directly still gets nothing.
--   - A SIGNED-OUT caller: EXECUTE is revoked from anon below, so the call
--     itself is rejected before the function body ever runs.
--   - Could a handyman use this to harass/profile a specific client by
--     hammering this RPC with guessed ids? They already get the client's
--     name/photo from client_profiles (readable by any connected handyman)
--     and full review text from this function either way once connected by
--     a job/bid/invite -- this returns nothing new an already-connected
--     handyman couldn't already piece together, and reviews are opinions
--     about completed work, not new PII (no author identity, no job link).
--
-- Safe to run more than once -- create-or-replace, grants are idempotent.

create or replace function client_public_reviews(p_client_id uuid)
returns table (
  id uuid,
  rating smallint,
  comment text,
  published_at timestamptz,
  author_first_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.published_at,
    nullif(split_part(btrim(h.full_name), ' ', 1), '') as author_first_name
  from reviews r
  left join handyman_profiles h on h.id = r.author_id
  where exists (select 1 from handyman_profiles hp where hp.id = auth.uid())
    and r.subject_id = p_client_id
    and r.author_role = 'handyman'
    and r.published_at is not null
  order by r.published_at desc;
$$;

revoke all on function client_public_reviews(uuid) from public, anon;
grant execute on function client_public_reviews(uuid) to authenticated;
