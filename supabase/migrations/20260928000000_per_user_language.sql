-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Two related bugs from TODO.md, fixed together:
--
-- 1. Language was device-wide (a single AsyncStorage key), not per-account --
--    changing it on one account changed what the OTHER account on the same
--    device saw too. Fixed on the app side (language-provider.tsx now reads/
--    writes the signed-in user's own profile row) -- this migration adds the
--    column that lives on.
--
-- 2. Every push notification body was hardcoded English regardless of the
--    recipient's language. send_push_to_users() picks the right copy per
--    recipient now, so every call site below passes both an "_es" and "_en"
--    version of its title/body instead of one hardcoded string. Two pushes
--    (new message, new/renewed job) carry user-generated text -- a message
--    body, a job title -- which isn't translated (it's literally what the
--    person typed); only the fixed copy around it (the push title, "New job
--    near you") is localized.
--
-- Safe to run more than once -- the column adds are guarded (and the inline
-- CHECK rides along with the guard, since `add column if not exists` skips
-- the whole clause on a re-run), and every function is create-or-replace.
-- No enum touched here, so -- unlike the mutual-completion migration -- this
-- is fine as a single file/paste; see the standing rule in CLAUDE.md for why
-- that distinction matters.

alter table client_profiles
  add column if not exists language text not null default 'es' check (language in ('es', 'en'));
alter table handyman_profiles
  add column if not exists language text not null default 'es' check (language in ('es', 'en'));

-- ============================================================
-- Per-recipient language lookup. A user is a client XOR a handyman, never
-- both, so at most one of these two subqueries returns a row; the final
-- coalesce is just a safety net (e.g. an orphaned push_tokens row) rather
-- than something that should ever actually apply given both columns are
-- NOT NULL DEFAULT 'es'.
-- ============================================================

create or replace function get_user_language(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select language from client_profiles where id = p_user_id),
    (select language from handyman_profiles where id = p_user_id),
    'es'
  );
$$;

-- ============================================================
-- Core sender -- now takes both a Spanish and an English title/body and
-- picks per-recipient based on get_user_language(). Old 4-arg signature
-- dropped since every caller below moves to the new one in this same file.
-- ============================================================

drop function if exists send_push_to_users(uuid[], text, text, jsonb);

create or replace function send_push_to_users(
  p_user_ids uuid[],
  p_title_es text,
  p_body_es text,
  p_title_en text,
  p_body_en text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages jsonb;
begin
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'to', pt.expo_push_token,
      'title', case when ul.language = 'en' then p_title_en else p_title_es end,
      'body', case when ul.language = 'en' then p_body_en else p_body_es end,
      'data', p_data
    )),
    '[]'::jsonb
  )
  into v_messages
  from push_tokens pt
  cross join lateral (select get_user_language(pt.user_id) as language) ul
  where pt.user_id = any(p_user_ids);

  if jsonb_array_length(v_messages) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := v_messages
  );
end;
$$;

-- ============================================================
-- 1. New bid -> notify the client.
-- ============================================================

create or replace function notify_client_new_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_name text;
begin
  select * into v_job from jobs where id = new.job_id;
  select full_name into v_handyman_name from handyman_profiles where id = new.handyman_id;

  perform send_push_to_users(
    array[v_job.client_id],
    'Nueva oferta en tu trabajo',
    coalesce(v_handyman_name, 'Un técnico') || ' ofertó $' || new.price::text || ' en "' || v_job.title || '"',
    'New bid on your job',
    coalesce(v_handyman_name, 'A handyman') || ' bid $' || new.price::text || ' on "' || v_job.title || '"',
    jsonb_build_object('type', 'new_bid', 'job_id', v_job.id)
  );
  return new;
end;
$$;

-- ============================================================
-- 2. Bid accepted/rejected -> notify the handyman.
-- ============================================================

