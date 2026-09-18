# Roadmap

Order set by the client (2026-09-15): **push notifications → chat → job
completion + reviews → scheduling → portfolio/certs/subscriptions → visual
polish.** Chat and push notifications are both done now (see below).

**Job completion + reviews, refined 2026-09-16**: client wants a *minimal*
agreed-date field (not full scheduling — see "Then: agreed date" below),
job expiry done first, cancellation's dead-end gap finished alongside it,
then completion + blind reviews. Working through it in four phases:
1. Job expiry — **DONE, confirmed end-to-end on 2026-09-16** (expired,
   pushed, showed Renew button, renewed back to open) — see below.
2. Finish cancellation (return to open + per-account record) — **DONE,
   confirmed end-to-end on 2026-09-16** (reopened to Open, bid shows
   Cancelled, notification arrived, cancellation logged, a new bid could be
   placed on the reopened job) — see below.
3. Mutual agreed date — **DONE, confirmed end-to-end on 2026-09-16**
   (propose, confirm, counter-propose, notifications both directions,
   proposer correctly can't confirm their own date) — see below.
4. Job completion + blind reviews — **DONE, confirmed end-to-end on
   2026-09-17** (mark complete, confirm, dispute, undo all correct; blind
   reviews confirmed — client sees their own review, "esperando a la otra
   parte," not the other side's). Only the 7-day one-sided review
   force-publish (`publish_expired_review_windows()`) is still untested —
   client testing that themselves directly in Supabase — see below.

**Next, in priority order (set by the client 2026-09-17)** — see
"## Next up" below: ~~notification deep-linking~~ (**DONE, confirmed
end-to-end 2026-09-17**), branded Supabase signup email, ~~per-user
language + bilingual notifications~~ (**per-account persistence confirmed
on-device 2026-09-18, bilingual push copy not separately confirmed yet —
jumped ahead of the signup-email item to fill EAS build queue time**),
unread badge on Messages, auth basics
(show-password/confirm-password/change-password), tap-to-view job photos.

There's also an open bug report (date-proposal identity mixup, awaiting a
fresh repro from the client) and a parked audit item (every Supabase query
for swallowed errors) — both detailed further down.

Whoever picks up a session on this repo: read this file first, and update it
— move finished items to "Done", adjust anything that changed shape — before
committing at the end of your session. See the instruction in `CLAUDE.md`.

## Push notifications — DONE, confirmed end-to-end on 2026-09-16

The app's core retention hook — a handyman getting pinged about a job in
their pueblo. Needs a **development build** (push doesn't work in Expo Go).

**Status as of 2026-09-15 — resume here:**

- [x] `push_tokens` table migration written AND run by the client
      (`20260920000000_push_tokens.sql`) — `user_id` + `device_id` (a device
      can have more than one), RLS'd to the owning user.
- [x] `registerForPushNotifications()` in `src/lib/push-notifications.ts` —
      requests permission, gets the Expo push token, upserts it. No-ops on
      Expo Go / simulator / before an EAS project is linked / if permission
      is declined.
- [x] Wired into `session-provider.tsx`, fires after session resolves.
- [x] Root layout (`_layout.tsx`) sets the foreground notification handler.
- [x] **Fixed a real crash** (not just theoretical Expo Go incompatibility):
      `expo-notifications`' native module was removed from Expo Go on
      Android in SDK 53, and it throws from being *imported* at all, not
      just from being called — a plain `isExpoGo` guard around the function
      call wasn't enough because the top-level `import` ran first. Fixed by
      switching both `_layout.tsx` and `push-notifications.ts` to a deferred
      `require('expo-notifications')` inside the `if (!isExpoGo)` branch, so
      the module is never loaded at all in Expo Go. Pushed as `4e59526`.
      **Client needs to reload the app in Expo Go and confirm this actually
      fixed it** — I verified the bundle compiles clean but couldn't run it
      on a device from here.
- [x] `app.json`: `expo-notifications` plugin added, `android.package` /
      `ios.bundleIdentifier` set to `com.abdieljuan.handymanpr` (EAS build
      requires both, neither existed before).
- [x] Installed `expo-notifications`, `expo-device`, `eas-cli` (dev dep).
- [x] `eas login` / `eas init` done — project linked
      (`extra.eas.projectId` = `4013c550-44a7-4733-aa20-8b247cc8b972` in
      `app.json`), `eas.json` Android `development` profile configured,
      `expo-dev-client` installed. Pushed as `fd1a8b4`.
- [x] First **three** build attempts all failed with the same `npm ci`
      error: `Missing: typescript@5.9.3 from lock file`. First guess
      (that `fd1a8b4` already fixed a lockfile/package.json desync) was
      **wrong** — `npm install --package-lock-only` gives a false pass
      because npm 11 (local) tolerates this gap; only `npm ci` under
      npm 10 reproduces it. Real root cause: `@expo/config` (transitive)
      declares an *optional* peerDependency on `typescript ^5.0.0`, not
      satisfied by our top-level `~6.0.3` — npm needs a nested
      `typescript@5.9.3` to cover it, and the committed lockfile never
      had that nested entry. Fixed in `2e391ac` by regenerating
      `package-lock.json` from scratch with npm 10 and verifying `npm ci`
      passes under both npm 10 and npm 11 *before* triggering a build
      (each attempt costs 25+ min in queue — don't guess next time,
      always pull the actual build log and reproduce locally first).
- [x] Found and removed an unwanted `android.permission.RECORD_AUDIO` entry
      that `eas init` had added to `app.json` — the app only calls
      `launchImageLibraryAsync({ mediaTypes: ['images'] })`, no camera/video
      capture, no `expo-av`/`expo-camera` installed, and
      `expo-image-picker`'s own `AndroidManifest.xml` only requires
      `CAMERA` + legacy storage permissions, not audio. Pushed as `f3ce32a`.
      A handyman app asking for microphone access at the install prompt
      looked bad to the client. **Confirmed working** — client tested the
      photo picker on the dev build after this landed, no regression.
- [x] Build `cfdbf5fe-7f24-4dc2-8923-aabad58814a3` finished successfully —
      APK installed and ran on a physical Android device via a tunnel
      (`expo start --dev-client --tunnel`, needed `@expo/ngrok` installed
      as a dev dep since the client was on cellular, not the same Wi-Fi).
- [x] Client tested on two Android devices: chat, My Bids, Your Jobs, and
      the photo picker (post-RECORD_AUDIO-removal) all confirmed working.
      **Push notifications confirmed NOT working** — tested 4 jobs across
      subscribed/unsubscribed, foreground/background, two devices. Root
      cause confirmed: **the sending half never existed** — no Edge
      Function, no trigger, nothing ever called Expo's push API. Only the
      registration half (`push_tokens` table + `registerForPushNotifications`)
      was built. Built the sending half in `ea5cc41` — see below.
- [x] **Sending half built** (`ea5cc41`,
      `20260922000000_push_notifications_send.sql`) — sends go straight
      from Postgres via `pg_net` rather than a deployed Edge Function (no
      Supabase CLI auth set up here, and every other schema change ships
      by hand through the SQL Editor already). Four triggers: new bid ->
      notify client, bid accepted/rejected -> notify handyman, new message
      -> notify the other party, new job posted -> notify matching
      handymen (subscribed immediately, free-tier via a once-a-minute
      `pg_cron` job once the 15-minute `visible_to_free_at` head start
      passes). Client enabled `pg_net`/`pg_cron` via the dashboard and ran
      the migration — confirmed via `select jobname from cron.job`.
- [x] `push_tokens` was empty even after granting permission and logging
      in on both devices. Root cause: `registerForPushNotifications(...)
      .catch(() => {})` at both call sites in `session-provider.tsx` was
      swallowing every thrown error, including ones thrown *before* the
      function ever reached the upsert (where a separate, earlier fix
      already logged upsert-specific errors) — so a hard failure inside
      `getExpoPushTokenAsync()` was completely invisible. Fixed in
      `068f0a6` to log via `console.error`, which also surfaces as an
      on-device LogBox overlay in a dev build. Next cold start showed the
      real error: `"Unable to get Firebase Messaging instance... Default
      FirebaseApp is not initialized"`.
- [x] **Real root cause: Android push on a non-Expo-Go build requires
      Firebase Cloud Messaging (FCM V1) credentials**, which this EAS
      project never had — confirmed via Expo's own SDK 57 docs. Client
      walked through Firebase Console (created a project, registered
      `com.abdieljuan.handymanpr`, downloaded `google-services.json`) and
      `eas credentials` (uploaded the FCM V1 service account key) —
      `google-services.json` wired into `app.json` and committed in
      `deacc12` (safe to commit, public identifiers only; the service
      account key itself is NOT in the repo, uploaded directly to EAS).
- [x] Two more build attempts after that, both `npm ci` failures with the
      *same* `Missing: typescript@5.9.3 from lock file` bug already fixed
      once in `2e391ac` — turned out my own later `npm install --save-dev
      @expo/ngrok` (`9187c35`) had silently regenerated `package-lock.json`
      under local npm 11 and dropped the nested entry npm 10 needs again.
      Fixed for good (hopefully) in `447da04`. **Lesson for next time**:
      any `package.json` change needs the npm-10 `npm ci` round-trip
      re-verified, not just the first time it's fixed.
- [x] Build `97eb2112-af05-4035-a86c-61c4f0371542` finished clean with
      both fixes. Client installed it, cold-started, no more red error,
      confirmed a row in `push_tokens`, and **received a live "New job
      near you" push notification end to end** on 2026-09-16. All four
      notification types are wired (new bid, bid accepted/rejected, new
      message, new job posted) — only the job-posted one has been
      manually confirmed delivered so far; the other three run the exact
      same `send_push_to_users()` path, so they're expected to work, but
      call it out if one doesn't when actually triggered.
- [ ] Consider a read/unread or "last notified" marker for messages so a
      long conversation doesn't re-notify on every message if the app's in
      foreground already — not in the schema today, not built (deliberately
      deferred, this is a polish item now that the core mechanism works).

## Then: job completion + reviews

- [x] **Job expiry — DONE, confirmed end-to-end on 2026-09-16.** A job with
      no accepted bid expires 21 days after posting (or after a renewal), so
      dead listings don't pile up. `20260923000000_job_expiry.sql` — adds
      `jobs.expires_at` (default now+21 days, backfills existing open jobs),
      adds `'expired'` to `job_status`, an `expire_stale_jobs()` function
      that flips stale jobs and pushes the client, on an hourly `pg_cron`
      schedule. No RLS changes needed — the existing `status = 'open'`
      filters (feed query + `jobs_select` policy) already drop expired jobs
      out for free. Client tested on-device: job expired, push arrived,
      Expired status + Renew button showed, renewing returned it to Open.
      Renew button + `expired` status/section on both job-detail screens and
      the client's Your Jobs list, en/es i18n added.
      **Follow-up after on-device testing** (`20260923010000_job_renewal_notify.sql`,
      not yet run): renewing now also re-notifies matching handymen — not
      just reopens silently — since some may have joined that pueblo/trade
      or started paying attention in the 21 days since the original post.
      This needed a real `renew_job()` RPC (not the plain client-side update
      renewal used at first) because it has to reset the 15-minute
      subscriber head start (`visible_to_free_at`) and clear
      `free_tier_notified_at` so the existing once-a-minute
      `notify_free_tier_new_jobs()` cron picks the job up again for
      free-tier handymen, plus send the immediate subscribed-handyman push
      itself (mirrors `notify_subscribed_new_job()`'s query). Deliberately
      does **not** touch `created_at` — no feed-order boost for a renewed
      job; promoted placement is a paid feature for later, not something
      renewal should give away. Also improved the expiry push copy itself
      to nudge the client toward fixing *why* it got no bids (photos/detail)
      rather than just offering to re-list as-is.
      **Known minor cosmetic issue, deliberately not fixed yet** (client
      called it low priority): on an expired job, the timestamp shown is
      the job's original posting age ("Expired · 22 hours ago") rather than
      when it actually expired. Low-effort fix later — swap
      `formatRelativeTime(job.created_at, ...)` for `expires_at` on the
      expired-status line specifically.
- [x] **Finish cancellation — DONE, confirmed end-to-end on 2026-09-16**
      (job reopened to Open, bid shows Cancelled, notification arrived,
      cancellation logged, a new bid could be placed on the reopened job).
      Either side can cancel a hired job; it now returns to
      `open` (not a dead end) so it's back in the feed for new bids — this
      doubles as "repost," no separate repost flow needed. The cancellation
      is recorded per account privately (not surfaced publicly).
      Replaced `cancel_job_as_handyman()` (both sides used different code
      paths before — client did a plain `.update()`, handyman had its own
      RPC) with one unified `cancel_hired_job()` usable by either party:
      reopens the job, clears `hired_bid_id`, marks the old winning bid
      `'cancelled'` (new `bid_status` value, distinct from `'rejected'`),
      logs to a new `job_cancellations` table (RLS on, zero select
      policies — admin-only via Table Editor, nothing public), and pushes
      the other party. **Ordering note**: this ships before Phase 3 exists,
      so it can't yet clear `agreed_date`/`proposed_date`/`proposed_by` on
      cancel — Phase 3's migration must `create or replace` this same
      function to also clear those columns once they exist.
      Also fixed a real bug this reopen would've hit immediately:
      `enforce_bid_insert`'s bid-cap count used `status <> 'withdrawn'`, so
      old `rejected` bids from before the job was hired would still count
      against `max_bids` once reopened — a job that was already at its cap
      would block every new bid. Fixed to count only `status = 'pending'`.
      **Note**: jobs cancelled under the old dead-end behavior (before this
      migration) stay at `status = 'cancelled'` for good — this doesn't
      retroactively reopen historical data, only changes what happens going
      forward. App side (both job-detail screens, My Bids sections,
      en/es i18n) updated to match; `npx tsc --noEmit` clean.
      **Bug found on-device, fixed (`20260924010000_fix_cancel_bid_guard.sql`,
      not yet run)**: cancelling failed on every job tested, both sides,
      with the withdraw-guard's error message ("You can only withdraw a bid
      that is still pending."). Root cause: `enforce_bid_update()` (a
      `before update` trigger on `bids` from
      `20260918000000_storage_bidding_messaging.sql`) only recognizes
      `pending -> withdrawn`/`accepted`/`rejected` — it fires regardless of
      who owns the calling function (SECURITY DEFINER bypasses RLS, not
      triggers), so `cancel_hired_job()`'s `accepted -> cancelled` update
      always got rejected. Fixed with a transaction-local `set_config` flag
      that only `cancel_hired_job()` sets, rather than widening the
      trigger's allowed transitions generally — widening it would let
      either party update a bid straight to `'cancelled'` via a direct
      client-side `.update()` (existing RLS already permits touching their
      own bid/job's bids), bypassing the job-reopen and
      `job_cancellations` logging entirely. This was caught fast because
      the generic `jobDelete.error` catch-all in both job-detail screens
      (plus `handleDelete`/`handleRenew` on the client side) now appends
      the real Supabase error message instead of hiding it — worth keeping
      that pattern for future RPC error handling in this app.
- [x] **Mutual agreed date — DONE, confirmed end-to-end on 2026-09-16**
      (propose, confirm, counter-propose, notifications both directions,
      proposer correctly can't confirm their own date; the UI already
      distinguishes the agreed date from a pending proposal clearly, no
      fix needed there). Minimal — deliberately NOT full
      scheduling, see "Then: scheduling" below, kept as its own later
      feature by request 2026-09-16. Client proposes a date after hiring,
      handyman confirms; either side can propose a change, the other
      confirms. Mutual by construction — `confirm_job_date()` rejects
      confirming your own proposal — so neither side can set the date
      unilaterally (a handyman delaying to dodge a bad review, or a client
      backdating to review early). `jobs.agreed_date`/`proposed_date`/
      `proposed_by`, plus `propose_job_date()`/`confirm_job_date()` RPCs,
      and push notifications on both propose and confirm. Also finishes the
      ordering note left in Phase 2: `cancel_hired_job()` now clears all
      three columns too, so a stale agreed date can't carry into a fresh
      round of bidding after a cancellation reopens the job.
      Date input is JS-only, per the client's call after the build-queue
      pain earlier this session — a new shared `DateInput` component
      (`src/components/date-input.tsx`, three linked month/day/year
      `FormField`s, validated as a real calendar date), no native
      date-picker dependency, no EAS build needed. A new shared
      `JobDateCard` component (`src/components/job-date-card.tsx`) handles
      the propose/confirm UI and is used by both job-detail screens, shown
      only while `status === 'hired'`. Can upgrade to a native picker later
      during the UI redesign pass if a rebuild is happening anyway — the DB
      side doesn't care how the date was collected.
- [x] **Job completion is mutual, like the agreed date — DONE, confirmed
      end-to-end on 2026-09-17** (mark complete, confirm, dispute, undo all
      correct; blind reviews confirmed — client sees their own review,
      "esperando a la otra parte," not the other side's). Only the 7-day
      one-sided force-publish is still untested (client testing it
      themselves in Supabase). Original version (below) let
      either side mark a job complete alone, which started the review
      window and locked the job with no undo — flagged by the client as a
      real risk (a handyman marking a job done that wasn't, or a client
      tapping it by mistake). Now: one side marks complete
      (`mark_job_complete()`, same eligibility gate as before — hired,
      `agreed_date` set and passed) → job enters a new `'pending_completion'`
      status instead of completing outright → the other side gets a push
      and either confirms (`confirm_job_completion()` → `'completed'`) or
      disputes (`dispute_job_completion()` → back to `'hired'`) → if
      nobody acts for 7 days, `auto_confirm_stale_completions()` (daily
      cron) confirms it anyway. The person who marked it can undo while
      still pending (`undo_job_completion()`), also back to `'hired'`.
      Reviews still only unlock at `status = 'completed'` —
      `set_review_parties` already gates on that exactly, so nothing
      needed there; a review genuinely can't be written during
      `pending_completion`.
      App side: new `CompletionCard` component
      (`src/components/completion-card.tsx`) replaces the old inline
      "Mark Complete" button on both job-detail screens — shows the
      mark-complete gate while hired, or the pending/confirm/dispute/undo
      UI while `status === 'pending_completion'` (which side sees Confirm
      vs. Undo depends on whether `completion_marked_by` is you). Added
      `pending_completion` to every job-status type union and UI spot that
      switches on job status (client Your Jobs sections, handyman My Bids
      job-status union) — it gets its own section on Your Jobs, same
      treatment as `expired`. `npx tsc --noEmit` clean.
      **Migration bug found on-device, fixed**: the first version of this
      migration (`20260927000000_mutual_job_completion.sql`) put
      `alter type job_status add value 'pending_completion'` in the same
      script as the new columns/functions after it. Supabase's SQL Editor
      runs a whole pasted script as one implicit transaction, and
      `alter type ... add value` can't commit inside a transaction block
      alongside other statements — it aborted the entire transaction,
      silently rolling back *everything* in that file, including the enum
      add itself. Every job (any status, not just pending_completion)
      broke with "Job not found" client-side, because the job-detail
      screens' fetch also wasn't checking `.error` on the query (fixed
      separately, see below) — the real error was "column
      jobs.completion_marked_by does not exist." Split into two files, now
      committed to migrations and noted as a standing rule in `CLAUDE.md`:
      1. `20260927000000_mutual_job_completion_enum.sql` — just the enum
         add, run by itself.
      2. `20260927000001_mutual_job_completion.sql` — everything else
         (columns, the four completion RPCs, grants, the auto-confirm
         cron) — run after file 1 commits.
      **Both files run 2026-09-17, schema confirmed**: 6 `job_status` enum
      values, 6 new columns present. Standing rule for migrations like this
      now documented in `CLAUDE.md`.
      **Also fixed while debugging**: both job-detail screens' job-fetch
      queries only checked `.data`, never `.error` — a real Postgres/
      PostgREST error rendered identically to a genuinely-missing job,
      hiding the cause. Same silent-failure pattern as the cancellation
      bug earlier. Now surfaces the real error text.
      **Full loop tested on-device 2026-09-17**: mark complete as one side,
      confirmed the OTHER side sees confirm/dispute (not the marker), undo
      works for the marker while pending, dispute reopens to hired, a real
      confirm unlocks reviews — each side submitted a review, neither saw
      the other's until both were in ("esperando a la otra parte" shown
      correctly). Still outstanding: the 7-day auto-confirm
      (`auto_confirm_stale_completions()`) and the review-window
      force-publish (`publish_expired_review_windows()`) — client is
      testing both themselves by backdating `completion_marked_at`/
      `completed_at` in Table Editor and calling the functions directly.
      ~~Original one-sided version~~: after the agreed date, either side
      marks complete via `mark_job_complete()`, unlocking reviews
      immediately. Reviews (blind, like Trusted Housesitters): both sides
      write after the job is completed; neither sees the other's review
      until both have submitted, or a 7-day window closes — then whatever
      exists publishes. `reviews` table already existed (author/subject
      resolved server-side via `set_review_parties`, one review per job
      per role) — added `published_at`, a rewritten `reviews_select`
      policy (visible once published, or always to your own review), a
      trigger (`try_publish_job_reviews`) that publishes both once both
      exist, and a daily cron (`publish_expired_review_windows()`) for the
      7-day force-publish path — all of this part is unchanged by the
      mutual-completion revision above, only *how* a job reaches
      `'completed'` changed. New `ReviewsCard` component
      (`src/components/reviews-card.tsx`), review-submission screens
      (`src/app/(client)/job/[id]/review.tsx` and the handyman equivalent),
      and a shared `StarRating` component (`src/components/star-rating.tsx`).

## Next up (priority order set by client 2026-09-17)

1. [x] **Notification deep-linking — DONE, confirmed end-to-end on
       2026-09-17** (cold start, backgrounded, and foreground all open the
       right screen, for both job and message notifications). Every
       notification payload already carried `type` plus either `job_id` or
       `conversation_id` (message notifications) — added
       `getNotificationDeepLink()` in `src/lib/push-notifications.ts`,
       mapping generically on whichever id key is present (`conversation_id`
       → `/conversation/{id}`, else `job_id` → `/job/{id}`) rather than
       switching on `type`, so a new notification type deep-links for free
       as long as it reuses one of those two keys. Wired into
       `src/app/_layout.tsx` via `useNotificationDeepLinking()`, following
       Expo's documented SDK 57 pattern: `getLastNotificationResponseAsync()`
       for cold start + `addNotificationResponseReceivedListener()` for a tap
       while running/backgrounded, enabled only once session+language are
       resolved and a session exists (the target screen isn't mounted before
       that). No new EAS build needed — pure JS/TS, picked up by the
       already-installed dev client.
       **Real bug found and fixed during testing**: tapping a message
       notification from cold start crashed with `"cannot add
       postgres_changes callbacks for realtime:conversation-... after
       subscribe()"`, confirmed to reproduce independent of which account was
       logged in. Root cause: `getLastNotificationResponseAsync()` and
       `addNotificationResponseReceivedListener()` both fired for the same
       cold-start tap (a known Android/Expo behavior), so `router.push()` ran
       twice for one tap, stacking two `ConversationScreen` instances for the
       same conversation. Both instances built a realtime channel with the
       identical topic `conversation-${conversationId}`, and
       `RealtimeClient.channel()` (confirmed by reading
       `node_modules/@supabase/realtime-js`) returns the *same* channel
       object for a repeated topic rather than a new one — so the second
       instance's `.on(...)` landed on a channel the first had already
       `.subscribe()`d to. Fixed two ways: (1) dedupe in
       `useNotificationDeepLinking()` by `notification.request.identifier` so
       a single tap can never fire `router.push()` twice; (2) defense in
       depth in `conversation-screen.tsx` — the channel topic now includes a
       random suffix per mount, so even a legitimate double-mount (e.g. a
       fast double-tap on a conversation row) can't collide on the same
       channel object again. `npx tsc --noEmit` and `eslint` both clean.
2. [ ] **Customize the Supabase signup email** — currently default Supabase
       copy, looks broken to a real user. Needs to be branded HandymanPR,
       Spanish by default. This is a dashboard change (Auth → Email
       Templates), not app code — hand the client exact steps/copy.
3. [x] **Per-user language + bilingual notifications — migration run,
       per-account persistence confirmed on-device 2026-09-18** (each
       account keeps its own language setting now). Bilingual push copy
       itself (a recipient getting a notification in their own stored
       language, not the sender's/device's) not yet separately confirmed —
       resume there if it hasn't been checked.
       Two bugs: language was device-wide (a single AsyncStorage key), so
       changing it on one account changed it for every other account signed
       into the same device too; and every push notification was hardcoded
       English regardless of the recipient's language, since nothing
       persisted a user's language server-side.
       Added a `language` column to `client_profiles`/`handyman_profiles`
       (`20260928000000_per_user_language.sql`, not yet run). App side:
       `LanguageProvider` now sits inside `SessionProvider` (needs the
       resolved session/role) and reads/writes the signed-in user's own
       profile row instead of one global key — AsyncStorage stays as the
       source for the pre-login screens and an offline fallback.
       `send_push_to_users()` now takes an `_es`/`_en` pair for every
       title/body and picks per-recipient via a new `get_user_language()`
       lookup (checks `client_profiles`, falls back to `handyman_profiles`,
       defaults `'es'`). All 15 notification call sites translated: new bid,
       bid accepted/rejected, new message, new job (immediate + free-tier +
       renewed), job expired, job cancelled, date proposed/confirmed,
       completion pending/confirmed/disputed/undone/auto-confirmed. Two of
       those (new message, new/renewed job) carry user-generated text — a
       message body, a job title — which stays as typed rather than being
       "translated"; only the fixed copy around it (e.g. "New job near you")
       is localized. Spanish dates render via a manual day/month-name/year
       build rather than `to_char`'s locale-dependent month names, since a
       Spanish locale isn't guaranteed to be installed on Supabase's
       Postgres image. `npx tsc --noEmit` and `eslint` both clean.
4. [ ] **Unread badge count on the Messages tab.**
5. [ ] **Auth basics** — show-password toggle on login, confirm-password
       field on signup, change-password screen in Settings.
6. [ ] **Tap a job photo to view it full-size**, swipe between multiple.

## Client-reported bugs fixed 2026-09-18 (outside the numbered list above)

- [x] **No cap on job photos** — client posted a job with 50 photos to
      confirm there was no limit. Capped posting and editing at 10
      (`MAX_JOB_PHOTOS` in `src/lib/job-photos.ts`, shared by both screens),
      with a clear alert at the limit and a live "N/10" counter.
- [x] **Data-loss bug on job edit** — deleting a photo on the edit screen
      applied immediately (Storage delete + DB delete), so backing out
      without saving did NOT undo it, unlike every other field on that
      screen. Now save-gated: removals and additions are queued in local
      state and only applied inside Save Changes, after the core fields
      succeed. Also added a whole-screen unsaved-changes prompt
      (`usePreventRemove`) covering header back, hardware back, and
      swipe-back.
- [x] **Compression — DONE, confirmed end-to-end on 2026-09-18.** Added
      `expo-image-manipulator`: every upload (posting and editing) is
      resized to at most 1600px on the long edge and re-encoded as JPEG at
      0.7 quality. New native dependency, needed a rebuild —
      `package-lock.json` regenerated from scratch with npm 10 (matching
      the EAS build environment) and `npm ci` verified clean under npm 10
      before triggering the build, per the standing lockfile rule in
      CLAUDE.md. Build `fa022c5f-cec6-419b-8a08-6fbfb4edd50a` finished
      clean, installed, and a test photo landed at 57 KB in Storage versus
      several MB before.
      All commits this session pushed immediately (`4bcaaa1` photo
      cap/save-gating/compression, `b174958` per-user language, `c8c9317`
      TODO update, `0df7567` job-deletion Storage cleanup below) without
      waiting for the build or on-device testing, per the client's call
      this session: prioritize a pushed restore point over a
      perfectly-timed commit.
- [x] **Orphaned Storage photos on job delete — implemented 2026-09-18,
      migration not yet run, not yet tested.** Deleting a job only ever
      removed its `job_photos` DB rows (via the FK's on-delete cascade) —
      the actual files stayed in Storage forever, silently eating free-tier
      quota with files nobody can reach. `handleDelete()` in
      `job/[id]/index.tsx` now lists and removes the job's Storage folder
      *before* deleting the row (order matters — the bucket's delete policy
      requires the `jobs` row to still exist). Added
      `scripts/cleanup-orphaned-job-photos.js`, a one-time Node script
      (needs the Supabase **service role** key, passed inline, never
      committed) that lists every top-level folder in the `job-photos`
      bucket, diffs against existing job ids, and removes whatever's
      orphaned — run with `--dry-run` first to see what it would delete.
      **Resume here**: run `--dry-run` to see how much test-data cruft is
      actually sitting there, then run it for real; separately confirm a
      fresh job delete no longer leaves its folder behind.
- [x] **Couldn't delete cancelled/expired jobs — implemented 2026-09-18,
      migration not yet run, not yet tested.** `jobs_delete`'s RLS policy
      only allowed deleting an `'open'` job — a dead cancelled or expired
      job (nobody hired, no reviews coming) couldn't be removed at all,
      just clutter. Widened (`20260929000000_job_deletion.sql`) to also
      allow `'cancelled'` and `'expired'`. Deliberately **not** widened to
      `'completed'` (or `'hired'`/`'pending_completion'`, unchanged) — the
      client's own call: a completed job's reviews belong to whoever
      received them, and letting either side delete the job to erase an
      unwanted review would defeat the point of the review system, even
      after the 7-day review window closes.

## Known bug — under investigation, awaiting fresh repro

- **Date-proposal identity mixup**: client reported that after the
  handyman proposed a date on job "Último trabajo 2" (Ponce, Techado) and
  switched to the client side, the client saw "Propusiste el Nov 22,
  2060 — esperando..." (i.e. thought *it* had proposed the date) and got
  no Confirm button. Re-audited both `propose_job_date()`'s SQL
  (`proposed_by = auth.uid()`) and `JobDateCard`'s comparison
  (`proposedBy === myId`) — both correct in isolation, and this is the
  same `auth.uid()` mechanism that correctly told client/handyman apart
  during Phase 2 cancellation testing. Leading theories: duplicate test
  job with the same title, or a stale fetch on one device. Diagnostic
  query handed to the client:
  ```sql
  select j.id, j.title, j.proposed_date, j.proposed_by,
         j.client_id, b.handyman_id as hired_handyman_id
  from jobs j
  left join bids b on b.id = j.hired_bid_id
  where j.title = 'Último trabajo 2';
  ```
  Client's test data has since changed (created/deleted jobs while
  waiting on a session limit reset) — **waiting on a fresh repro + the
  query result before touching any code here.**

## Then: scheduling

- [ ] Handyman availability calendar on their profile — no schema for this
      yet (would need something like `handyman_availability`).
- [ ] Client proposes dates on a job/bid, handyman confirms or negotiates.
- [ ] Once agreed, a calendar invite is sent in the job's chat thread.

## Then: portfolio / certs / subscriptions

- [ ] Portfolio photos: `handyman_portfolio_photos` table and the
      `portfolio-photos` Storage bucket both already exist (bucket +
      policies added 2026-09-18) — no upload screen, no display on the
      public profile yet.
- [ ] Certifications with admin-verified badge: `handyman_certifications`
      table and the `certifications` Storage bucket both exist (bucket is
      **private** — fetch with `createSignedUrl`, not a public URL) — no
      upload screen, no display anywhere yet. `is_verified` is already
      locked to admin-only edits (Table Editor), matching the existing
      verification pattern on `handyman_profiles.is_verified`.
- [ ] Subscription status on Settings: `handyman_profiles.is_subscribed` /
      `subscription_expires_at` / `is_promoted` / `promotion_expires_at`
      exist and are already admin-only-writable and already enforced by the
      15-minute-head-start logic — no Settings UI reads or displays them
      yet, and no actual purchase flow exists (activation is manual via
      Table Editor per `supabase/README.md`).
- [ ] Direct-invite flow: `jobs.visibility = 'invite_only'` and
      `invited_handyman_id` already exist and are enforced everywhere
      (RLS, `enforce_bid_insert`) — no UI to actually post one. Needs
      hanging off Browse Handymen (see audit below), since inviting someone
      presumes you found them first.

## Then: visual polish

- [ ] Color scheme
- [ ] App name header

## Known minor issues (low priority, not fixed yet)

- **Web only**: `pueblo-map.tsx:26` logs `Unknown event handler property
  \`onResponderTerminate\`. It will be ignored.` in the browser console.
  Doesn't happen in the native app (Android/iOS) — cosmetic console noise
  on web only, found 2026-09-16 while testing push notifications.
- An expired job's status line shows the job's original posting age
  ("Expired · 22 hours ago") instead of when it actually expired — both
  client and handyman job-detail screens use `formatRelativeTime(job.created_at, ...)`
  for that line regardless of status. Client flagged it as low priority,
  found 2026-09-16.

## Parked (explicitly not now, don't build without asking)

- Swipe-to-dismiss on rejected bids in My Bids — probably "hide from my
  view," not a real delete, since bids stay tied to job history.
- Sorting/filtering on the handyman job feed beyond pueblo/trade (added
  2026-09-19) — e.g. sort by price/date.
- **Audit of every Supabase query for swallowed errors.** The completion
  migration bug and the earlier cancellation-guard bug (both above) were
  caused by the same pattern — a query result's `.error` field never
  checked, so a real Postgres/PostgREST failure rendered identically to
  "not found" or silently did nothing. Both known instances are fixed, but
  the codebase hasn't been swept for the same pattern elsewhere. Flagged
  by the client, not yet scheduled against the priority list above.

## Done (for context, not a task list)

Auth, job posting/editing (incl. photos) and deletion/cancellation, the full
bid loop (submit/withdraw/accept, note nudge, cap enforcement including
hiding a full job from the feed), handyman job feed with pueblo/trade
filters, sectioned Your Jobs and My Bids lists, chat (one thread per
job+handyman, opens before bidding, Realtime), handyman public profile
(name/avatar/bio/years/verified/trades/pueblos — but see the profile-editing
gap below), Storage buckets for job-photos/avatars/portfolio-photos/
certifications (job-photos bucket confirmed public + policies fixed
2026-09-15 — it was never actually created before that, hence "Bucket not
found" errors), a `JobPhoto` component that shows a visible "failed to
load" message instead of a silent black box on any remote job photo,
keyboard-avoiding on every text-field screen (chat, sign-in, sign-up,
forgot-password, post-job, job edit, bid form — `KeyboardAvoidingScreen`
shared component, `fc7f390`), pull-to-refresh on every list screen
(`4fc0e63`), a handyman being able to cancel a hired job (`373938f`), and
push notifications end to end (registration + FCM V1 setup + `pg_net`-based
sending on new bid/bid status/new message/new job — see history above).

---

## Schema audit — gaps not on the list above

Went through every table against what's actually got a screen. Two real
gaps turned up that aren't anywhere in the roadmap above:

- **Browse Handymen (client tab) is still a placeholder.** No search/filter
  by pueblo or trade, no way to open a handyman's profile from the client
  side except by finding them on a bid first. This is a prerequisite for
  the direct-invite flow above (you need to find someone before inviting
  them), and probably wants to exist before subscriptions/promoted
  placement mean anything (`is_promoted` has nowhere to show up yet).
- **`payment_logs` table has zero UI** — no screen writes or reads from it.
  Its own migration comment calls it "optional, informational only, no
  enforcement," so this may be intentionally deferred, but it wasn't
  mentioned when the roadmap was dictated, so flagging it in case that was
  an oversight rather than a decision.

Everything else missing a screen (portfolio, certifications, subscriptions,
invite-only jobs, reviews, scheduling) is already captured in the roadmap
sections above with its schema state noted inline.

**Profile editing is a soft dependency worth knowing about**: neither
`client_profiles` nor `handyman_profiles` has an edit screen for anything
beyond what sign-up sets (full name only) — no phone, no avatar, no bio, no
years of experience. The handyman public profile already renders bio/years/
avatar if present, but nothing ever writes them. This will matter once
portfolio/certs/subscriptions gets built (that's naturally where profile
editing would live), so it doesn't need its own roadmap slot, but it isn't
free — that section will need to build the edit form too, not just the
portfolio/cert upload pieces.
