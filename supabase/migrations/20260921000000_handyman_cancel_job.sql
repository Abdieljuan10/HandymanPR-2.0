-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- The client could already cancel a hired job (jobs_update policy, gated to
-- client_id = auth.uid()), but the hired handyman had no way out at all —
-- the jobs_update policy never granted them write access. A plain RLS
-- policy widening "who can update jobs" is the wrong shape here: it would
-- let a handyman touch any column, not just flip status to cancelled from
-- exactly the hired state. A SECURITY DEFINER function scoped to that one
-- transition is the same pattern as auth_owns_job/auth_has_bid_on_job in
-- 20260917000000_fix_jobs_bids_rls_recursion.sql.
--
-- Safe to run more than once — replaces the function each time.

create or replace function cancel_job_as_handyman(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from jobs j
    join bids b on b.id = j.hired_bid_id
    where j.id = p_job_id
      and j.status = 'hired'
      and b.handyman_id = auth.uid()
  ) then
    raise exception 'Job is not hired, or you are not the hired handyman for it';
  end if;

  update jobs set status = 'cancelled' where id = p_job_id;
end;
$$;

grant execute on function cancel_job_as_handyman(uuid) to authenticated;
