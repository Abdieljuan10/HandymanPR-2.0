# Roadmap

Order set by the client (2026-09-15): **push notifications → chat → job
completion + reviews → scheduling → portfolio/certs/subscriptions → visual
polish.** Chat is already built (see below); push notifications is next.

Whoever picks up a session on this repo: read this file first, and update it
— move finished items to "Done", adjust anything that changed shape — before
committing at the end of your session. See the instruction in `CLAUDE.md`.

## Next up: push notifications — IN PROGRESS, mid-setup

The app's core retention hook — a handyman getting pinged about a job in
their pueblo. Needs a **development build** (push doesn't work in Expo Go).
Walking the client through EAS setup, Android first.

**Status as of 2026-09-15, paused for a usage-limit break — resume here:**

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
- [ ] **`eas login` — asked the client to run this via `! npx eas login`
      (their account: `abdieljuan`, expo.dev/accounts/abdieljuan). Not
      confirmed done as of the pause.** This is the very next step.
- [ ] Once logged in: `eas init` to link the project (writes
      `extra.eas.projectId` into app.json — `registerForPushNotifications`
      already reads this and no-ops until it's there), configure `eas.json`
      Android build profile, trigger the first cloud build.
- [ ] Client downloads/installs the resulting `.apk`, confirms a row lands
      in `push_tokens` after logging in on the dev build.
- [ ] **Only after that's confirmed working**: build the actual
      notify-handymen-on-job-post trigger — deliberately not started yet,
      no point wiring sends before a token can be confirmed to round-trip.
      Then: new bid on your job (client), bid accepted/rejected (handyman),
      new message (both). Respect the 15-minute subscriber head start
      (mirrors `jobs.visible_to_free_at`) for the job-post notification.
- [ ] Sending mechanism still undecided: likely a Supabase Edge Function or
      a DB trigger using `pg_net` to call Expo's push API directly, triggered
      on `jobs`/`bids`/`job_messages` insert or `bids` status update. Decide
      once there's a real device+token to test against.
- [ ] Consider a read/unread or "last notified" marker for messages so a
      long conversation doesn't re-notify on every message if the app's in
      foreground already — not in the schema today.

## Then: job completion + reviews

- [ ] **Job completion**: after the agreed date, either side can mark the
      job complete. This is what unlocks reviews.
- [ ] **Reviews (blind, like Trusted Housesitters)**: both sides write after
      the job date; neither sees the other's review until both have
      submitted, or a window closes (~5–7 days) — then they publish
      together. `reviews` table already exists (author/subject resolved
      server-side via `set_review_parties`, one review per job per role) —
      no UI at all yet, and the "blind until both submit or window closes"
      logic isn't in the trigger yet (it currently publishes immediately on
      insert with no gating).
- [ ] **Cancellation**: either side can cancel before the agreed date; job
      returns to open, or client can repost. Nobody gets reviewed. Record
      the cancellation per account (new column/table — schema doesn't track
      this yet) but don't surface it publicly.
- [ ] **Job expiry**: a job with no bids expires after a set period; ask the
      client whether to renew (Facebook Marketplace pattern). No expiry
      column or job exists for this yet — needs a `expires_at` (or similar)
      on `jobs` plus a scheduled check.
- [ ] Note: "the agreed date" implies jobs need a scheduled/agreed date
      field, which doesn't exist yet — likely arrives with Scheduling below,
      but completion/cancellation logic depends on it existing first.

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

## Parked (explicitly not now, don't build without asking)

- Swipe-to-dismiss on rejected bids in My Bids — probably "hide from my
  view," not a real delete, since bids stay tied to job history.
- Sorting/filtering on the handyman job feed beyond pueblo/trade (added
  2026-09-19) — e.g. sort by price/date.
- Pull-to-refresh on any screen beyond the one it was originally built for
  (Your Jobs) — client home already has it; every other list refetches on
  focus instead, which was judged sufficient.

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
found" errors), and a `JobPhoto` component that shows a visible "failed to
load" message instead of a silent black box on any remote job photo.

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
