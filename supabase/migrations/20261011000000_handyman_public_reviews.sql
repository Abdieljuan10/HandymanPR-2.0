-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Reviewer FIRST names on a handyman's public profile, client's call
-- 2026-09-23: first name only, never the last name, never a link to the
-- reviewer's profile.
--
-- Why a function and not an app-side query: reviews.author_id has no
-- foreign key, and client_profiles only stores full_name. Doing it in the
-- app would mean downloading each reviewer's FULL name to the device and
-- splitting it there -- the last name would still be sitting in the
-- network response for anyone to read. Here the split happens server-side,
-- so only the first name ever leaves the database.
--
-- Returns exactly what the profile shows and nothing more: published
-- reviews written BY CLIENTS ABOUT this handyman (published_at filtered
-- here too -- reviews_select would otherwise still let an author see their
-- own unpublished review), plus the author's first name. No author_id, no
-- job_id -- nothing that could be used to find the reviewer's profile or
-- the job.
--
-- Security definer because it reads client_profiles on the caller's
-- behalf; the body is the only scope, so it's kept to the fields above.
-- Execute is revoked from anon/public: functions are callable by everyone
-- by default, and the anon key ships in the app bundle -- without the
-- revoke, a signed-out caller could read what reviews_select (authenticated
-- only) never gave them.
--
-- Safe to run more than once -- create-or-replace, grants are idempotent.

create or replace function handyman_public_reviews(p_handyman_id uuid)
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
    nullif(split_part(btrim(c.full_name), ' ', 1), '') as author_first_name
  from reviews r
  left join client_profiles c on c.id = r.author_id
  where auth.uid() is not null
    and r.subject_id = p_handyman_id
    and r.author_role = 'client'
    and r.published_at is not null
  order by r.published_at desc;
$$;

revoke all on function handyman_public_reviews(uuid) from public, anon;
grant execute on function handyman_public_reviews(uuid) to authenticated;
