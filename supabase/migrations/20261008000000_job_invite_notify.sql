-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Direct invites ("Invite to quote" from a handyman's public profile).
-- jobs.visibility = 'invite_only' + invited_handyman_id have existed and
-- been enforced since the initial schema (jobs_select RLS, the bid-insert
-- guard) -- the only missing server piece is telling the invited handyman.
-- Every existing new-job push (notify_subscribed_new_job,
-- notify_free_tier_new_jobs, renew_job) deliberately skips invite-only
-- jobs, so without this an invite arrives silently in the feed.
--
-- Separate trigger rather than another branch in notify_subscribed_new_job:
-- that function's body has been rewritten by several migrations already,
-- and this doesn't depend on subscription status at all (an invite goes to
-- the one handyman the client picked, subscribed or not).
--
-- Fires when an invite-only job is posted, and when an expired one is
-- renewed (renew_job() sets status back to 'open' but only notifies for
-- public jobs). Not on hired -> open (cancel_hired_job reopening): the
-- invited handyman is the one who was just hired, so that's not news.
--
-- data carries job_id, so the app deep-links to the job with no app change
-- (see getNotificationDeepLink in src/lib/push-notifications.ts).
--
-- Safe to run more than once -- function is create-or-replace, trigger is
-- dropped and recreated.

create or replace function notify_invited_handyman()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'invite_only'
    and new.status = 'open'
    and (tg_op = 'INSERT' or old.status = 'expired')
  then
    perform send_push_to_users(
      array[new.invited_handyman_id],
      'Te invitaron a cotizar',
      new.title,
      'You''ve been invited to quote',
      new.title,
      jsonb_build_object('type', 'job_invite', 'job_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_invited_handyman on jobs;
create trigger trg_notify_invited_handyman
after insert or update of status on jobs
for each row execute function notify_invited_handyman();
