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

## Not done yet

- **Certification upload UI** — the `certifications` bucket and its RLS policies
  exist, but no screen uploads to it yet. When that screen gets built, fetch files
  with `supabase.storage.from('certifications').createSignedUrl(path, expiresIn)`,
  not a public URL — the bucket is private.
