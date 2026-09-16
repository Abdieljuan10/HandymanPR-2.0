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
3. Mutual agreed date — **starting now, resume here.**
4. Job completion + blind reviews — not started.

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
- [ ] **Mutual agreed date** (minimal — deliberately NOT full scheduling,
      see "Then: scheduling" below, kept as its own later feature by
      request 2026-09-16): client proposes a date after hiring, handyman
      confirms; either side can propose a change, the other confirms.
      Mutual by construction — `confirm_job_date()` rejects confirming your
      own proposal — so neither side can set the date unilaterally (a
      handyman delaying to dodge a bad review, or a client backdating to
      review early). `jobs.agreed_date`/`proposed_date`/`proposed_by`, plus
      `propose_job_date()`/`confirm_job_date()` RPCs. Date input is JS-only
      (three linked month/day/year `FormField`s, validated as a real
      calendar date) — deliberately not a native date-picker dependency,
      to avoid another EAS build cycle; can upgrade to a native picker later
      during the UI redesign pass if a rebuild is happening anyway.
- [ ] **Job completion**: after the agreed date, either side can mark the
      job complete via `mark_job_complete()` (gated on `agreed_date` being
      set and having passed). This is what unlocks reviews.
- [ ] **Reviews (blind, like Trusted Housesitters)**: both sides write after
      the job date; neither sees the other's review until both have
      submitted, or a 7-day window closes — then whatever exists publishes.
      `reviews` table already exists (author/subject resolved server-side
      via `set_review_parties`, one review per job per role) — needs a new
      `published_at` column, a rewritten `reviews_select` policy (visible
      once published, or always to your own review), a trigger that
      publishes both once both exist, and a daily cron
      (`publish_expired_review_windows()`) for the 7-day force-publish path.
      Still no UI at all — needs a review-submission screen and a status
      view on the job detail screen.

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