create or replace function notify_handyman_bid_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_title text;
begin
  if new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
    select title into v_job_title from jobs where id = new.job_id;

    perform send_push_to_users(
      array[new.handyman_id],
      case when new.status = 'accepted' then '¡Oferta aceptada!' else 'Actualización de oferta' end,
      case
        when new.status = 'accepted' then 'Conseguiste el trabajo: "' || v_job_title || '"'
        else 'Tu oferta en "' || v_job_title || '" no fue seleccionada.'
      end,
      case when new.status = 'accepted' then 'Bid accepted!' else 'Bid update' end,
      case
        when new.status = 'accepted' then 'You got the job: "' || v_job_title || '"'
        else 'Your bid on "' || v_job_title || '" wasn''t selected.'
      end,
      jsonb_build_object('type', 'bid_status', 'job_id', new.job_id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

-- ============================================================
-- 3. New message -> notify whichever party didn't send it. The push body IS
-- the message text -- not translated, it's literally what the sender typed.
-- Only the fallback title (used when the sender has no name set) differs by
-- recipient language.
-- ============================================================

create or replace function notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv job_conversations%rowtype;
  v_recipient uuid;
  v_sender_name text;
  v_body text;
begin
  select * into v_conv from job_conversations where id = new.conversation_id;

  if new.sender_id = v_conv.client_id then
    v_recipient := v_conv.handyman_id;
    select full_name into v_sender_name from client_profiles where id = v_conv.client_id;
  else
    v_recipient := v_conv.client_id;
    select full_name into v_sender_name from handyman_profiles where id = v_conv.handyman_id;
  end if;

  v_body := left(new.body, 120);

  perform send_push_to_users(
    array[v_recipient],
    coalesce(v_sender_name, 'Nuevo mensaje'),
    v_body,
    coalesce(v_sender_name, 'New message'),
    v_body,
    jsonb_build_object('type', 'new_message', 'conversation_id', new.conversation_id)
  );
  return new;
end;
$$;

-- ============================================================
-- 4. New job posted -> notify matching handymen. The push body is the job's
-- own title -- not translated, it's whatever the client typed. Only the
-- fixed "New job near you" copy is localized.
-- ============================================================

create or replace function notify_subscribed_new_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handyman_ids uuid[];
begin
  if new.status = 'open' and new.visibility = 'public' then
    select coalesce(array_agg(distinct hp.handyman_id), array[]::uuid[])
    into v_handyman_ids
    from handyman_pueblos hp
    join handyman_trades ht on ht.handyman_id = hp.handyman_id
    join handyman_profiles h on h.id = hp.handyman_id
    where hp.pueblo_id = new.pueblo_id
      and ht.trade_id = new.trade_id
      and h.is_subscribed
      and (h.subscription_expires_at is null or h.subscription_expires_at > now());

    if array_length(v_handyman_ids, 1) > 0 then
      perform send_push_to_users(
        v_handyman_ids,
        'Nuevo trabajo cerca de ti',
        new.title,
        'New job near you',
        new.title,
        jsonb_build_object('type', 'new_job', 'job_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function notify_free_tier_new_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_handyman_ids uuid[];
begin
  for v_job in
    select * from jobs
    where status = 'open'
      and visibility = 'public'
      and visible_to_free_at <= now()
      and free_tier_notified_at is null
  loop
    select coalesce(array_agg(distinct hp.handyman_id), array[]::uuid[])
    into v_handyman_ids
    from handyman_pueblos hp
    join handyman_trades ht on ht.handyman_id = hp.handyman_id
    join handyman_profiles h on h.id = hp.handyman_id
    where hp.pueblo_id = v_job.pueblo_id
      and ht.trade_id = v_job.trade_id
      and not (h.is_subscribed and (h.subscription_expires_at is null or h.subscription_expires_at > now()));

    if array_length(v_handyman_ids, 1) > 0 then
      perform send_push_to_users(
        v_handyman_ids,
        'Nuevo trabajo cerca de ti',
        v_job.title,
        'New job near you',
        v_job.title,
        jsonb_build_object('type', 'new_job', 'job_id', v_job.id)
      );
    end if;

    update jobs set free_tier_notified_at = now() where id = v_job.id;
  end loop;
end;
$$;

-- ============================================================
-- 5. Job expiry (client) and renewal (handymen).
-- ============================================================

create or replace function expire_stale_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
begin
  for v_job in
    select * from jobs
    where status = 'open'
      and expires_at <= now()
  loop
    update jobs set status = 'expired' where id = v_job.id;

    perform send_push_to_users(
      array[v_job.client_id],
      'Tu publicación expiró',
      '"' || v_job.title || '" no recibió ofertas en 21 días. Añadir fotos o más detalles suele ayudar — renuévalo desde la pantalla del trabajo cuando quieras.',
      'Your job listing expired',
      '"' || v_job.title || '" got no bids in 21 days. Adding photos or more detail often helps -- renew it from the job screen when you''re ready.',
      jsonb_build_object('type', 'job_expired', 'job_id', v_job.id)
    );
  end loop;
end;
$$;

create or replace function renew_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_ids uuid[];
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.client_id <> auth.uid() then
    raise exception 'Only the client who posted this job can renew it.';
  end if;
  if v_job.status <> 'expired' then
    raise exception 'Only an expired job can be renewed.';
  end if;

  update jobs
  set status = 'open',
      expires_at = now() + interval '21 days',
      visible_to_free_at = now() + interval '15 minutes',
      free_tier_notified_at = null
  where id = p_job_id;

  if v_job.visibility = 'public' then
    select coalesce(array_agg(distinct hp.handyman_id), array[]::uuid[])
    into v_handyman_ids
    from handyman_pueblos hp
    join handyman_trades ht on ht.handyman_id = hp.handyman_id
    join handyman_profiles h on h.id = hp.handyman_id
    where hp.pueblo_id = v_job.pueblo_id
      and ht.trade_id = v_job.trade_id
      and h.is_subscribed
      and (h.subscription_expires_at is null or h.subscription_expires_at > now());

    if array_length(v_handyman_ids, 1) > 0 then
      perform send_push_to_users(
        v_handyman_ids,
        'Trabajo renovado cerca de ti',
        v_job.title,
        'Job renewed near you',
        v_job.title,
        jsonb_build_object('type', 'new_job', 'job_id', v_job.id)
      );
    end if;
  end if;
end;
$$;

-- ============================================================
-- 6. Cancellation -> notify the other party.
-- ============================================================

create or replace function cancel_hired_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
  v_role account_role;
  v_other_party uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'hired' then
    raise exception 'This job is not currently hired.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() = v_job.client_id then
    v_role := 'client';
    v_other_party := v_handyman_id;
  elsif auth.uid() = v_handyman_id then
    v_role := 'handyman';
    v_other_party := v_job.client_id;
  else
    raise exception 'You are not a party to this job.';
  end if;

  update jobs
  set status = 'open',
      hired_bid_id = null,
      agreed_date = null,
      proposed_date = null,
      proposed_by = null
  where id = p_job_id;

  perform set_config('app.cancelling_job', 'true', true);
  update bids set status = 'cancelled' where id = v_job.hired_bid_id;

  insert into job_cancellations (job_id, cancelled_by_role, cancelled_by_id)
  values (p_job_id, v_role, auth.uid());

  perform send_push_to_users(
    array[v_other_party],
    'Trabajo cancelado',
    '"' || v_job.title || '" fue cancelado y está abierto de nuevo.',
    'Job cancelled',
    '"' || v_job.title || '" was cancelled and is open again.',
    jsonb_build_object('type', 'job_cancelled', 'job_id', p_job_id)
  );
end;
$$;

-- ============================================================
-- 7. Agreed date: proposed -> the other party; confirmed -> both parties.
-- Spanish date rendered manually (day "de" month "de" year) rather than via
-- to_char's locale-dependent month names, which would depend on a Spanish
-- locale actually being installed on Supabase's Postgres image.
-- ============================================================

create or replace function notify_job_date_proposed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handyman_id uuid;
  v_recipient uuid;
begin
  if new.proposed_date is distinct from old.proposed_date and new.proposed_date is not null then
    select handyman_id into v_handyman_id from bids where id = new.hired_bid_id;
    v_recipient := case when new.proposed_by = new.client_id then v_handyman_id else new.client_id end;

    perform send_push_to_users(
      array[v_recipient],
      'Fecha de trabajo propuesta',
      'Se propuso una fecha para "' || new.title || '". Abre el trabajo para confirmar.',
      'Job date proposed',
      'A date was proposed for "' || new.title || '". Open the job to confirm.',
      jsonb_build_object('type', 'job_date_proposed', 'job_id', new.id)
    );
  end if;
  return new;
end;
$$;

create or replace function notify_job_date_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handyman_id uuid;
  v_spanish_date text;
begin
  if new.agreed_date is distinct from old.agreed_date and new.agreed_date is not null then
    select handyman_id into v_handyman_id from bids where id = new.hired_bid_id;

    v_spanish_date := extract(day from new.agreed_date)::int::text || ' de ' || (case extract(month from new.agreed_date)
      when 1 then 'enero' when 2 then 'febrero' when 3 then 'marzo' when 4 then 'abril'
      when 5 then 'mayo' when 6 then 'junio' when 7 then 'julio' when 8 then 'agosto'
      when 9 then 'septiembre' when 10 then 'octubre' when 11 then 'noviembre' else 'diciembre'
    end) || ' de ' || extract(year from new.agreed_date)::int::text;

    perform send_push_to_users(
      array[new.client_id, v_handyman_id],
      'Fecha de trabajo confirmada',
      '"' || new.title || '" quedó acordado para el ' || v_spanish_date || '.',
      'Job date confirmed',
      '"' || new.title || '" is agreed for ' || to_char(new.agreed_date, 'Mon DD, YYYY') || '.',
      jsonb_build_object('type', 'job_date_confirmed', 'job_id', new.id)
    );
  end if;
  return new;
end;
$$;

-- ============================================================
-- 8. Mutual completion: pending -> the other party; confirmed -> whoever
-- marked it; disputed -> whoever marked it; undone -> the other party;
-- auto-confirmed -> both parties.
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

  update jobs
  set status = 'pending_completion',
      completion_marked_by = auth.uid(),
      completion_marked_at = now()
  where id = p_job_id;

  perform send_push_to_users(
    array[v_other_party],
    'Confirma la finalización del trabajo',
    '"' || v_job.title || '" fue marcado como completado. Confírmalo o disputa en la app.',
    'Confirm job completion',
    '"' || v_job.title || '" was marked complete -- confirm or dispute it in the app.',
    jsonb_build_object('type', 'job_completion_pending', 'job_id', p_job_id)
  );
end;
$$;

create or replace function confirm_job_completion(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'pending_completion' then
    raise exception 'This job has no pending completion to confirm.';
  end if;

  if v_job.completion_marked_by = auth.uid() then
    raise exception 'The other side needs to confirm this -- you marked it complete.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() <> v_job.client_id and auth.uid() <> v_handyman_id then
    raise exception 'You are not a party to this job.';
  end if;

  update jobs set status = 'completed', completed_at = now() where id = p_job_id;

  perform send_push_to_users(
    array[v_job.completion_marked_by],
    'Finalización confirmada',
    'Se confirmó la finalización de "' || v_job.title || '". Ya puedes dejar una reseña.',
    'Completion confirmed',
    '"' || v_job.title || '" completion was confirmed. You can leave a review now.',
    jsonb_build_object('type', 'job_completed', 'job_id', p_job_id)
  );
end;
$$;

create or replace function dispute_job_completion(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_handyman_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;

  if v_job.status <> 'pending_completion' then
    raise exception 'This job has no pending completion to dispute.';
  end if;

  if v_job.completion_marked_by = auth.uid() then
    raise exception 'You marked this complete -- use undo instead of dispute.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

  if auth.uid() <> v_job.client_id and auth.uid() <> v_handyman_id then
    raise exception 'You are not a party to this job.';
  end if;

  update jobs
  set status = 'hired',
      completion_marked_by = null,
      completion_marked_at = null
  where id = p_job_id;

  perform send_push_to_users(
    array[v_job.completion_marked_by],
    'Finalización disputada',
    'La otra parte disputó que "' || v_job.title || '" esté completado.',
    'Completion disputed',
    'The other side disputed marking "' || v_job.title || '" complete.',
    jsonb_build_object('type', 'job_completion_disputed', 'job_id', p_job_id)
  );
end;
$$;

create or replace function undo_job_completion(p_job_id uuid)
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

  if v_job.status <> 'pending_completion' then
    raise exception 'This job has no pending completion to undo.';
  end if;

  if v_job.completion_marked_by <> auth.uid() then
    raise exception 'Only the person who marked this complete can undo it.';
  end if;

  select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;
  v_other_party := case when auth.uid() = v_job.client_id then v_handyman_id else v_job.client_id end;

  update jobs
  set status = 'hired',
      completion_marked_by = null,
      completion_marked_at = null
  where id = p_job_id;

  perform send_push_to_users(
    array[v_other_party],
    'Finalización deshecha',
    'Se deshizo la marca de completado de "' || v_job.title || '".',
    'Completion undone',
    '"' || v_job.title || '" completion mark was undone.',
    jsonb_build_object('type', 'job_completion_undone', 'job_id', p_job_id)
  );
end;
$$;

create or replace function auto_confirm_stale_completions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_handyman_id uuid;
begin
  for v_job in
    select * from jobs
    where status = 'pending_completion'
      and completion_marked_at <= now() - interval '7 days'
  loop
    update jobs set status = 'completed', completed_at = now() where id = v_job.id;

    select handyman_id into v_handyman_id from bids where id = v_job.hired_bid_id;

    perform send_push_to_users(
      array[v_job.client_id, v_handyman_id],
      'Trabajo confirmado automáticamente',
      '"' || v_job.title || '" se confirmó como completado automáticamente después de 7 días. Ya puedes dejar una reseña.',
      'Job auto-confirmed complete',
      '"' || v_job.title || '" was automatically confirmed complete after 7 days. You can leave a review now.',
      jsonb_build_object('type', 'job_completed', 'job_id', v_job.id)
    );
  end loop;
end;
$$;
