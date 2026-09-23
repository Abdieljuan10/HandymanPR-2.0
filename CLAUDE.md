@AGENTS.md

# Roadmap
Read TODO.md at the start of every session. Update it — move finished items, adjust anything that changed shape — before committing at the end of your session.

# Git
Always run `git push` right after `git commit` — a commit alone leaves work sitting local-only. Ten commits sat unpushed for a full session before this rule existed.

# Supabase migrations
`alter type ... add value` must be the ONLY statement in its own migration file, run by itself, whenever the same deployment also adds anything that references the new value (a function body, a later statement, etc.). The Supabase SQL Editor runs a whole pasted script as one implicit transaction, and `alter type ... add value` cannot commit inside a transaction block alongside other statements — it aborts the entire transaction, silently rolling back everything else in the same paste, including the enum add itself. This happened for real in `20260927000000_mutual_job_completion.sql`: two new columns and four functions after the enum line all silently failed to apply, and the app broke for every job (not just ones using the new status) with the real error hidden behind a generic "not found," because the app code wasn't checking `.error` on that query. Split any migration like this into two files — one with just the `alter type` line, one with everything else — and give the exact run order.

Every new function in `public` is executable by `anon` (signed-out, via the anon key shipped in the app) unless you revoke it — Supabase grants EXECUTE to anon/authenticated by default. After every `create function`, decide who calls it: app RPC → `revoke all ... from public, anon;` + `grant execute ... to authenticated;`. Internal only (cron, triggers, helpers called from other functions) → `revoke all ... from public, anon, authenticated;`. Helpers used inside RLS policies must stay executable by `authenticated`. This was missed for months: `send_push_to_users` let anyone with no account push any text to any user (fixed in `20261012010000`).

Private per-user data (phone numbers, etc.) goes in an owner-only table (`profile_private`), not in a publicly-readable profile table hidden with column grants — column grants make every future column silently unreadable until granted.
