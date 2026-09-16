@AGENTS.md

# Roadmap
Read TODO.md at the start of every session. Update it — move finished items, adjust anything that changed shape — before committing at the end of your session.

# Git
Always run `git push` right after `git commit` — a commit alone leaves work sitting local-only. Ten commits sat unpushed for a full session before this rule existed.

# Supabase migrations
`alter type ... add value` must be the ONLY statement in its own migration file, run by itself, whenever the same deployment also adds anything that references the new value (a function body, a later statement, etc.). The Supabase SQL Editor runs a whole pasted script as one implicit transaction, and `alter type ... add value` cannot commit inside a transaction block alongside other statements — it aborts the entire transaction, silently rolling back everything else in the same paste, including the enum add itself. This happened for real in `20260927000000_mutual_job_completion.sql`: two new columns and four functions after the enum line all silently failed to apply, and the app broke for every job (not just ones using the new status) with the real error hidden behind a generic "not found," because the app code wasn't checking `.error` on that query. Split any migration like this into two files — one with just the `alter type` line, one with everything else — and give the exact run order.
