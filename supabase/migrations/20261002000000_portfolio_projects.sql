-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Reworks the flat portfolio-photos list into projects: a project has a
-- title, optional description/trade/pueblo, and up to ~15 photos (enforced
-- app-side, same convention as MAX_JOB_PHOTOS -- no DB constraint). Client's
-- reasoning: "30 loose photos tell a client nothing... 'I built this house,
-- here are 30 photos' is evidence they can judge," and it gives handymen a
-- reason to describe their work, which helps them win bids.
--
-- Migrates any existing loose photos into one default "Portafolio" project
-- per handyman who has them, before the new project_id column is made
-- required, so nothing already uploaded is orphaned or lost. On this
-- project (still pre-pilot), this almost certainly affects zero rows, but
-- it's free to do correctly regardless.
--
-- Storage is untouched: photos still live at
-- portfolio-photos/{handyman_id}/{filename}, same bucket, same policies
-- (just reconfirmed working in 20261001000000) -- project grouping is a
-- DB-only concept, the object path doesn't need to know about it.

create table handyman_portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references handyman_profiles(id) on delete cascade,
  title text not null,
  description text,
  trade_id smallint references trades(id),
  pueblo_id smallint references pueblos(id),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index idx_handyman_portfolio_projects_handyman on handyman_portfolio_projects(handyman_id);

alter table handyman_portfolio_projects enable row level security;

-- Public/browsable, same reasoning as the profile itself and the old flat
-- photos table -- a client needs to see a handyman's projects to judge them.
create policy handyman_portfolio_projects_select on handyman_portfolio_projects
  for select to authenticated using (true);
create policy handyman_portfolio_projects_write on handyman_portfolio_projects
  for all to authenticated
  using (handyman_id = auth.uid())
  with check (handyman_id = auth.uid());

-- Data migration: one default project per handyman with existing loose
-- photos, so the not-null column change below can't orphan anything.
insert into handyman_portfolio_projects (handyman_id, title)
select distinct handyman_id, 'Portafolio'
from handyman_portfolio_photos;

alter table handyman_portfolio_photos
  add column project_id uuid references handyman_portfolio_projects(id) on delete cascade;

update handyman_portfolio_photos p
set project_id = pr.id
from handyman_portfolio_projects pr
where pr.handyman_id = p.handyman_id and pr.title = 'Portafolio';

-- Old policies reference handyman_id directly, which is about to be
-- dropped -- must go before the column does.
drop policy if exists handyman_portfolio_photos_select on handyman_portfolio_photos;
drop policy if exists handyman_portfolio_photos_write on handyman_portfolio_photos;

alter table handyman_portfolio_photos alter column project_id set not null;
alter table handyman_portfolio_photos drop column handyman_id;
-- Never had a UI, nothing to preserve -- the new optional description
-- lives on the project instead, one per project rather than per photo.
alter table handyman_portfolio_photos drop column caption;

-- Ownership now goes through the parent project, same shape as
-- job_photos_write's ownership-via-parent-job pattern.
create policy handyman_portfolio_photos_select on handyman_portfolio_photos
  for select to authenticated using (
    exists (select 1 from handyman_portfolio_projects p where p.id = project_id)
  );
create policy handyman_portfolio_photos_write on handyman_portfolio_photos
  for all to authenticated
  using (
    exists (select 1 from handyman_portfolio_projects p where p.id = project_id and p.handyman_id = auth.uid())
  )
  with check (
    exists (select 1 from handyman_portfolio_projects p where p.id = project_id and p.handyman_id = auth.uid())
  );
