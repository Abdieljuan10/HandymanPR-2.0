# Running the database schema

No Supabase CLI needed for this step — just copy and paste into the dashboard.

1. Go to [supabase.com](https://supabase.com/dashboard) and open your HandymanPR project.
2. In the left sidebar, click **SQL Editor**, then **New query**.
3. Open `migrations/20260914000000_initial_schema.sql` in this repo, copy the entire
   contents, paste into the query editor, and click **Run**.
4. Click **New query** again, open `seed.sql`, copy the entire contents, paste, and **Run**.
5. Check it worked: go to **Table Editor** in the sidebar. You should see a `pueblos`
   table with 78 rows, a `trades` table with 10 rows, and a `service_categories`
   table with 1 row (`Handyman`).

If step 3 or 4 errors out partway through, don't re-run it — tell me the exact error
text and which line it happened near, and we'll fix the file before trying again
(re-running a partially-applied script can create duplicate tables/policies).

## How you'll act as "admin" for now

There's no admin panel yet. To verify a handyman's certification, activate a
subscription, or turn on promoted placement, open **Table Editor** in the Supabase
dashboard, find the row in `handyman_certifications` or `handyman_profiles`, and edit
the field directly (e.g. flip `is_verified` to `true`). Edits made this way go through
your Supabase admin access, not the app, so they're allowed even though the app itself
is blocked from changing those specific fields.

## Storage buckets + bidding/messaging fixes (run once)

1. In **SQL Editor**, **New query**, open `migrations/20260918000000_storage_bidding_messaging.sql`,
   copy the entire contents, paste, and **Run**.
2. Check it worked: go to **Storage** in the sidebar. You should see four buckets:
   `job-photos` (already existed), `avatars`, `portfolio-photos` (all public), and
   `certifications` (private).

This one file creates the `avatars`, `portfolio-photos`, and `certifications`
buckets with upload/delete policies scoped to each file's owner; tightens a bid
so a handyman can only withdraw their own still-pending bid and a client can only
accept/reject a still-pending bid on their own job; closes a gap where a handyman
could write an arbitrary `client_id` into a new chat thread; and turns on Realtime
for `job_messages` so chat screens get new messages live instead of polling.

Nothing here needs a manual toggle in the dashboard beyond running the file —
Storage buckets and their policies are just rows in `storage.buckets` /
`storage.objects`, same mechanism as the tables above.

## Branded signup email (dashboard change, run once)

The default Supabase confirmation email is unbranded and looks broken/phishy
to a real user. A replacement template lives in this repo at
`email-templates/confirm-signup.html` — Spanish by default (matching the
app's default language), same "Técnico"/"Cliente" wording as the app itself.

1. In the Supabase dashboard, go to **Authentication → Email Templates →
   Confirm signup**.
2. Set the **Subject heading** to: `Confirma tu cuenta — HandymanPR`
3. Open `email-templates/confirm-signup.html` in this repo, copy the entire
   contents, and paste it into the **Message body (HTML)** field, replacing
   what's there. Leave the `{{ .ConfirmationURL }}` placeholders exactly as
   they are — Supabase fills those in per email.
4. Click **Save**.
5. Test it: sign up a throwaway account from the app and check the email
   that arrives.

**While you're on that Authentication page, also check the Site URL**
(**Authentication → URL Configuration → Site URL**). If it's still the
default `http://localhost:3000`, tapping the confirmation link on a phone
will land on a broken page after confirming (the account still gets
confirmed either way, but it looks broken). Point it at something real —
even a plain "you're confirmed, go back to the app" static page is fine,
since the app doesn't deep-link the confirmation itself (the in-app copy
already tells the user to confirm the email, then manually return and log
in).

**Note on brand colors**: the button/header colors in the template
(`#1C64F2` blue, `#F97316` orange) are a provisional placeholder pair, not
final brand colors — swap the two hex values in the file (and re-paste) once
the app's real color scheme is picked.

**Known limitation, not fixed here**: Supabase's built-in email sending is
rate-limited (a handful of emails per hour) and can land in spam, since it
sends from a shared Supabase domain rather than one you control. Fine for a
one-person pilot; if this becomes real friction, the fix is wiring up a
custom SMTP provider (Auth → Settings → SMTP Settings) — bigger task, not
attempted here.

## Not done yet

- **Certification upload UI** — the `certifications` bucket and its RLS policies
  exist, but no screen uploads to it yet. When that screen gets built, fetch files
  with `supabase.storage.from('certifications').createSignedUrl(path, expiresIn)`,
  not a public URL — the bucket is private.
