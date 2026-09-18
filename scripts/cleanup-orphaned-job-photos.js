// One-time cleanup for job-photos Storage files left behind by every job
// deleted before 20260929000000_job_deletion.sql's fix landed: deleting a
// job only ever cleared the job_photos DB rows (via jobs.id's on-delete
// cascade), never the actual files in Storage, since that requires a real
// Storage API call, not something a plain SQL cascade can do. This script
// only cleans up what's ALREADY orphaned -- job deletions going forward are
// handled by job/[id]/index.tsx's handleDelete() itself.
//
// Needs the SERVICE ROLE key (Supabase dashboard -> Settings -> API ->
// service_role), NOT the anon key already in .env -- it has to bypass RLS
// to find and delete files under jobs that no longer exist (the bucket's
// own delete policy requires a matching jobs row, which an orphan by
// definition doesn't have). Never commit that key or put it in .env --
// pass it inline so it only ever lives in this one invocation:
//
//   SUPABASE_SERVICE_ROLE_KEY=<paste> node scripts/cleanup-orphaned-job-photos.js --dry-run
//
// Run with --dry-run first to see what it WOULD delete without deleting
// anything, then drop the flag to actually delete.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const LIST_PAGE_SIZE = 100;

function readSupabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env');
  const contents = fs.readFileSync(envPath, 'utf8');
  const match = contents.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL not found in .env');
  }
  return match[1].trim();
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error(
    'Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Settings -> API -> service_role) and re-run, e.g.:\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=<paste> node scripts/cleanup-orphaned-job-photos.js --dry-run'
  );
  process.exit(1);
}

const supabase = createClient(readSupabaseUrl(), serviceRoleKey);

// list() caps out at 100 entries per call regardless of what's asked for,
// so anything beyond the first page needs paging via offset.
async function listAll(folderPath) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from('job-photos')
      .list(folderPath, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw error;
    all.push(...data);
    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }
  return all;
}

async function main() {
  const { data: jobs, error: jobsError } = await supabase.from('jobs').select('id');
  if (jobsError) throw jobsError;
  const existingJobIds = new Set(jobs.map((job) => job.id));

  const entries = await listAll('');
  // entry.id is null only for a "folder" (no object of its own) -- every
  // real upload path is <job-id>/<filename>, so a folder here is a job id.
  // A non-null id would mean a stray file sitting at the bucket root, which
  // shouldn't happen; skip it rather than mistaking its name for a job id.
  const orphanFolders = entries.filter((entry) => entry.id === null && !existingJobIds.has(entry.name));

  if (orphanFolders.length === 0) {
    console.log('No orphaned job-photos folders found.');
    return;
  }

  console.log(`Found ${orphanFolders.length} orphaned job folder(s):`);

  let totalFiles = 0;
  for (const folder of orphanFolders) {
    const files = await listAll(folder.name);
    console.log(`  ${folder.name}/ -- ${files.length} file(s)`);
    totalFiles += files.length;

    if (!DRY_RUN && files.length > 0) {
      const paths = files.map((file) => `${folder.name}/${file.name}`);
      const { error: removeError } = await supabase.storage.from('job-photos').remove(paths);
      if (removeError) throw removeError;
    }
  }

  console.log(
    DRY_RUN
      ? `\nDry run -- ${totalFiles} file(s) across ${orphanFolders.length} folder(s) would be deleted. Re-run without --dry-run to actually delete them.`
      : `\nDeleted ${totalFiles} file(s) across ${orphanFolders.length} orphaned folder(s).`
  );
}

main().catch((error) => {
  console.error('Cleanup failed:', error.message);
  process.exit(1);
});
