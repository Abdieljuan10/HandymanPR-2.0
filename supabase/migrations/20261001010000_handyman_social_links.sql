-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Optional Instagram/Facebook links on a handyman's profile. Many already
-- have a business page with years of work on it -- linking it is far
-- cheaper than making them re-upload a portfolio from scratch.
--
-- No RLS change needed: handyman_profiles_update already lets a handyman
-- update any column on their own row (id = auth.uid()), the same policy
-- that already covers bio/years_experience/avatar_url.

alter table handyman_profiles add column if not exists instagram_url text;
alter table handyman_profiles add column if not exists facebook_url text;
