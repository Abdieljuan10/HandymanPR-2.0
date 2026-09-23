# Roadmap

## Start here — session handoff, 2026-09-23 (evening)

**Browse Handymen + direct invites — built, pushed, not yet tested.**
Migration 9 `20261008000000_job_invite_notify.sql` **not yet run**.
- **Browse tab** (`src/app/(client)/(tabs)/browse.tsx`): name search +
  multi trade/pueblo filters (same panel as the handyman job feed, "match
  any", filtered client-side — fine at pilot scale, move server-side if the
  list grows). Sorted: live promotion first (`is_promoted` +
  `promotion_expires_at`, badge "Featured"), then verified, then name. Tap →
  the existing public profile.
- **Invite to quote**: button on the public profile → `invite/[handymanId]`
  → the Post Job form (now a shared `src/components/post-job-form.tsx`) in
  invite mode: banner naming the handyman, no bid-cap stepper, posts
  `visibility: 'invite_only'` + `invited_handyman_id`. Existing RLS / bid
  guard already enforce it; nothing about invites needed schema.
- **Migration 9** pushes "You've been invited to quote" to the invited
  handyman on post and on renewal from expired (every existing new-job push
  skips invite-only jobs). Without it the invite still works, just silently.
- **Handyman feed** pins their invites to the top with "Invited you to
  quote", exempt from their trade/pueblo filters.
- **Client job detail** shows "Private invite — only X can see…" linking to
  that handyman's profile.
- "Wait for them to bid on a posted job" needs nothing new — a public job
  already reaches every handyman matching its pueblo + trade.

**Invitations to already-posted public jobs — built 2026-09-23, not yet
tested.** Migration 10 `20261009000000_job_invitations.sql` **not yet run.**
- New `job_invitations (job_id, handyman_id)` table. The job stays public;
  an invitation additionally grants that handyman visibility of the job
  while it's open (new `jobs_select` branch via `auth_is_invited_to_job()`)
  and lets them bid past pueblo/trade, head start **and max_bids** (client's
  call: full job still takes an invited bid). Address stays hidden until
  hired, same as every bidder.
- Rules in the insert trigger: owner only (checked first — see abuse review),
  job open + public, not a handyman who already bid, max 10 per job, one per
  handyman per job (PK). **No revoke** by design (delete + re-insert = push
  spam). Push on insert.
- App: profile "Invite to Quote" → chooser `invite/[handymanId]` (your open
  public jobs with Invite / Invited / Already bid, or "New private job" →
  `invite/[handymanId]/new`, the old invite form). Handyman feed pins and
  labels these too; client job detail lists "Invited: …".
- Invitations are fetched in separate fail-soft queries on the job detail
  and feed, never embedded in the main job query — an embed error there
  reads as "job not found" (the CLAUDE.md completion-migration lesson).
- **Known, pre-existing, not fixed:** `enforce_bid_insert` runs before RLS,
  so a bid insert on any job id returns its status/"full" message — minor
  status oracle (no personal data). Worth a caller check someday.

**Saved handymen — built 2026-09-23, not yet tested.** Migration 11
`20261010000000_saved_handymen.sql` **not yet run.** Private per-client
bookmark list (`client_saved_handymen`, own-rows-only RLS, no push, the
handyman never sees it). Heart on the public profile (hidden until its state
loads, so it never shows a wrong state); Browse gets a "Saved (n)" / "Show
All" toggle in its title row and a small heart on saved cards. The saved list
is fetched separately and fails soft. Not added to the client Profile tab —
Browse covers "find them again" in one tap.

