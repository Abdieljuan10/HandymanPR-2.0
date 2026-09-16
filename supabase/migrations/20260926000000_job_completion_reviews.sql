-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Job completion + blind reviews, the last piece of the roadmap's "job
-- completion + reviews" step.
--
-- Completion: after the agreed date, either side can mark a hired job
-- complete via mark_job_complete() -- no mutual confirmation needed for
-- completion itself (only the date agreement earlier, and the review
-- gating below, are mutual/blind).
--
-- Reviews: both sides write after the job is completed; neither sees the
-- other's review until both have submitted, or a 7-day window closes --
-- then whatever exists publishes. reviews already exists
-- (author/subject resolved server-side via set_review_parties, one review
-- per job per role) -- this migration adds the publish gating that was
-- missing (it used to publish immediately on insert).
--
-- Safe to run more than once -- column adds are guarded, the policy is
-- dropped and recreated, every function is create-or-replace, and the
-- cron schedule is dropped and recreated.

alter table jobs add column if not exists completed_at timestamptz;
alter table reviews add column if not exists published_at timestamptz;

-- ============================================================
-- Mark complete
-- ============================================================

create or replace function mark_job_complete(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
  v_other_party uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'hired' then
    raise exception 'This job is not currently hired.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() = v_job.client_id then
    v_other_party := v_handyman_id;
  elsif auth.uid() = v_handyman_id then
    v_other_party := v_job.client_id;
  else
    raise exception 'You are not a party to this job.';
  end if;

  if v_job.agreed_date is null then
    raise exception 'Agree on a job date before marking this complete.';
  end if;

  if current_date < v_job.agreed_date then
    raise exception 'The agreed date hasn''t arrived yet.';
  end if;

  update jobs set status = 'completed', completed_at = now() where id = p_job_id;

  perform send_push_to_users(
    array[v_other_party],
    'Job marked complete',
    '"' || v_job.title || '" was marked complete. You can leave a review now.',
    jsonb_build_object('type', 'job_completed', 'job_id', p_job_id)
  );
end;
$$;

grant execute on function mark_job_complete(uuid) to authenticated;

-- ============================================================
-- Blind reviews: visible once published, or always to your own author.
-- ============================================================

drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select to authenticated using (
  published_at is not null or author_id = auth.uid()
);

-- Both reviews exist for a job -> publish them together.
create or replace function try_publish_job_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from reviews where job_id = new.job_id;

  if v_count >= 2 then
    update reviews set published_at = now() where job_id = new.job_id and published_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_try_publish_job_reviews on reviews;
create trigger trg_try_publish_job_reviews
after insert on reviews
for each row execute function try_publish_job_reviews();

-- 7-day window closed -> publish whatever exists (handles the "only one
-- side ever wrote a review" case). Daily cron, same pattern as the other
-- two schedules in this project.
create or replace function publish_expired_review_windows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update reviews r
  set published_at = now()
  where r.published_at is null
    and exists (
      select 1 from jobs j
      where j.id = r.job_id
        and j.status = 'completed'
        and j.completed_at <= now() - interval '7 days'
    );
end;
$$;

select cron.unschedule('publish-expired-review-windows')
where exists (select 1 from cron.job where jobname = 'publish-expired-review-windows');

select cron.schedule('publish-expired-review-windows', '0 3 * * *', 'select publish_expired_review_windows();');
