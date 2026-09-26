import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';
import { resolveWindowsWslDistro } from './wsl.mjs';

const ownerUrl = new URL(process.env.DATABASE_OWNER_URL ?? 'postgresql://novae:novae-local@127.0.0.1:55432/novae');
const adminUrl = new URL(ownerUrl);
adminUrl.pathname = '/postgres';
const databaseName = `novae_search_verify_${process.pid}`;
const databaseUrl = new URL(ownerUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const database = new pg.Client({ connectionString: databaseUrl.toString() });
// A separately managed local environment may restart PostgreSQL while this runs.
// Let the active query reject and reach cleanup instead of an unhandled idle error.
admin.on('error', () => {});
database.on('error', () => {});
const migrations = (await readdir('database/migrations')).filter(name => /^\d+_.+\.sql$/u.test(name)).sort();
const target = '0050_indexed_content_author_search.sql';
const queries = {
  issues: `select app_api.backend_list_issues('searchIssues', 'bench-1', false, 'bench', 'active', 'latest',
    30, $1, null, null, null, null, array[]::text[], array[]::text[], array[]::text[]) as result`,
  facilities: `select app_api.backend_list_facilities('bench-1', false, array[]::text[], 'bench', 'active', '',
    $1, 'latest', null, null, null, 30) as result`,
};

async function measure(query, term) {
  const times = [];
  let plan;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await database.query(`explain (analyze, buffers, format json) ${query}`, [term]);
    plan = result.rows[0]['QUERY PLAN'][0];
    if (attempt > 0) times.push(plan['Execution Time']);
  }
  return { milliseconds: times.sort((a, b) => a - b)[1], sharedBlocks: plan.Plan['Shared Hit Blocks'] };
}

const distro = process.platform === 'win32' ? await resolveWindowsWslDistro() : null;
const keepalive = distro ? spawn('wsl.exe', ['-d', distro, '--', 'sh', '-lc', 'while :; do sleep 60; done'],
  { stdio: 'ignore', windowsHide: true }) : null;
try {
  await admin.connect();
  await admin.query(`create database ${databaseName}`);
  await database.connect();
  console.log(`Migrating isolated database ${databaseName}`);
  for (const name of migrations.filter(name => name < target)) {
    await database.query(await readFile(`database/migrations/${name}`, 'utf8'));
  }
  await database.query(`
    set session_replication_role = replica;
    insert into app_private.issue_categories(id,label,read_access,author_visible,is_active,created_by)
      values ('bench','Benchmark','school',true,true,'bench-1');
    insert into app_private.facility_categories(id,label,is_active,created_by)
      values ('bench','Benchmark',true,'bench-1');
    insert into app_private.user_profiles(uid,display_name)
      select 'bench-'||n, case when n=7 then 'NeedleAuthor' else 'Member '||n end from generate_series(1,12000) n;
    insert into app_private.issues(author_uid,title,title_search,content,status,category,read_access,author_visible,created_at)
      select 'bench-'||(n%12000+1), 'Proposal '||n, 'proposal '||n,
        repeat('Campus maintenance and student feedback. ',10)||case when n%1000=0 then 'NeedleContent' else '' end,
        'pending','bench','school',true,'2026-01-01'::timestamptz+n*interval '1 second'
      from generate_series(1,12000) n;
    insert into app_private.facility_reports(author_uid,title,title_search,location,content,category_id,created_at)
      select 'bench-'||(n%12000+1), 'Facility '||n, 'facility '||n, 'Building '||(n%20),
        repeat('Campus maintenance and student feedback. ',10)||case when n%1000=0 then 'NeedleContent' else '' end,
        'bench','2026-01-01'::timestamptz+n*interval '1 second'
      from generate_series(1,12000) n;
    set session_replication_role = origin;
    analyze app_private.issues; analyze app_private.facility_reports; analyze app_private.user_profiles;
  `);
  console.log('Seeded 12,000 proposals, 12,000 facilities and 12,000 profiles');
  const results = [];
  for (const [domain, query] of Object.entries(queries)) {
    for (const term of ['NeedleContent', 'NeedleAuthor']) {
      results.push({ domain, term, before: await measure(query, term),
        expected: (await database.query(query, [term])).rows[0].result });
    }
  }
  await database.query(await readFile(`database/migrations/${target}`, 'utf8'));
  await database.query('analyze app_private.issues; analyze app_private.facility_reports; analyze app_private.user_profiles');
  for (const entry of results) {
    const query = queries[entry.domain];
    assert.deepEqual((await database.query(query, [entry.term])).rows[0].result, entry.expected);
    const after = await measure(query, entry.term);
    console.log(JSON.stringify({ domain: entry.domain, term: entry.term, rows: 12000, profiles: 12000,
      before: entry.before, after }));
  }
  for (const [table, field, index] of [
    ['issues', 'content', 'issues_content_search_trgm_idx'],
    ['facility_reports', 'content', 'facility_reports_content_search_trgm_idx'],
    ['user_profiles', 'display_name', 'user_profiles_display_name_search_trgm_idx'],
  ]) {
    const result = await database.query(`explain (analyze, buffers, format json)
      select * from app_private.${table} where lower(coalesce(${field},'')) like $1`,
    [field === 'display_name' ? '%needleauthor%' : '%needlecontent%']);
    assert.ok(JSON.stringify(result.rows).includes(index), `${index} must be selected without disabling sequential scans`);
    console.log(`Planner selected ${index}`);
  }
  for (const name of migrations.filter(name => name > target)) {
    await database.query(await readFile(`database/migrations/${name}`, 'utf8'));
  }
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = 'novae_runtime';
  runtimeUrl.password = 'novae-runtime-local';
  const env = { ...process.env, DATABASE_URL: runtimeUrl.toString(), DATABASE_OWNER_URL: databaseUrl.toString() };
  const verification = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config',
    'vitest.integration.config.ts', 'tests/integration/issues.test.ts', 'tests/integration/facilities-announcements.test.ts',
    'tests/integration/operations-console.test.ts', '-t',
    'issue reads|facility ownership|operations settings|own proposal search'], { env, stdio: 'inherit' });
  assert.equal(verification.status, 0, 'Search visibility and progress permission regressions must pass');
  if (process.argv.includes('--generate-contracts')) {
    const generated = spawnSync(process.execPath, ['scripts/generate-database-contracts.mjs'], { env, stdio: 'inherit' });
    assert.equal(generated.status, 0);
  }
} finally {
  await database.end().catch(() => undefined);
  await admin.end();
  const cleanup = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${databaseName} with (force)`);
    console.log(`Removed temporary database ${databaseName}`);
  } finally {
    await cleanup.end();
    keepalive?.kill();
  }
}