**Reviews on the handyman public profile — built 2026-09-23, not yet tested.**
Migration 11 (saved handymen) confirmed run the same day. The screen had never
queried reviews at all (DB was fine — Juan Ríos had 2 published, avg 5.0).
Now: stars + "5.0 · 2 reviews" under the name, and a Reviews section (stars,
comment, date) above the portfolio, "No reviews yet." when empty. Published
client reviews only — filtered on `published_at` explicitly, because
`reviews_select` still lets an author read their own unpublished review.
**Reviewer first names added (client's call 2026-09-23)**: first name only,
plain text, never linked to the reviewer. Migration 12
`20261011000000_handyman_public_reviews.sql` (**not yet run**) — an RPC that
splits `full_name` server-side so the last name never reaches the device
(`client_profiles` has no `first_name` column, and `reviews.author_id` has no
FK to embed through). Returns no author/job ids. Execute revoked from
anon/public. Until it's run the Reviews section is hidden (not "No reviews
yet"). Not on Browse cards yet.

Migration 12 confirmed run 2026-09-23.

**SECURITY FIXES — built 2026-09-23. BOTH RUN + VERIFIED.** #2 confirmed
2026-09-23: final check returned no rows (all seven locked), every
`cron.job` row runs as `postgres`. Still to confirm: a chat message push
arrives on the phone (client testing it now).
1. **Run and verified 2026-09-23** via the rolled-back impersonation test:
   0 phone columns left; connected handyman sees exactly 1 of 2 clients (their
   chat client); client sees only self; no one else's `profile_private` rows.
   Not directly tested: a handyman with zero connections (none exist in the
   data — every handyman has one). Same rule, but worth one check with a
   fresh handyman account.
   `20261012000000_lock_down_client_profiles.sql` — `client_profiles_select`
   was `using (true)`: any signed-in account could read every client's name,
   phone and avatar. Now: own row, or a handyman connected by a bid (any
   status), a conversation, a private invite, or a `job_invitations` row
   (`auth_handyman_connected_to_client()`). Phone numbers (client AND
   handyman) moved to owner-only `profile_private`, copy verified before the
   old columns are dropped. Handyman profiles stay public (they advertise).
   No app change needed — every screen showing a client name is reached via
   a connection, and all use `?.` fallbacks. Verify with the rolled-back RLS
   impersonation test handed over in chat.
2. `20261012010000_lock_down_internal_functions.sql` — **anyone, signed out,
   could call `send_push_to_users` through the REST API** and push any text
   to any user (Supabase grants EXECUTE to anon by default; only grants were
   ever written, never revokes). Also get_user_language and the five cron
   sweeps. All revoked from public/anon/authenticated; every in-DB caller
   verified SECURITY DEFINER first. The migration ends with a check query
   that must return no rows.
Rule for this going forward is now in CLAUDE.md.

**Push tokens: one phone got BOTH accounts' pushes (found on-device
2026-09-23) — fix built, migration 15 NOT YET RUN.** Causes: logout was a
bare `signOut()` that never removed the device's `push_tokens` row, and rows
were unique on (user, device) not on the Expo token, so each account that
logged in on a phone added another row with the same token. Also a privacy
leak (logged-out phone kept showing that account's message previews). Fix:
`20261013000000_push_token_one_owner.sql` — keeps only the newest row per
token, unique index on `expo_push_token`, and `register_push_token()` RPC
that hands the device to whoever logged in last. App: registration uses the
RPC; both Log out buttons call `signOutAndUnregister()` (deletes this
device's row before signing out). Until the migration runs, registration
logs an error and old rows keep working — nothing breaks.

**Standing rule (2026-09-23):** every migration that changes who can see or
do what ships with a plain-language abuse review ("what could a malicious or
careless user do") before the client runs it.

**Waiting on the client:**
0. **Run migration 10** (job_invitations) — handed over with its abuse review.
1. **Run migration 9** (handed over as chat text) — not confirmed yet.
2. **Test — all on the phone app, both sides** (client's call 2026-09-23:
   no browser testing, it caused the Alert.alert bug hunt):
   a. Browse + filters (scrolls to pueblos now) + search.
   b. Private invite: profile → Invite to Quote → New private job → the
      handyman gets the push; a third handyman does NOT see the job at all.
   c. Invitation to an existing public job: profile → Invite to Quote → pick
      an open job → switches to "Invited" → handyman gets the push, job pinned
      in feed → their bid goes through even outside their pueblo/trade or past
      the bid cap → a third handyman sees it as a normal job (only if it
      matches their pueblo/trade and isn't full), never labelled as an invite.
3. **Vault step** for the 90-day chat cron — still not confirmed. Project
   Settings → API → copy `service_role` key → Project Settings → Vault → New
   secret named exactly `service_role_key`. Until then the cron logs a
   `NOTICE` daily and cleans nothing (harmless).
4. **Renewal test** for chat `archived_at` (the rolled-back `do $$` block
   handed over 2026-09-23) — never run. Optional; the trigger is recreated by
   migration 8 either way.

**Chat delete/archive batch — DONE, confirmed on-device 2026-09-23** (delete,
archive, resurface-as-fresh-conversation, photos). Migration 8 is live.
Final rules, for reference:
- **Delete** — immediate, per-user, no job-status restriction. If the other
  side messages again it comes back as a **fresh** conversation showing only
  messages sent after the delete — the old history is NOT restored. (Briefly
  changed to restore full history on 2026-09-23 from a misread of the spec;
  reverted the same day at the client's explicit correction. Don't re-do it.)
  `hidden_at` is stamped server-side by `hide_conversation()`.
- **Archive** — swipe action next to Delete, per-user
  `job_conversation_archives`, "Show Archived" toggle. Touches nothing.
  Stays archived when new messages arrive until unarchived.
- **Cleanup** — (a) both parties deleted *and* no message since either delete
  → row + Storage photos removed on the spot; (b) 90-day cron is the real
  backstop for every conversation whose job is completed/cancelled/expired.
- Conversations with zero messages never show in either list.
- "Resurfaced chat came back empty" diagnostic (2026-09-23): **no data
  loss** — all 18 messages of `58f0ca94…` intact, never hard-deleted.
- The older "cancelling a job made the handyman lose the conversation"
  report (item 8 notes) was never re-reported after migration 8 — treat as
  closed unless it recurs.

**Dev gotcha (Windows, found 2026-09-23): typed routes for NEW route files.**
A route file added while `expo start` is running gets typed as a *static*
route (`/invite/[handymanId]` literally, brackets and all), so `router.push`
with a real id fails `tsc`. The watcher hands typegen a backslash path, and
its dynamic-segment check splits on `/` (`@expo/router-server`
`typed-routes/generate.js`). Routes present at startup are fine. Fix: restart
the dev server (the cloudflared tunnel is a separate process, URL survives).

**Dev environment gotcha that cost most of an afternoon — don't re-derive it:**
`expo start --tunnel` is **permanently broken on a free ngrok account**.
`@expo/ngrok@4.1.3` is the newest release and bundles the ngrok **v2.3.41**
agent; ngrok now refuses any agent below 3.20.0 on free plans
(`ERR_NGROK_121`), and no `@expo/ngrok` version ships a v3 agent. `ngrok
update` only stays within the v2 line. Paid plans are exempt, so paying would
also fix it.
The working alternative, already set up on this machine:
```
"/c/Users/juanp/.cloudflared/cloudflared.exe" tunnel --url http://localhost:8081
# take the https://<random>.trycloudflare.com URL it prints, then:
EXPO_PACKAGER_PROXY_URL=https://<that-url> npx expo start --dev-client
```
`EXPO_PACKAGER_PROXY_URL` is read from the pre-dotenv environment (verified in
`@expo/cli`'s `UrlCreator.js`), so it must be passed inline — putting it in
`.env` will not work. The URL is entered manually in the dev client; there's no
`exp://` URL or QR with this setup, and the hostname is random on every restart.
Also: `expo start` can orphan a Metro process holding port 8081 after a failed
run — check `netstat -ano | grep :8081` before assuming the port is free.

**Pilot-scope override, set 2026-09-18**: before anything else below, the
goal is the minimum to put this in front of one real handyman in Puerto
Rico (not a store launch). Working through this list, in order:
1. [x] Branded Supabase signup email — see "Next up" item 2 below. Template
   committed, still needs the client to apply it in the dashboard.
2. [x] **Brand direction chosen: "Isla" (teal + coral)** — presented 4
   palette/icon directions as an artifact, client picked Isla. Colors wired
   into `theme.ts` (`tint`/`accent`, both light/dark) and every hardcoded
   `#3c87f7` accent blue in app code (`primary-button.tsx`, `themed-text.tsx`
   linkPrimary, `pueblo-map.tsx` selection fill, the archive-swipe-action
   background on both Your Jobs and My Bids, the `completed` status dot) —
   `npx tsc --noEmit` and `expo lint` both clean. Also wired
   `expo-notifications`' Android notification-icon `color` in `app.json` to
   the new teal, since that one has no image-asset dependency.
   **Deliberately NOT touched, by client request** (holding icon/splash
   assets until a features-first pass is done and a real build is imminent):
   the actual `icon.png`/`splash-icon.png`/`android-icon-*.png` files (still
   the literal default Expo template graphics), `app.json`'s
   `expo-splash-screen` plugin `backgroundColor` and
   `android.adaptiveIcon.backgroundColor` (both tightly coupled to those
   still-default images — recoloring just the background without new
   artwork would look more broken, not less), and `animated-icon.tsx` (the
   in-app splash-transition component, which renders that same still-default
   icon graphic). **Resume here**: build real icon/splash images in the
   chosen Isla palette, then wire those three remaining spots together in
   one pass so the whole splash sequence stays visually consistent.
3. [x] **Basic handyman profile editing (name/bio/years/avatar) — built
   2026-09-18.** New `(handyman)/profile-edit.tsx` screen (avatar picker +
   compress-to-640px-JPEG + upload to the existing `avatars` bucket at a
   fixed `{userId}/avatar.jpg` path with `upsert: true` so re-uploading
   replaces in place instead of orphaning old files, `?v=` cache-busting
   query param on the saved URL, name/bio/years fields, unsaved-changes
   guard, same `.select().maybeSingle()` RLS-silent-failure check pattern as
   job edit). `(handyman)/(tabs)/profile.tsx` — previously a bare
   `PlaceholderScreen` with no display of any actual profile data — now
   shows the real avatar/name/verified badge/years/bio (or a "no bio yet"
   prompt) and links to Edit Profile alongside the existing Edit
   Trades/Edit Pueblos/Settings buttons. No migration needed, every column
   and the Storage bucket+policies already existed.
   Also touched the **public** profile screen (`(client)/handyman/[id].tsx`)
   while verifying it displays all this correctly: it already rendered
   bio/years/avatar/verified correctly when present, but had no
   avatar-placeholder for a handyman with no photo yet (would've shown just
   floating text) — added the same initials-circle placeholder as the new
   edit screen, and switched the "Verified" badge from plain secondary-gray
   text to the new brand tint color so it reads as a real trust signal.
   `npx tsc --noEmit` and `expo lint` both clean. **Not yet tested
   on-device.**
4. [x] **Portfolio photos + certifications — built 2026-09-18.** Client's
   call: build these before showing the app to anyone (reversing the
   earlier plan to defer them past the pilot), since alongside the profile
   these are "the rest of what a client judges a handyman on." No migration
   needed — every column, table, and Storage bucket+policy already existed.
   **Superseded 2026-09-19**: the flat photo-grid portfolio described below
   was reworked into projects — see item 6 further down. Left as-is here
   for history; certifications are unaffected by that rework.
   - New `(handyman)/portfolio.tsx`: grid of portfolio photos (immediate
     add/remove, not save-gated — each is a standalone dedicated screen, not
     a field bundled into a larger form the way job photos were when that
     class of bug bit before, and every remove now requires an Alert
     confirm first specifically to guard against that same silent-loss
     pattern). Reuses `compressJobPhoto`/`MAX_DIMENSION` from
     `lib/job-photos.ts` as-is (1600px/JPEG 0.7 is exactly as appropriate
     for portfolio photos as job photos) and the `JobPhoto` component's
     built-in "failed to load" fallback. Capped at 30 photos
     (`MAX_PORTFOLIO_PHOTOS`, raised from an initial 12 on 2026-09-19 — see
     below). No caption field — the DB column exists but nobody asked for
     it, easy to add later.
   - New `(handyman)/certifications.tsx`: list of existing certifications
     (title, issuing org, Verified/Pending Review badge, remove with
     confirm) plus an inline add form (title required, org optional, photo
     required in the UI even though the DB column is nullable — an
     unverifiable claim isn't useful). Uploads to the **private**
     `certifications` bucket store the bare Storage **path** in
     `file_url`, not a public URL (there isn't one for a private bucket,
     and a signed URL would go stale if persisted) — this screen never
     redisplays the uploaded file, only the row metadata, so no signed-URL
     generation was needed at all.
   - `(handyman)/(tabs)/profile.tsx`: added Portfolio/Certifications
     buttons alongside the existing ones.
   - **Public profile** (`(client)/handyman/[id].tsx`): added a Portfolio
     section (photo grid, same `JobPhoto` component) and a Certifications
     section (title/org/Verified badge — no image, since the certifications
     bucket's storage-level RLS is owner-only-read by design, confirmed by
     re-reading the original migration comment). **Revised 2026-09-19**:
     first version still listed an unverified cert's title/org, just without
     the badge — client's call (confirmed correct on review) was that this
     is wrong: an unverified certification is just an unverified claim, and
     listing it at all (even unbadged) would make the Verified badge
     meaningless. Query now filters `is_verified = true` server-side, so an
     unverified cert is invisible to clients entirely, not just unbadged.
     "Pending Review" stays a handyman-facing-only concept, shown only on
     the management screen. Both sections only render when there's at least
     one (verified, for certs) row.
   - Found and killed a real leftover process while regenerating Expo
     Router's typed routes for the new screens: an earlier `npx expo start`
     I'd stopped via the harness's task-stop had left its underlying Metro
     process (a separate PID) still bound to port 8081 in the background.
     Harmless here since nothing else needed that port, but worth knowing
     `TaskStop`/background-task-stop doesn't always kill the whole child
     process tree for `expo start` specifically.
   `npx tsc --noEmit` and `expo lint` both clean. **Not yet tested
   on-device.** See "Then: portfolio / certs / subscriptions" below — the
   subscriptions item there is still not built (out of pilot scope, no
   payment flow exists at all), only portfolio/certs from that section.
5. [x] **Client feedback on items 3/4, 2026-09-19**:
   - [x] **Bug: avatar upload failed with "new row violates row-level
     security policy," round 2.** First fix (below) turned out incomplete —
     client ran the migration, portfolio and certification uploads started
     working, but avatar upload still failed with the identical error. That
     actually pinned down the real cause: since portfolio-photos and
     certifications come from the exact same migration transaction as
     avatars and now provably work, avatars' policies must have applied
     too — ruling out "policy never ran" for avatars specifically. The one
     remaining difference between avatar's upload call and the two that
     work: avatar used `upsert: true`, the other two don't. Removed it —
     `uploadAvatarIfNeeded()` in `profile-edit.tsx` now deletes any existing
     file first (a no-op on first upload) and does a plain insert-only
     upload, the same call shape already proven to work. Also improved
     error surfacing: the thrown error now includes the full
     `JSON.stringify` of the Storage error object (name/status/etc.), not
     just `.message`, so a future report carries full diagnostic detail
     instead of another generic string.
     Original (first) fix, kept since it likely mattered for
     portfolio/certifications even if not for avatars: reviewed the upload
     path and the `avatars` bucket policy against every other bucket in the
     schema — all four use the identical
     `(storage.foldername(name))[1] = <owner id>` pattern, and the code's
     path (`{userId}/avatar.jpg`) matches it correctly, so there was never
     a path-mismatch bug in the code. Most likely cause, matching exactly
     what happened with job-photos before (see
     `20260919000000_fix_job_photos_bucket.sql`'s own comment): the bucket
     + policy migration was written but never actually run against the
     live project.
     `20261001000000_fix_avatar_portfolio_cert_storage.sql` (run) —
     re-asserted the bucket + policies for avatars/portfolio-photos/
     certifications, safe to run blind.
     **Client needs to retry avatar upload with this second fix and
     confirm.**
   - [x] Portfolio cap raised 12 → 30, then the whole flat-photo model was
     reworked into projects the same session — see item 6 below.
     `MAX_PORTFOLIO_PHOTOS` no longer exists; superseded by
     `MAX_PROJECT_PHOTOS = 15` (per project, not total).
   - [x] **Optional Instagram/Facebook links on the handyman profile** —
     many PR handymen already have a business page with years of work on
     it; linking it is far cheaper than re-uploading a portfolio.
     `20261001010000_handyman_social_links.sql` adds
     `instagram_url`/`facebook_url` to `handyman_profiles` (no RLS change
     needed, the existing update policy already covers any column on your
     own row). Two optional fields on `profile-edit.tsx`
     (`normalizeSocialUrl()` prepends `https://` if the client typed a bare
     domain, light `.includes('.')` sanity check rather than full URL
     validation). Public profile shows them as tappable
     `Linking.openURL()` links, right under the bio.
   - [x] Certifications public-visibility question, answered and fixed —
     see the "Revised 2026-09-19" note on item 4 above: confirmed it was a
     real design gap (title/org showed even unverified), not intentional,
     and fixed to hide unverified certs entirely rather than just hiding
     their badge.
   - [x] **Flagged, not built**: no admin screen exists to verify a
     certification — `is_verified` is still Table-Editor-only (flip the
     column by hand), same as `handyman_profiles.is_verified` always has
     been. Fine for a one-handyman pilot; worth a real admin screen once
     there's more than one handyman to review by hand.
   `npx tsc --noEmit` and `expo lint` both clean.
6. [x] **Portfolio reworked from flat photos into projects — built
   2026-09-19.** Client's reasoning: "30 loose photos tell a client
   nothing... 'I built this house, here are 30 photos' is evidence they can
   judge," plus it gives a handyman a reason to describe their work, which
   helps them win bids. Real schema change, done deliberately now rather
   than after anyone had uploaded loose photos (nobody had, on this
   pre-pilot project, but the migration handles it correctly either way —
   see below).
   - **Migration** (`20261002000000_portfolio_projects.sql`, must run
     **after** item 5's storage-policy fix migration): new
     `handyman_portfolio_projects` table (title required, description/
     trade_id/pueblo_id all optional, public select + own-row write RLS,
     same pattern as the profile itself). `handyman_portfolio_photos` gets
     a new `project_id` column; `handyman_id` and the never-used `caption`
     column are dropped (ownership now flows through the parent project,
     same shape as `job_photos_write`'s ownership-via-parent-job pattern).
     **Migrating existing loose photos**: before dropping `handyman_id`,
     the migration creates one default project titled "Portafolio" per
     distinct `handyman_id` found in the photos table, then points every
     existing photo at its handyman's new default project — so if anyone
     already had loose photos, they surface as a single pre-existing
     project instead of being silently orphaned or deleted. On this project
     specifically this almost certainly affects zero rows (pre-pilot), but
     it's correct either way. Storage itself is untouched — photos still
     live at `portfolio-photos/{handyman_id}/{filename}`, same bucket, same
     just-fixed policies; project grouping is DB-only, the object path
     doesn't need to know about it.
   - **Handyman side**: `portfolio.tsx` (flat photo grid) removed, replaced
     with a directory — `portfolio/index.tsx` (project list, cover photo +
     trade/pueblo + photo count per card, delete-with-confirm, matches the
     Your-Jobs-list style of immediate destructive action since there's no
     bundle of other fields here), `portfolio/new.tsx` (create: title
     required, description/trade/pueblo optional via the existing
     `TradePicker`/`PuebloPicker` in `mode="single"`, up to
     `MAX_PROJECT_PHOTOS = 15`, photos held locally until Create like
     `post-job.tsx`), `portfolio/[id]/index.tsx` (edit: unlike the flat
     photo screen before it, this bundles fields *and* photos in one
     screen, so it follows `job/[id]/edit.tsx`'s save-gated convention
     instead — every change, including photo add/remove, is queued and
     only applied on Save Changes, with the same unsaved-changes guard;
     whole-project delete is a separate, immediate, always-available action
     since it isn't a "queued field," it's the same kind of action as the
     list screen's delete).
   - **Client side**: `(client)/handyman/[id].tsx` restructured into
     `handyman/[id]/index.tsx` (to make room for a nested route) plus a new
     `handyman/[id]/project/[projectId].tsx` detail screen. The public
     profile's Portfolio section now shows project cards (title ·
     trade/pueblo · photo count) instead of a flat photo grid; tapping one
     opens the detail screen (title, description, trade/pueblo, full photo
     grid).
   - **Real Expo Router typed-routes quirk hit and worked around**: a
     template-literal href like `` `/portfolio/${id}` `` only type-checks
     for a dynamic segment that's the *only* thing in its directory (like
     `job/[id]/`) — once a dynamic folder has static siblings in the same
     directory (`portfolio/index.tsx` and `portfolio/new.tsx` next to
     `portfolio/[id]/`), Expo Router's typegen doesn't emit the permissive
     template-literal type for it at all, only the exact-object form.
     Fixed by using `href={{ pathname: '/portfolio/[id]/index', params: {
     id } }}` there instead of a template string. (The client-side
     `handyman/[id]/project/[projectId]` link didn't hit this — `project/`
     has no static siblings, so the plain template-literal href works
     there.)
   `npx tsc --noEmit`, `expo lint`, and a full `npx expo export -p android`
   production bundle export all clean. **Not yet tested on-device.**
7. [x] **Visual/structural bug batch — built 2026-09-19.** Client tested the
   portfolio-projects rework and reported five things; four built now, chip
   spacing (fifth) explicitly deferred into the still-open Oficio-picker
   layout conversation (trade/pueblo pickers are vertical checklists, not
   chips — there was no chip UI to fix).
   - **Certifications: real critical-rule bug found and fixed.**
     `protect_certification_verified()` (the trigger stopping handymen from
     self-verifying) did `new.is_verified := old.is_verified` on every
     authenticated update — which also meant the app could **never** reset
     `is_verified` to false on an edit, even though nothing was asking it
     to. A verified "Handyman" cert edited to "Licensed Electrician" would
     have silently stayed verified. Fixed
     (`20261003000000_certification_edit_resets_verification.sql`): now
     unconditionally `new.is_verified := false` for any authenticated-role
     update, so every self-service edit drops back to pending review; only
     a service-role context (still Table-Editor-only, per the existing
     pattern) can set it true. One-tap Delete replaced with a real edit
     screen (`certifications/[id].tsx`) — title/org fields, the uploaded
     photo shown via a fresh `createSignedUrl` (bucket is private,
     owner-scoped select policy already allows it) inside the new
     `PhotoViewer`, a verified-notice banner, and Delete moved here. Also
     fixed a real storage leak while in there: delete never called
     `storage.remove()` on the uploaded file, unlike every other
     delete-with-photo flow in the app (portfolio/job photos both do) —
     fixed alongside the row delete.
   - **Chat screen**, all in `conversation-screen.tsx`:
     - Keyboard covering the input, two passes:
       1. First pass: the global `KeyboardAvoidingScreen` fix from
          `fc7f390` was already applied here, but its flat
          `keyboardVerticalOffset={90}` (iOS) is a guess at status-bar +
          header height that's short by ~13px on Dynamic Island devices,
          and unlike every other screen using that wrapper, chat has no
          scrollable form to mask an offset error (fixed input row below
          a `FlatList`, not a field inside a `ScrollView`). Fixed by
          dropping to a local `KeyboardAvoidingView` for this screen only
          (not the shared wrapper — 13 other screens rely on it as-is)
          with a computed `useSafeAreaInsets().top + 44` offset on iOS,
          Android left as `height`/`0`, unchanged. **Client confirmed
          this didn't fix it — still covered on Android** (they're
          testing Android, not iOS).
       2. Second pass, real root cause: checked `app.json` against the
          actual installed `@expo/prebuild-config` plugin logic
          (`withEdgeToEdge.js`/`WindowSoftInputMode.js`), not just Expo's
          blog posts about edge-to-edge becoming SDK-wide default —
          **this app actually has edge-to-edge OFF** on Android (neither
          `android.edgeToEdgeEnabled` nor the `react-native-edge-to-edge`
          plugin is configured, and the package isn't even installed;
          per that plugin's own code, that combination falls back to
          disabled). `android.softwareKeyboardLayoutMode` is also unset,
          which defaults to `adjustResize`. So the OS's native keyboard
          resize was genuinely active and working the whole time — the
          existing code comment blaming edge-to-edge
          (`keyboard-avoiding-screen.tsx`) doesn't apply to this build.
          Real bug: `KeyboardAvoidingView` with `behavior="height"` was
          fighting that already-working native resize with its own
          keyboard-event-driven height calculation (confirmed by reading
          RN's `KeyboardAvoidingView.js` source — coordinate-space
          fragile even on its own, on top of overriding an already-correct
          native resize). Fixed: `behavior={Platform.OS === 'ios' ?
          'padding' : undefined}` on Android, letting `adjustResize`
          handle it alone. **Not yet re-confirmed on-device — resume
          here.** If this project ever turns edge-to-edge on (Android 16/
          targetSdk 36 will eventually force it), this exact bug will
          come back and need the JS-side handling reinstated.
     - Send button: was the generic `PrimaryButton` (52px tall,
       form-button padding) dropped next to a ~35px single-line `TextInput`
       — visibly mismatched. Replaced with a 40×40 circular icon button
       (Ionicons `arrow-up`) sized to the input's resting height.
     - Avatar/name/job now shown and tappable: query expanded to also pull
       `job_id`, `jobs(id)`, and both parties' `avatar_url`/`id`. Header is
       now avatar + name (→ the other party's profile) and a separate job
       title line (→ `/job/{id}`, already registered on both stacks).
     - **New minimal client-profile screen**
       (`(handyman)/client/[id].tsx`) — client's call: a handyman deciding
       whether to bid wants to know who they'd work for, and this is also
       where client ratings will eventually live (not built yet, just the
       screen). Avatar + name only (`client_profiles` has no bio/trades to
       show), mirrors the existing public-handyman-profile loading/
       not-found pattern. `client_profiles_select` RLS is already
       `using (true)`, no policy change needed.
   - **New `PhotoViewer` component** (`src/components/photo-viewer.tsx`):
     full-screen `Modal`, horizontal paging `FlatList`, close button, index
     counter. No pinch-zoom (no new dependency for it) — full-size + swipe
     between multiples, which is what was asked. Wired into every photo
     surface in the app: job photos (both job-detail screens), portfolio
     photo grids (handyman edit screen + client project-detail screen),
     the new certification signed-URL image, and avatars (public handyman
     profile, handyman's own profile tab). **Exception, deliberate**:
     `profile-edit.tsx`'s avatar keeps its existing tap-to-replace
     behavior — repurposing that tap for viewing would remove the
     "change my photo" affordance. Portfolio *list* cover photos
     (`portfolio/index.tsx`) also left alone — that tap already navigates
     to the project, which is correct as-is.
   - **New `StarDisplay` component** (`src/components/star-display.tsx`):
     read-only, 5 Ionicons stars, half-star support via rounding to the
     nearest 0.5, gold (`RatingColor` in `theme.ts`, a new shared constant
     both this and the existing input `star-rating.tsx` now import instead
     of each hardcoding the same hex). Replaces `formatStars()` (deleted,
     `src/utils/format-rating.ts`) in `reviews-card.tsx`, the only place a
     rating actually renders anywhere in the app today — searched the
     whole codebase, no aggregate/average rating exists yet (including the
     public handyman profile), so this is the only retrofit site for now;
     it's also what the new client-profile screen will use once ratings
     land there.
   - **Caught before it shipped**: adding the new `clientProfile.notFound`
     i18n key almost created a **second, duplicate** `"clientProfile"` top-
     level key in both `en.json`/`es.json` — one already existed (the
     client's own profile-tab placeholder title/description). JSON doesn't
     error on a duplicate key, the parser just silently keeps the *last*
     one, which would have quietly broken that existing placeholder screen.
     Merged into the existing block instead.
   - Also had to briefly boot local Metro (`npx expo start --port 8082`, no
     tunnel, killed again immediately after) purely to get Expo Router's
     typed-routes file to pick up the new `client/[id]` route — its
     typegen only runs as a dev-server side effect, no standalone CLI for
     it.
   `npx tsc --noEmit` and `expo lint` both clean. **Not yet tested
   on-device — resume there, Android keyboard behavior specifically.**

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
2. [ ] **Customize the Supabase signup email** — template ready, not yet
       applied. Branded HTML template committed at
       `supabase/email-templates/confirm-signup.html`, Spanish by default
       (matches the app's default language and "Técnico"/"Cliente" wording).
       Exact dashboard steps (Auth → Email Templates → Confirm signup, plus a
       Site URL check on the same page) are in `supabase/README.md`. Colors
       used (`#1C64F2` / `#F97316`) are a placeholder pair — swap once real
       brand colors are picked in the visual-polish item below. **Client
       needs to apply it in the dashboard and confirm a test signup email
       looks right.**
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
       field on signup, change-password screen in Settings. **Client
       reconfirmed 2026-09-19 this is still wanted, confirm-password on
       signup specifically** — none of the three built yet.
6. [x] **Tap a job photo to view it full-size, swipe between multiple —
       built 2026-09-19**, and broadened past just job photos to every
       photo surface in the app (portfolio, certifications, avatars) —
       see item 7 in the pilot-scope list at the top of this file.
7. [ ] **Certifications should accept PDFs, not just photos — flagged by
       client 2026-09-19.** Real licenses usually arrive as PDFs (emailed,
       or downloaded from a licensing board); making someone screenshot a
       PDF to upload it is friction on exactly the thing the app wants
       them to do. Not built yet. Needs: (1) `certifications.tsx`'s
       `handleAdd()` currently calls `compressJobPhoto()` unconditionally
       and only offers `ImagePicker.launchImageLibraryAsync({ mediaTypes:
       ['images'] })` — needs a document-picker path for PDFs
       (`expo-document-picker`, not yet a dependency) alongside or instead
       of the image picker, skipping image compression for a PDF upload;
       (2) confirm the private `certifications` storage bucket's
       `certifications_storage_insert` policy (`storage.objects`, scoped
       by owner folder) doesn't also need a MIME-type check added —
       currently ungated on content type, so likely fine as-is, but worth
       confirming rather than assuming; (3) the certification edit
       screen's `PhotoViewer` usage (built in the same batch as this note,
       see item 7 in the pilot-scope list) only knows how to display
       images — a PDF should open externally (`Linking.openURL()` on the
       signed URL, or `expo-sharing`) instead of being handed to the image
       viewer, gated on `file_url`'s extension or a stored content-type
       column (schema currently has no column tracking this — `file_url`
       is just a bare storage path, so either infer from the extension at
       upload time or add a `file_type` column alongside it).
8. [x] **Per-user chat deletion/archiving + photo attachments — built
       2026-09-22.** Migrations 1–5 below **run and confirmed by the client
       2026-09-22**; 6 and 7 (the on-device bug fixes) written the same day,
       client applying them. Full plan below kept as-is for context/history.
       **Seven migrations, must run in this exact order** (all printed in
       chat as they were written, per the client's request to copy each one
       from a phone):
       1. `20261005000000_chat_delete_hide_schema.sql` — `archived_at`/
          `last_message_at` on `job_conversations` (backfilled from
          existing message history), `job_conversation_hides` table + RLS,
          the `last_message_at`-bump trigger.
       2. `20261005010000_chat_photos_storage.sql` — the private
          `chat-photos` bucket + insert/select/delete policies.
       3. `20261005020000_job_conversations_auto_archive.sql` — the
          `jobs.status` trigger that sets `archived_at` on
          completed/cancelled/expired.
       4. `20261005030000_chat_mutual_hide_cleanup.sql` —
          `chat_both_parties_hidden()` + a new `job_conversations_delete`
          RLS policy (there was no delete policy on this table before) that
          enforces the "both hidden" condition at the DB level, not just in
          app code.
       5. `20261005040000_chat_90day_cleanup_cron.sql` — the 90-day
          backstop cron. **Needs a one-time manual Vault step before it
          does anything — a loud warning block is at the top of the file
          itself, and it's called out again in "Then: the Vault step"
          below.**
       6. `20261006000000_fix_job_conversation_hides_update.sql` — **bug
          found on-device**: deleting a conversation you'd already deleted
          once failed with "new row violates row-level security policy
          (USING expression)". The table had select/insert/delete policies
          but no **update** policy, and the app's upsert becomes
          `INSERT ... ON CONFLICT DO UPDATE` once the hide row exists —
          that path is gated by an UPDATE policy's USING expression, hence
          the confusing wording on what looked like an insert. First delete
          of any conversation always worked; only the second hit it.
       7. `20261006010000_restrict_chat_delete_to_ended_jobs.sql` —
          **design change, client's call 2026-09-22**: on a **live** job,
          mutual delete must only ever hide, never erase. Both sides
          deleting a chat mid-job used to destroy the history for good,
          which cut against the whole reason per-user delete exists.
          `chat_both_parties_hidden()` replaced by
          `chat_conversation_deletable()` (adds "job has ended", checked
          against the job's *current* status, not `archived_at` — correct
          for conversations whose job ended before the auto-archive trigger
          existed, and for a cancelled job, which `cancel_hired_job()`
          reopens to `'open'` and so is genuinely live again). Renamed
          rather than widened in place so the RLS policy and the app can't
          drift — both call the one function.
          Also fixes a latent bug in the same invariant:
          `auto_archive_job_conversations()` now **clears** `archived_at`
          when a job leaves the terminal statuses, not just sets it on
          entry. Without that, renewing an expired job left a stale
          `archived_at` ticking and the 90-day cron (which reads
          `archived_at`, not job status) would eventually delete a live
          job's conversation.
       App side (all in the same commits, `npx tsc --noEmit` + `expo lint`
       clean throughout): both `messages.tsx` screens now order by
       `last_message_at`, swipe-to-delete with a confirm
       (`src/lib/chat.ts:hideConversation()`, shared between both screens —
       hides the chat for you, then checks `chat_conversation_deletable()`
       and if true sweeps that conversation's chat photos out of Storage
       and deletes the row for real).
       **Resurface fix (found on-device 2026-09-22)**: a conversation that
       came back after a new message reloaded its *entire* history from day
       one. `conversation-screen.tsx` now filters the message query
       server-side on the caller's own `hidden_at`, so only messages sent
       after the delete return — WhatsApp behavior. Server-side on purpose:
       PostgREST returns `+00:00` timestamps while `toISOString()` produces
       `Z` ones, so comparing them as strings in JS is wrong. The same
       latent bug was in both `messages.tsx` list filters
       (`last_message_at` vs `hidden_at`) — now `Date.parse`d on both sides.
       `conversation-screen.tsx` has an attach icon that opens the image
       picker, compresses via the existing `compressJobPhoto`, uploads to
       `chat-photos`, and renders photo messages through batch-generated
       signed URLs into the existing `PhotoViewer`. The client job-detail
       screen's `handleDelete()` now also sweeps a deleted job's
       conversations' chat photos first, same precedent as the existing
       job-photo cleanup.
       **Then: the Vault step (client, manual, one-time)** — Dashboard →
       Project Settings → API → copy the `service_role` key (never the
       anon key), then Dashboard → Project Settings → Vault → New secret,
       named exactly `service_role_key`, value = that key. Until this is
       done the 90-day cron runs daily, finds nothing to do, and logs a
       `NOTICE` instead of erroring — it will not silently corrupt
       anything, it just won't clean anything up yet.
       **Resume here**: client applies migrations 6 and 7, does the Vault
       step, then confirms on-device — delete a chat **twice** (the bug
       above), delete a chat on a **live** job from both sides (must stay
       hidden-only, row still present in Table Editor), delete from both
       sides on an **ended** job (row should actually disappear), send a
       message into a deleted-by-you chat from the other side (should
       resurface showing **only** the new message, not the old history),
       attach + send a photo both directions, and delete a job with an
       existing conversation (chat photos should be gone from the
       `chat-photos` bucket in Storage after).
       **Open, awaiting a diagnostic query result (2026-09-22)**: client
       reported that cancelling a job from the client side made the
       handyman lose the conversation entirely. Traced every path that can
       remove a `job_conversations` row — `cancel_hired_job()` isn't one of
       them (it sets the job back to `'open'`, marks the bid cancelled, and
       never touches conversations; the auto-archive trigger only stamps
       `archived_at`, which nothing but the 90-day cron reads). Only two
       things delete a conversation: the mutual-hide cleanup (needs both
       parties) and deleting the job itself (cascade, pre-existing since
       the initial schema). Client was testing delete/cancel/delete in
       quick succession across two accounts, so mutual-hide firing is the
       likely explanation — diagnostic query handed over, **not assumed to
       be a separate bug unless the result says otherwise**. Worth knowing
       either way: after a cancel reopens a job to `'open'`, the same red
       button on the client job screen becomes **Delete Job**, which
       cascades the conversation away for both parties — easy to hit twice
       without noticing the label changed.
       **One piece already shipped ahead of the rest, on its own**
       (`20261004000000_fix_job_messages_select_rls.sql`, commit
       `d581573`): `job_messages_select`'s RLS only checked that a
       conversation row *existed*, not that the caller was a party to it —
       any authenticated user could read any conversation's messages.
       Found while researching this feature; fixed standalone since it was
       live and cheap, not worth waiting for the rest.
       **Client's requirements, confirmed 2026-09-20**:
       - Deleting a chat is per-user (like WhatsApp/Messenger) — never
         affects the other person's copy. Explicit reasoning: if one side
         could wipe a conversation for both, a handyman could erase what
         he promised right before disputing a bad review.
       - Per-user delete **never touches Storage on its own** — matches
         real WhatsApp exactly. Storage/rows are only actually removed
         once **both** parties have deleted the same conversation (nobody
         left to see it), or by the 90-day cron backstop. (First answer to
         this question came back garbled/nonsensical, had to re-ask before
         getting a real one — worth noting in case something similar
         happens again this session.)
       - The 90-day auto-delete clock starts when the **job** ends
         (completed/cancelled) — not conversation/message activity, since
         a job can sit quiet for weeks mid-work (waiting on parts/permits)
         and the whole point of keeping chats is dispute evidence once
         work is supposedly done. A conversation whose job never got
         hired (client picked someone else, job expired) has no
         completion event — ties to the job's own expiry/deletion instead.
       - Swipe to delete a chat from your own view, with an "are you
         sure" confirm.
       - Attachments: photos only for now (no video/arbitrary files) —
         a client showing a problem is the main use case, and
         compression + Storage patterns already exist to reuse. Layout:
         attach icon left, text input middle, send button right (send
         button/layout already fixed this session, see
         `conversation-screen.tsx` history above).
       **Design, worked out during planning (see the retired plan file
       for the full version — this is the executable summary)**:
       - Schema (one migration, no enum changes): `job_conversations`
         gets `archived_at timestamptz null` (set once the job hits a
         terminal status, starts the 90-day clock) and `last_message_at
         timestamptz not null default now()` (bumped by a trigger on
         `job_messages` insert — needed so a per-user delete correctly
         "comes back" if a new message arrives after it was hidden, same
         as real WhatsApp; also fixes a separate gap the research turned
         up, that the messages list currently shows zero last-activity
         info at all). New `job_conversation_hides(conversation_id,
         user_id, hidden_at)` table, identical shape/RLS to the existing
         `job_archives` table (`20260930010000_job_archives.sql`).
       - **Auto-archive**: a single `after update on jobs` trigger, firing
         when `status` transitions into `completed`/`cancelled`/`expired`,
         sets `archived_at = now()` on that job's conversations. Chose a
         trigger on the `jobs.status` column itself over patching every
         RPC that can produce those transitions
         (`confirm_job_completion`, `auto_confirm_stale_completions`,
         `cancel_hired_job`, `expire_stale_jobs`, etc.) — one choke point
         that can't be forgotten, matching the client's own framing that
         the job ending is what matters, not which code path caused it.
       - **Chat-photos Storage bucket**: new bucket, **private** (chat
         photos are personal, never public), path `{conversation_id}/
         {filename}` — same "folder = parent id, ownership via join"
         pattern as `job-photos`
         (`20260916000000_job_photos_storage.sql`), not the flatter
         `{owner_id}/...` pattern avatars/portfolio/certifications use,
         since both parties need access, not just the uploader.
         `job_messages.photo_url` already exists as a column (added ahead
         of time, comment literally says "photos are a later add-on") —
         one photo per message, matches the photos-only/no-multi scope.
       - **Cleanup, two different mechanisms depending on who's around to
         do it**:
         - Both-sides-deleted and job-deletion cleanup run from the
           *acting user's own authenticated client* (same pattern as the
           existing job/portfolio-photo delete flows —
           `storage.remove()` before the row delete) — no elevated
           privilege needed, the bucket's own delete policy already
           covers a real participant. Job deletion specifically extends
           `handleDelete()` in both job-detail screens to also sweep
           that job's conversations' chat photos first, same precedent as
           the existing job-photo-cleanup-on-job-delete fix.
         - The 90-day cron is the one piece needing real service-role
           access: raw SQL `delete from storage.objects` only removes the
           metadata row, not the underlying file, and a `pg_cron` job has
           no logged-in user's JWT to call the Storage REST API with.
           Plan: store the project's service-role key in **Supabase
           Vault** (Dashboard → Project Settings → Vault — one-time
           manual step, never committed to git) and have the cron
           function call Storage's bulk-delete REST endpoint via
           `net.http_delete`, following this project's existing
           `pg_net`-from-SQL pattern (`send_push_to_users()` in
           `20260922000000_push_notifications_send.sql`) rather than
           introducing an Edge Function, which this project has
           deliberately avoided so far. **This cron will silently do
           nothing until that vault step is done** — needs to be called
           out loudly in the migration comment, matching this project's
           own hard-won lesson about migrations that don't work until a
           manual dashboard step happens (see the avatar/portfolio/cert
           storage-policy saga above).
       - **UI**: swipe-to-delete on both `messages.tsx` screens, reusing
         the exact `ReanimatedSwipeable` pattern already used for
         job/bid archiving (`(client)/(tabs)/index.tsx`,
         `(handyman)/(tabs)/my-bids.tsx`), red instead of the archive
         tint, `Alert.alert` confirm first. List query needs to exclude a
         conversation the current user hid *unless* `last_message_at` has
         moved past `hidden_at` (the "comes back on a new message" rule).
         Attachments: attach icon added to the left of
         `conversation-screen.tsx`'s input row, opens
         `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] })`
         (single photo), small removable preview chip above the input
         before sending, reuses `compressJobPhoto` as-is (already generic
         despite the file name) for compression. A photo message renders
         via a signed URL (bucket is private) inside a `Pressable` opening
         the existing `PhotoViewer` — no changes needed to that component,
         its API already supports this.
       **Resume here Monday**: write the schema migration first (section
       1 of the retired plan), then the bucket+policies, then the
       trigger, then wire the two client-driven cleanup paths, then the
       cron+vault piece last (it's the riskiest/most novel — fine for it
       to land after everything else works end-to-end for the
       common/live-user case).

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
- [x] **Couldn't delete cancelled/expired jobs — DONE, confirmed on-device
      2026-09-19.** `jobs_delete`'s RLS policy only allowed deleting an
      `'open'` job — a dead cancelled or expired job (nobody hired, no
      reviews coming) couldn't be removed at all, just clutter. Widened
      (`20260929000000_job_deletion.sql`) to also allow `'cancelled'` and
      `'expired'`. Deliberately **not** widened to `'completed'` (or
      `'hired'`/`'pending_completion'`, unchanged) — the client's own call:
      a completed job's reviews belong to whoever received them, and
      letting either side delete the job to erase an unwanted review would
      defeat the point of the review system, even after the 7-day review
      window closes. See the archive feature below for the alternative on
      completed jobs.
- [x] **Orphaned Storage photos on job delete — DONE, confirmed on-device
      2026-09-19** (a fresh job delete now actually removes its Storage
      folder). First pass
      (`0df7567`, 2026-09-18) added a Storage list+remove step to
      `handleDelete()` before deleting the job row. Client tested it: still
      broken — deleted all but 3 jobs, Storage still showed 5 folders,
      meaning *fresh* deletions were still leaving orphans. Root cause: the
      `job-photos` bucket only ever had INSERT and DELETE policies on
      `storage.objects` — no SELECT. A bucket's `public: true` flag only
      exempts unauthenticated GET-by-URL from RLS; it does **not** exempt
      `list()`, which is a query against `storage.objects` gated by RLS like
      any other table read (the `certifications` bucket already needed
      exactly this same select policy, for its own private-bucket reason).
      Without it, `handleDelete()`'s `list(id)` call silently returned an
      empty array — RLS filters rows, it doesn't error — so `remove()` was
      never invoked, and the job still deleted successfully with **no error
      shown**, while its photos stayed behind. Fixed in
      `20260930000000_job_photos_storage_select.sql`, scoped the same as
      the existing insert/delete policies (job's owning client only).
      `scripts/cleanup-orphaned-job-photos.js` (needs the Supabase
      **service role** key, passed inline, never committed) remains for
      sweeping up everything orphaned before this fix — already run once by
      the client for the original backlog; the 5-folders-for-3-jobs leftover
      was what was still there because *this* fix wasn't live yet.
- [x] **Archive completed jobs (client side) — DONE, confirmed on-device
      2026-09-19** (archiving on the client's side correctly left the job
      visible on the handyman's side — per-user scoping confirmed working).
      Client's follow-up to completed jobs staying undeletable: Outlook-style
      archive instead — hides a completed job from Your Jobs without
      touching the job or its reviews. Per-user via a new `job_archives`
      join table (`20260930010000_job_archives.sql`, generic on
      `job_id`+`user_id`, not client-specific — see below, the handyman side
      reuses this same table with zero schema changes), so archiving on one
      side never affects what the other party sees. Swipe-to-archive on
      completed job rows in Your Jobs, plus a "Show Archived (N)" toggle
      revealing an Archived section with swipe-to-unarchive. Needed
      `GestureHandlerRootView` wrapping the app root in `_layout.tsx` —
      `react-native-gesture-handler`/`react-native-reanimated` were already
      dependencies (expo-router's own native-stack needs them) but were
      never explicitly wired up for use inside a screen; uses the
      non-deprecated `ReanimatedSwipeable` import rather than the classic
      `Swipeable`.
- [x] **Archive + filter/sort on My Bids (handyman side) — implemented
      2026-09-19, not yet tested.** Client's follow-up: archive matters more
      here than on the client side, since a working handyman's My Bids list
      only grows (hundreds of bids and completed jobs over time). Same
      `job_archives` table, no schema change — reused as-is. Archivable
      scope widened past just "completed" to also cover `jobCancelled` and
      `closed` (rejected/withdrawn) — this doubles as the parked "swipe to
      dismiss rejected bids" item from below, now built. Needed a dedicated
      "Completed" section first (previously lumped into "Accepted" alongside
      still-active hired/pending_completion bids, which made it impossible
      to scope archiving correctly). Also added the trade/pueblo/status
      filter panel (mirroring the handyman job feed's existing filter UI)
      and a newest/oldest sort toggle — needed adding `trade_id`/
      `pueblo_id`/`trades` to the bids query, which wasn't previously
      selected. No new native dependency, no new migration — testable via a
      plain reload.
      **Resume here**: test archive/unarchive on My Bids, and the
      trade/pueblo/status filters + sort toggle.

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

## Cross-cutting: every Alert.alert is a no-op on web

Found 2026-09-22 while debugging "chat delete does nothing." Confirmed by
reading the installed source — `react-native-web@0.21.2` ships
`class Alert { static alert() {} }`, a literal empty function. So in a
browser every `Alert.alert` silently does nothing: no dialog, no error.
For a **confirm** dialog that means the destructive action behind it is
never reached at all (the swipe-to-delete on Messages looked completely
dead on web, while swipe-to-archive kept working precisely because it has
no confirm step). For an **informational** alert it means the message
just never appears.

This matters because the client routinely tests the client-side flows in
a browser and the handyman side on a device.

- [x] Fixed at the root with `src/lib/confirm.ts` — `window.confirm`/
      `window.alert` on web, `Alert.alert` on native, same call shape
      either way. Swap in themed modals during the visual-polish pass if
      wanted; call sites won't need to change. Three helpers, matching the
      three shapes the app actually used:
      - `notify({title, message})` — informational, single dismiss.
      - `confirmAsync({...}) => Promise<boolean>` — two-button confirm.
        Also resolves `false` on Android back/tap-outside dismiss, which
        the hand-rolled promise versions didn't: they left the promise
        pending forever, so an awaiting submit handler just hung.
      - `confirmDestructive({..., onConfirm})` — callback-style
        destructive confirm, the common delete/discard case.
- [x] **Swept 2026-09-22**: all 22 `Alert.alert` call sites across 9 files
      converted. `grep -rn "Alert" src/app` now returns nothing —
      `Alert` is imported only inside `src/lib/confirm.ts`. Covered the
      destructive confirms that were genuinely dead on web (job
      delete/cancel, bid withdraw, handyman-side job cancel, portfolio
      project deletes ×2, certification delete, and the three
      unsaved-changes discard guards), the three "you left this blank"
      nudges, and the six photo-limit warnings. `npx tsc --noEmit` and
      `expo lint` both clean (only the 4 pre-existing unrelated
      warnings/error). **Not yet re-tested on device or web.**

## Fixed: hidden_at is device time, last_message_at is server time

**Fixed 2026-09-23** in migration 8 (`hide_conversation()` RPC stamps
`hidden_at` with the server's `now()`); the list's optimistic hide now uses
the row's own `last_message_at` instead of the device clock. Original note:

Found 2026-09-22. `hideConversation()` sends
`new Date().toISOString()` (the **device** clock) as `hidden_at`, but
`last_message_at` is written by a Postgres trigger using `now()` (the
**server** clock) — and the "has this conversation resurfaced" rule
compares the two against each other. If a device clock lags the server,
a just-deleted chat can immediately look resurfaced and reappear, which
presents as "delete did nothing." Narrow (needs skew larger than the age
of the last message) but real, and it also silently shifts the cutoff
used by `conversation-screen.tsx` for which messages come back.
Fix is a small RPC that does the upsert server-side with `now()` on both
the insert and the on-conflict update, so both timestamps come from the
same clock. Deliberately held back so the `confirmDestructive` fix above
can be confirmed on its own first.

## Then: scheduling

- [ ] Handyman availability calendar on their profile — no schema for this
      yet (would need something like `handyman_availability`).
- [ ] Client proposes dates on a job/bid, handyman confirms or negotiates.
- [ ] Once agreed, a calendar invite is sent in the job's chat thread.

## Then: portfolio / certs / subscriptions

- [x] Portfolio photos — **built 2026-09-18, reworked into projects
      2026-09-19**, see the pilot-scope list at the top of this file for
      detail. Management screens and public-profile display both done for
      the project-based version.
- [x] Certifications with admin-verified badge — **built 2026-09-18**, see
      the pilot-scope list at the top of this file for detail. Add/remove
      screen and public-profile display (title/org/Verified badge, no
      image) both done. `is_verified` stays locked to admin-only edits
      (Table Editor), matching the existing verification pattern on
      `handyman_profiles.is_verified`.
- [ ] Subscription status on Settings: `handyman_profiles.is_subscribed` /
      `subscription_expires_at` / `is_promoted` / `promotion_expires_at`
      exist and are already admin-only-writable and already enforced by the
      15-minute-head-start logic — no Settings UI reads or displays them
      yet, and no actual purchase flow exists (activation is manual via
      Table Editor per `supabase/README.md`).
- [x] **Built 2026-09-23** (see handoff at top). Direct-invite flow: `jobs.visibility = 'invite_only'` and
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

- **~~Browse Handymen (client tab) is still a placeholder.~~ Built 2026-09-23.** No search/filter
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
