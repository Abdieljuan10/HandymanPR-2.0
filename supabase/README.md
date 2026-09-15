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

## Not done yet (comes later, not schema)

- **Storage buckets** for photos/files (avatars, portfolio photos, job photos,
  certification uploads) — these are Supabase Storage buckets, a separate setup step
  from the database tables above.
- **Realtime** for the chat feature (`job_messages`) — Supabase can push new messages
  live; we'll turn that on when we build the chat screens.
