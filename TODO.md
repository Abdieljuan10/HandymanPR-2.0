# Roadmap

Order set by the client (2026-09-15): **push notifications → chat → job
completion + reviews → scheduling → portfolio/certs/subscriptions → visual
polish.** Chat is already built (see below); push notifications is next.

Whoever picks up a session on this repo: read this file first, and update it
— move finished items to "Done", adjust anything that changed shape — before
committing at the end of your session. See the instruction in `CLAUDE.md`.

## Next up: push notifications

The app's core retention hook — a handyman getting pinged about a job in
their pueblo. Needs a **development build** (push doesn't work in Expo Go).
Walking the client through EAS setup, Android first, is the plan for the next
session.

- [ ] Notify handymen when a job posts matching their pueblos AND trades
- [ ] Respect the 15-minute subscriber head start (subscribers immediately,
      free tier after the window — mirrors `jobs.visible_to_free_at`)
- [ ] Notify client: new bid on your job
- [ ] Notify handyman: bid accepted / rejected
- [ ] Notify both: new message
- [ ] **Schema gap this will need**: nothing in the schema stores an Expo
      push token yet. Needs a new table, e.g. `push_tokens (user_id, token,
      platform, updated_at)`, RLS'd to the owning user, written on app
      launch/login.
- [ ] Sending mechanism: likely a Supabase Edge Function (or DB webhook)
      triggered on `jobs` insert / `bids` insert / `bids` update (status
      change) / `job_messages` insert, calling Expo's push API. Needs
      deciding once the dev build is up and a token can round-trip.
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
certifications.

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
