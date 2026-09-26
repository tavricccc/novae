import assert from "node:assert/strict";
import { processBackgroundJobs } from "../../cloudflare/src/backend/jobs/background-jobs.ts";
import { asRecord, underPolicies, database, integrationTest, seedActor, callAction, testEnvironment } from "./helpers.ts";
import { DEFAULT_OPERATION_POLICIES } from '../../cloudflare/generated/operations';
import { runMaintenance } from '../../cloudflare/src/backend/jobs/maintenance';
import { processInAppDeliveries } from '../../cloudflare/src/backend/jobs/notification-deliveries';
import { AppDatabaseClient } from '../../cloudflare/src/backend/database/client';
import { withRuntimeEnvironment } from '../../cloudflare/src/backend/shared/env';
import { beginNotionInvocation } from '../../cloudflare/src/backend/shared/notion-api';
import { REBUILD_REQUEST_BUDGET } from '../../cloudflare/src/backend/shared/notion-reconcile';
import type { Env } from '../../cloudflare/src/types';

integrationTest("production background consumer executes retention batches and preserves fresh notifications", async () => {
  const oldId = crypto.randomUUID();
  const freshId = crypto.randomUUID();
  await database.query(`insert into app_private.notifications
    (id, source, type, target_type, target_id, title, created_at, expires_at)
    values ($1, 'broadcast', 'announcement_created', 'announcement', $3, 'old', now()-interval '40 days', now()-interval '10 days'),
      ($2, 'broadcast', 'announcement_created', 'announcement', $3, 'fresh', now(), now()+interval '30 days')`,
  [oldId, freshId, crypto.randomUUID()]);
  const { error } = await database.call("app_api", "run_scheduled_maintenance_cleanup");
  if (error) throw error;
  await underPolicies(() => processBackgroundJobs(database));
  const rows = await database.query<{ id: string }>("select id from app_private.notifications where id = any($1::uuid[])", [[oldId, freshId]]);
  assert.deepEqual(rows.rows.map(row => row.id), [freshId]);
  const jobs = await database.query<{ affected_rows: number; status: string }>("select affected_rows,status from app_private.background_jobs where job_type='retention_cleanup'");
  assert.ok(jobs.rows.some(job => job.status === "completed" && job.affected_rows > 0));
});

integrationTest('operations settings enforce administrator access, revision conflicts and live UID limits', async () => {
  const admin = await seedActor('operations-admin', { roles: ['platform-admin'] });
  const user = await seedActor('operations-user');
  const other = await seedActor('operations-other');
  await underPolicies(() => runMaintenance(database));
  const snapshot = asRecord(await callAction('getOperationsConsole', {}, admin.auth));
  assert.ok(Number(snapshot.databaseBytes) > 0);
  assert.ok(Array.isArray(snapshot.capacity));
  const progress = asRecord(await callAction('getOperationsConsole', { progressOnly: true }, admin.auth));
  assert.deepEqual(Object.keys(progress), ['jobs']);
  assert.deepEqual(progress.jobs, snapshot.jobs);
  const metrics = snapshot.metrics as Array<{ bucket: unknown; databaseBytes: unknown }>;
  assert.match(String(metrics[0].bucket), /^\d{4}-\d{2}-\d{2}$/u);
  assert.ok(Number(metrics[0].databaseBytes) > 0);
  const diagnostics = asRecord(await callAction('getProviderDiagnostics', { provider: 'cloudflare' }, admin.auth));
  assert.equal(diagnostics.status, 'not-configured');
  await assert.rejects(() => callAction('getProviderDiagnostics', { provider: 'cloudflare' }, user.auth), /permission-denied/);
  await assert.rejects(() => callAction('getOperationsConsole', {}, user.auth), /permission-denied/);
  await assert.rejects(() => callAction('getOperationsConsole', { progressOnly: true }, user.auth), /permission-denied/);
  const runtime = asRecord(await callAction('getRuntimePolicies', {}, user.auth));
  assert.equal(runtime.revision, 1);
  assert.equal('backupIntervalHours' in asRecord(runtime.values), false);
  const update = { revision: 1, reason: 'Verify quota', values: { ...DEFAULT_OPERATION_POLICIES, preferenceWriteHourly: 1 } };
  await assert.rejects(() => callAction('saveOperationPolicies', update, user.auth), /permission-denied/);
  const saved = asRecord(await callAction('saveOperationPolicies', update, admin.auth));
  assert.equal(saved.revision, 2);
  await assert.rejects(() => callAction('saveOperationPolicies', update, admin.auth), /request-in-progress/);
  await callAction('markNotificationsOpened', {}, user.auth);
  await assert.rejects(() => callAction('markNotificationsOpened', {}, user.auth), /rate-limit.operation/);
  const independent = asRecord(await callAction('markNotificationsOpened', {}, other.auth));
  assert.ok(independent.openedAt);
  const rejectedId = crypto.randomUUID();
  await callAction('updatePlatformAdminNotificationPreferences', { preferences: {
    commentNotifications: true,
    facilityNotifications: false,
    issueNotifications: false,
  } }, admin.auth, rejectedId);
  await assert.rejects(() => callAction('updatePlatformAdminNotificationPreferences', { preferences: {
    commentNotifications: false,
    facilityNotifications: false,
    issueNotifications: false,
  } }, other.auth, rejectedId), /permission-denied/);
});

integrationTest('only administrators may retry failed operational work', async () => {
  const admin = await seedActor('retry-admin', { roles: ['platform-admin'] });
  const member = await seedActor('retry-member');
  const id = crypto.randomUUID();
  await database.query(`insert into app_private.background_jobs(id,job_type,status,last_attempt_id,error_detail)
    values($1,'deletion','failed',$2,'{"code":"upstream-unavailable"}'::jsonb)`, [id, crypto.randomUUID()]);
  await assert.rejects(() => callAction('retryOperationalWork', { kind: 'job', id }, member.auth), /permission-denied/);
  assert.equal(asRecord(await callAction('retryOperationalWork', { kind: 'job', id }, admin.auth)).success, true);
  const job = await database.query<{ status: string }>('select status from app_private.background_jobs where id=$1', [id]);
  assert.equal(job.rows[0].status,'pending');
  await assert.rejects(() => callAction('retryOperationalWork', { kind: 'job', id }, admin.auth), /validation-invalid/);
});

integrationTest('one retry covers every kind of failed work, and only for administrators', async () => {
  const admin = await seedActor('retry-all-admin', { roles: ['platform-admin'] });
  const member = await seedActor('retry-all-member');
  const firstJob = crypto.randomUUID();
  const secondJob = crypto.randomUUID();
  const backlogJob = crypto.randomUUID();
  for (const id of [firstJob, secondJob]) {
    await database.query(`insert into app_private.background_jobs(id,job_type,status,attempt_count,last_attempt_id,error_detail)
      values($1,'deletion','failed',3,$2,'{"message":"cloudinary refused"}'::jsonb)`, [id, crypto.randomUUID()]);
  }
  await database.query(`insert into app_private.external_cleanup_backlog(job_id,payload)
    values($1,'{"cloudinary_public_id":"orphan"}'::jsonb)`, [backlogJob]);

  await assert.rejects(() => callAction('retryOperationalWork', { kind: 'all' }, member.auth), /permission-denied/);
  const result = asRecord(await callAction('retryOperationalWork', { kind: 'all' }, admin.auth));
  assert.equal(result.success, true);
  assert.equal(result.jobs, 2);
  assert.equal(result.cleanup, 1);
  assert.equal(Number(result.retried) >= 3, true);

  const pending = await database.query<{ count: number }>(
    `select count(*)::integer as count from app_private.background_jobs
     where id = any($1) and status='pending' and attempt_count=0`, [[firstJob, secondJob, backlogJob]]);
  assert.equal(pending.rows[0].count, 3);
  assert.equal((await database.query<{ count: number }>(
    'select count(*)::integer as count from app_private.external_cleanup_backlog')).rows[0].count, 0);
  assert.equal((await database.query<{ count: number }>(
    `select count(*)::integer as count from app_private.background_jobs where status='failed'`)).rows[0].count, 0);
});

integrationTest('queueing a Notion rebuild clears what it supersedes and nothing else', async () => {
  const admin = await seedActor('notion-rebuild-admin', { roles: ['platform-admin'] });
  const member = await seedActor('notion-rebuild-member');
  await assert.rejects(() => callAction('rebuildNotionArchive', {}, member.auth), /permission-denied/);
  await assert.rejects(() => callAction('rebuildNotionArchive', {}, admin.auth), /service-not-configured/);

  // The residue an administrator sees on the operations screen before they ask
  // for a rebuild: a rebuild that failed, Notion deliveries waiting and failed
  // behind it, and a page mapping for a page they removed by hand.
  await callAction('createIssue', {
    category: 'public-issues',
    content: '重建前的提案內容',
    title: '重建前的提案',
  }, member.auth);
  await database.query(
    `update app_private.event_deliveries
     set status='failed', last_attempt_id=gen_random_uuid(),
       error_detail='{"message":"Too many subrequests"}'::jsonb
     where destination='notion' and status='pending'`);
  const staleRebuild = crypto.randomUUID();
  await database.query(`insert into app_private.background_jobs(id,job_type,status,attempt_count,last_attempt_id,error_detail)
    values($1,'notion_reconcile','failed',3,$2,'{"message":"Too many subrequests"}'::jsonb)`,
  [staleRebuild, crypto.randomUUID()]);
  await database.query(`insert into app_private.notion_pages(target_type,target_id,notion_page_id)
    values('issue',$1,'stale-notion-page')`, [crypto.randomUUID()]);

  const waitingIds = async (where: string) => (await database.query<{ id: string }>(
    `select id from app_private.event_deliveries
     where status in ('pending','failed') and ${where}`,
  )).rows.map((row) => row.id);
  const supersededNotion = await waitingIds(`destination='notion'`);
  const untouchedOthers = await waitingIds(`destination <> 'notion'`);
  assert.ok(supersededNotion.length > 0);

  const enabledEnvironment = { ...testEnvironment, NOTION_ENABLED: 'true' } as Env;
  const first = asRecord(await withRuntimeEnvironment(
    enabledEnvironment,
    () => callAction('rebuildNotionArchive', {}, admin.auth),
  ));
  assert.equal(first.success, true);
  const cleared = asRecord(first.cleared);
  assert.equal(cleared.deliveries, supersededNotion.length);
  assert.equal(cleared.jobs, 1);
  assert.ok(Number(cleared.mappings) >= 1);

  // Cleared when the administrator asks, not when the job first runs -- and
  // only Notion's queue: a push or in-app notification still waiting has
  // nothing to do with the archive. What the request itself records afterwards
  // is new work rather than residue.
  const remainingNotion = await waitingIds(`destination='notion'`);
  assert.deepEqual(remainingNotion.filter((id) => supersededNotion.includes(id)), []);
  assert.deepEqual(await waitingIds(`destination <> 'notion'`), untouchedOthers);
  assert.equal((await database.query<{ status: string }>(
    'select status from app_private.background_jobs where id=$1', [staleRebuild],
  )).rows[0].status, 'superseded');
  assert.equal((await database.query<{ count: number }>(
    'select count(*)::integer as count from app_private.notion_pages')).rows[0].count, 0);

  const second = asRecord(await withRuntimeEnvironment(
    enabledEnvironment,
    () => callAction('rebuildNotionArchive', {}, admin.auth),
  ));
  assert.notEqual(second.jobId, first.jobId);
  assert.equal((await database.query<{ status: string }>(
    'select status from app_private.background_jobs where id=$1', [first.jobId],
  )).rows[0].status, 'superseded');
  const jobs = await database.query<{ count: number }>(
    `select count(*)::integer as count from app_private.background_jobs
     where job_type='notion_reconcile' and status in ('pending','processing')`,
  );
  assert.equal(jobs.rows[0].count, 1);
});

integrationTest('Notion rebuild writes every page again, leaves existing pages alone, and resumes across passes', async () => {
  const baseUrl = process.env.NOTION_API_BASE_URL;
  assert.ok(baseUrl);
  await fetch(`${baseUrl}/__requests`, { method: 'DELETE' });
  const enabledEnvironment = { ...testEnvironment, NOTION_ENABLED: 'true' } as Env;
  const admin = await seedActor('notion-content-admin', { roles: ['platform-admin'] });
  const member = await seedActor('notion-content-member');

  const issueResult = asRecord(await callAction('createIssue', {
    category: 'public-issues',
    content: '需要完整保留的提案內容',
    title: 'Notion 完整提案',
  }, member.auth));
  const issueId = String(asRecord(issueResult.issue).id);
  await callAction('moderateIssueStatus', { issueId, status: 'pending' }, admin.auth);
  await callAction('createComment', { content: '重建後仍存在的提案留言', issueId }, member.auth);
  await callAction('createFacility', {
    categoryId: 'general',
    content: '設備案件內容',
    location: '教學大樓三樓',
    title: '投影機故障',
  }, member.auth);
  await callAction('createAnnouncement', {
    content: '公告完整內容',
    title: 'Notion 完整公告',
  }, admin.auth);

  const stalePages = await Promise.all(Array.from({ length: 101 }, async (_, index) =>
    await fetch(`${baseUrl}/v1/pages`, {
      body: JSON.stringify({
        parent: { data_source_id: 'mock-notion-datasource-id', type: 'data_source_id' },
        properties: { 'Novae ID': { rich_text: [{ text: { content: `stale:${index}` } }] } },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then((response) => response.json()) as { id: string },
  ));

  const waitingNotionDeliveries = async () => (await database.query<{ id: string }>(
    `select id from app_private.event_deliveries
     where destination='notion' and status in ('pending','failed')`,
  )).rows.map((row) => row.id);
  const supersededDeliveries = await waitingNotionDeliveries();
  assert.ok(supersededDeliveries.length > 0);

  let passes = 0;
  await withRuntimeEnvironment(enabledEnvironment, async () => {
    await callAction('rebuildNotionArchive', {}, admin.auth);
    for (; passes < 20; passes += 1) {
      beginNotionInvocation(REBUILD_REQUEST_BUDGET);
      if (!(await underPolicies(() => processBackgroundJobs(database))).hasMore) break;
    }
  });

  // The rebuild states the archive from the canonical record, so Notion's queue
  // is emptied rather than delivered on top of it. What the request itself
  // records afterwards is new work, not residue.
  const stillWaiting = await waitingNotionDeliveries();
  assert.deepEqual(stillWaiting.filter((id) => supersededDeliveries.includes(id)), []);
  const rebuild = await database.query<{ error_detail: unknown; estimated_rows: number; processed_rows: number; status: string }>(
    `select status, error_detail, estimated_rows::integer, processed_rows::integer from app_private.background_jobs
     where job_type='notion_reconcile' order by created_at desc limit 1`,
  );
  assert.equal(rebuild.rows[0].status, 'completed', JSON.stringify(rebuild.rows[0].error_detail));
  assert.ok(rebuild.rows[0].estimated_rows > 0);
  assert.equal(rebuild.rows[0].processed_rows, rebuild.rows[0].estimated_rows);

  type NotionTestProperty = {
    date?: { start?: string } | null;
    number?: number | null;
    rich_text?: Array<{ text?: { content?: string } }>;
    select?: { name?: string };
    title?: Array<{ text?: { content?: string } }>;
  };
  const state = await fetch(`${baseUrl}/__requests`).then((response) => response.json()) as {
    notionPageBlocks: Record<string, Array<Record<string, unknown>>>;
    notionPages: Record<string, { in_trash?: boolean; properties: Record<string, NotionTestProperty> }>;
  };
  // Removing what the workspace already holds is the administrator's own
  // decision: the rebuild only writes.
  assert.ok(stalePages.every((page) => state.notionPages[page.id].in_trash !== true));
  const staleIds = new Set(stalePages.map((page) => page.id));
  const activePages = Object.entries(state.notionPages).filter(([id]) => !staleIds.has(id));
  const issuePageEntry = activePages.find(([, page]) =>
    page.properties['Novae ID']?.rich_text?.[0]?.text?.content === `issue:${issueId}`);
  assert.ok(issuePageEntry);
  assert.equal(issuePageEntry[1].properties['狀態'].select?.name, '未回覆');
  assert.ok(issuePageEntry[1].properties['建立時間'].date?.start);
  assert.ok(issuePageEntry[1].properties['審核通過時間'].date?.start);
  assert.ok(issuePageEntry[1].properties['附議截止時間'].date?.start);
  assert.equal(issuePageEntry[1].properties['附議門檻'].number, 50);
  assert.ok(JSON.stringify(state.notionPageBlocks[issuePageEntry[0]]).includes('重建後仍存在的提案留言'));

  const announcement = activePages.find(([, page]) =>
    page.properties['名稱']?.title?.[0]?.text?.content === 'Notion 完整公告')?.[1];
  assert.ok(announcement);
  assert.equal(announcement.properties['狀態'].select?.name, '已發布');
  assert.ok(announcement.properties['發布時間'].date?.start);
  assert.equal(announcement.properties['按讚數'].number, 0);

  const facility = activePages.find(([, page]) =>
    page.properties['名稱']?.title?.[0]?.text?.content === '投影機故障')?.[1];
  assert.ok(facility);
  assert.equal(facility.properties['狀態'].select?.name, '待受理');
  assert.equal(facility.properties['地點'].rich_text?.[0]?.text?.content, '教學大樓三樓');
  assert.ok(facility.properties['建立時間'].date?.start);

  const operation = activePages.find(([, page]) =>
    page.properties['操作類型']?.rich_text?.[0]?.text?.content === '重建 Notion 封存')?.[1];
  assert.ok(operation);
  assert.equal(operation.properties['分類'].select?.name, '系統維運');
  assert.equal(operation.properties['狀態'].select?.name, '已記錄');
  assert.equal(operation.properties['操作領域'].rich_text?.[0]?.text?.content, '系統維運');
  assert.ok(!JSON.stringify(operation).includes('rebuildNotionArchive'));
});

integrationTest("production background consumer applies announcement policy to existing content", async () => {
  const admin = await seedActor("policy-consumer", { roles: ["platform-admin"] });
  const result = asRecord(await callAction("createAnnouncement", { title: "Policy test", content: "Policy content" }, admin.auth));
  const announcement = asRecord(result.announcement);
  await callAction('savePlatformFeatures', { issuesEnabled: true, facilitiesEnabled: true, announcementCommentsEnabled: false }, admin.auth);
  for (let batch = 0; batch < 10; batch += 1) {
    if (!(await underPolicies(() => processBackgroundJobs(database))).hasMore) break;
  }
  const content = await database.query<{ comments_enabled: boolean }>("select comments_enabled from app_private.announcements where id=$1", [announcement.id]);
  assert.equal(content.rows[0]?.comments_enabled, false);
  const job = await database.query<{ status: string }>("select status from app_private.background_jobs where job_type='category_policy' and payload->>'policyType'='announcement-comments' order by created_at desc limit 1");
  assert.equal(job.rows[0].status, "completed");
});

integrationTest('stale job claims cannot overwrite a newer claim, including manual retry', async () => {
  const admin = await seedActor('fencing-admin', { roles: ['platform-admin'] });
  const id = crypto.randomUUID();
  await database.query(`insert into app_private.background_jobs(id,job_type,status) values($1,'deletion','pending')`,[id]);
  const first = await database.call('app_api','claim_background_jobs',{requested_batch_size:100});
  if(first.error) throw first.error;
  const old = first.data.find(job=>job.id===id)!;
  await database.query(`select app_api.fail_background_job($1,$2,'{"code":"test-failure"}'::jsonb)`,[id,old.last_attempt_id]);
  await callAction('retryOperationalWork',{kind:'job',id},admin.auth);
  const next = await database.call('app_api','claim_background_jobs',{requested_batch_size:100});
  if(next.error) throw next.error;
  const current = next.data.find(job=>job.id===id)!;
  assert.notEqual(old.last_attempt_id,current.last_attempt_id);
  await assert.rejects(()=>database.query('select app_api.complete_background_job($1,$2)',[id,old.last_attempt_id]),/stale-work-claim/);
  await database.query('select app_api.complete_background_job($1,$2)',[id,current.last_attempt_id]);
  assert.equal((await database.query<{status:string}>('select status from app_private.background_jobs where id=$1',[id])).rows[0].status,'completed');
});

integrationTest('expired deletion logs retain compact external cleanup identifiers and can be retried', async () => {
  const admin = await seedActor('backlog-admin', { roles: ['platform-admin'] });
  const id = crypto.randomUUID();
  await database.query(`insert into app_private.background_jobs(id,job_type,status,payload,error_detail,last_attempt_id)
    values($1,'deletion','failed','{"cloudinary_public_id":"orphan-asset","target_type":"issue","target_id":"deleted"}',
    '{"message":"large provider failure"}',$2)`,[id,crypto.randomUUID()]);
  await database.query('delete from app_private.background_jobs where id=$1',[id]);
  const backlog = await database.query<{payload:Record<string,unknown>}>('select payload from app_private.external_cleanup_backlog where job_id=$1',[id]);
  assert.equal(backlog.rows[0].payload.cloudinary_public_id,'orphan-asset');
  assert.equal(backlog.rows[0].payload.error_detail,undefined);
  await callAction('retryOperationalWork',{kind:'cleanup',id},admin.auth);
  assert.equal((await database.query('select job_id from app_private.external_cleanup_backlog where job_id=$1',[id])).rows.length,0);
  assert.equal((await database.query<{status:string}>('select status from app_private.background_jobs where id=$1',[id])).rows[0].status,'pending');
});

integrationTest('expired unreferenced domain events release operation storage while fresh events remain', async () => {
  const operation = crypto.randomUUID();
  const event = crypto.randomUUID();
  await database.query(`insert into app_private.operations(operation_id,actor_uid,action,status,response,expires_at,created_at)
    values($1,'retention-test','createIssue','completed','{}',now()-interval '40 days',now()-interval '41 days')`,[operation]);
  await database.query(`insert into app_private.domain_events(event_id,operation_id,event_type,aggregate_type,aggregate_id,actor_uid,occurred_at)
    values($1,$2,'issue.created','issue','expired','retention-test',now()-interval '40 days')`,[event,operation]);
  await database.query('select app_api.run_scheduled_maintenance_cleanup()');
  for(let i=0;i<10;i++) if(!(await underPolicies(() => processBackgroundJobs(database))).hasMore) break;
  assert.equal((await database.query('select event_id from app_private.domain_events where event_id=$1',[event])).rows.length,0);
  assert.equal((await database.query('select operation_id from app_private.operations where operation_id=$1',[operation])).rows.length,0);
});

integrationTest('administrator user pages and custom restriction duration are enforced', async () => {
  const admin = await seedActor('pagination-admin',{roles:['platform-admin']});
  const member = await seedActor('restriction-member');
  await database.query(`insert into app_private.user_profiles(uid,display_name)
    select 'page-user-'||lpad(n::text,3,'0'),'Page user '||n from generate_series(1,101) n`);
  const first = asRecord(await callAction('listAdminUsers',{query:'page-user-',page:0},admin.auth));
  const second = asRecord(await callAction('listAdminUsers',{query:'page-user-',page:1},admin.auth));
  assert.equal((first.users as unknown[]).length,80);
  assert.equal(first.truncated,true);
  assert.equal((second.users as unknown[]).length,21);
  assert.equal(second.truncated,false);
  const start = Date.now();
  const result = asRecord(await callAction('saveAccountAccessRule',{targetType:'uid',targetValue:member.auth.uid,preset:'read_only',duration:'custom',durationHours:2,message:'Custom duration test'},admin.auth));
  const delta = Date.parse(String(result.expiresAt))-start;
  assert.ok(delta >= 7200000 && delta < 7210000);
  await assert.rejects(()=>callAction('saveAccountAccessRule',{targetType:'uid',targetValue:member.auth.uid,preset:'read_only',duration:'custom',durationHours:0,message:'Invalid'},admin.auth),/validation-invalid/);
  await assert.rejects(()=>callAction('saveAccountAccessRule',{targetType:'uid',targetValue:admin.auth.uid,preset:'blocked',duration:'custom',durationHours:2,message:'Denied'},admin.auth),/permission-denied/);
});

integrationTest('runtime content limits apply below the wider database safety ceilings', async () => {
  const admin = await seedActor('content-policy-admin',{roles:['platform-admin']});
  await callAction('saveOperationPolicies',{ revision:1,reason:'Content limits test',values:{...DEFAULT_OPERATION_POLICIES,titleLength:150,contentLength:7000}},admin.auth);
  const result = asRecord(await callAction('createAnnouncement',{title:'T'.repeat(150),content:'C'.repeat(6000)},admin.auth));
  assert.equal(String(asRecord(result.announcement).title).length,150);
  await assert.rejects(()=>callAction('createAnnouncement',{title:'T'.repeat(151),content:'Valid content'},admin.auth));
  await assert.rejects(()=>callAction('saveOperationPolicies',{revision:2,reason:'Beyond safety ceiling',values:{...DEFAULT_OPERATION_POLICIES,titleLength:201}},admin.auth),/validation-invalid/);
});

integrationTest('Notion metadata expiry queues external archival and disabled Notion cannot falsely complete it', async () => {
  const pageId = crypto.randomUUID();
  await database.query(`insert into app_private.notion_pages(target_type,target_id,notion_page_id,updated_at)
    values('system-log','old-event',$1,now()-interval '400 days')`,[pageId]);
  await underPolicies(() => runMaintenance(database));
  assert.equal((await database.query('select target_id from app_private.notion_pages where notion_page_id=$1',[pageId])).rows.length,0);
  const queued = await database.query<{id:string}>(`select id from app_private.background_jobs where payload->>'notion_page_id'=$1`,[pageId]);
  assert.equal(queued.rows.length,1);
  await underPolicies(() => processBackgroundJobs(database));
  const result = await database.query<{status:string;error_detail:unknown}>('select status,error_detail from app_private.background_jobs where id=$1',[queued.rows[0].id]);
  assert.equal(result.rows[0].status,'failed');
  assert.ok(JSON.stringify(result.rows[0].error_detail).includes('notion-not-configured'));
});

integrationTest('expired replay bodies are compacted without deleting audit identity or repeating a write', async () => {
  const admin = await seedActor('response-retention-admin',{roles:['platform-admin']});
  const id = crypto.randomUUID();
  const input = { title:'Compaction test',content:'Original saved content' };
  await database.query(`insert into app_private.operations(operation_id,actor_uid,action,status,created_at,updated_at,expires_at)
    values($1,$2,'createAnnouncement','processing',now()-interval '2 days',now()-interval '2 days',now())`,[id,admin.auth.uid]);
  await callAction('createAnnouncement',input,admin.auth,id);
  await database.query(`update app_private.operations set expires_at=now()-interval '1 day' where operation_id=$1`,[id]);
  await database.query('select app_api.run_scheduled_maintenance_cleanup()');
  for(let i=0;i<10;i++) if(!(await underPolicies(() => processBackgroundJobs(database))).hasMore) break;
  const row = await database.query<{response:unknown;response_expired:boolean}>('select response,response_expired from app_private.operations where operation_id=$1',[id]);
  assert.equal(row.rows[0].response,null);
  assert.equal(row.rows[0].response_expired,true);
  await assert.rejects(()=>callAction('createAnnouncement',input,admin.auth,id),/operation-expired/);
  assert.equal((await database.query('select id from app_private.announcements where title=$1',[input.title])).rows.length,1);
});

integrationTest('notification persistence failure leaves delivery failed instead of reporting success', async () => {
  const admin = await seedActor('notification-fault-admin',{roles:['platform-admin']});
  await callAction('createAnnouncement',{title:'Notification fault',content:'Notification fault content'},admin.auth);
  class FailingNotificationDatabase extends AppDatabaseClient {
    override query<T extends Record<string,unknown>>(sql: string,values: unknown[] = []) {
      if (/insert into app_private\.notifications/i.test(sql)) return Promise.reject(new Error('simulated-notification-storage-failure'));
      return super.query<T>(sql,values);
    }
  }
  const failing = new FailingNotificationDatabase(String(testEnvironment.DATABASE_URL));
  try { await underPolicies(() => processInAppDeliveries(failing,testEnvironment)); }
  finally { await failing.close(); }
  const rows = await database.query<{status:string;error_detail:unknown}>(`select status,error_detail from app_private.event_deliveries where destination='in_app'`);
  assert.ok(rows.rows.length > 0);
  assert.ok(rows.rows.every(row=>row.status==='failed'));
  assert.ok(rows.rows.some(row=>JSON.stringify(row.error_detail).includes('simulated-notification-storage-failure')));
});

integrationTest('a Notion rebuild replaces every legacy active rebuild before starting fresh', async () => {
  const admin = await seedActor('notion-replace-admin', { roles: ['platform-admin'] });
  const member = await seedActor('notion-replace-member');
  const enabledEnvironment = { ...testEnvironment, NOTION_ENABLED: 'true' } as Env;

  await assert.rejects(
    () => withRuntimeEnvironment(enabledEnvironment, () => callAction('rebuildNotionArchive', {}, member.auth)),
    /permission-denied/,
  );

  await callAction('createIssue', {
    category: 'public-issues',
    content: 'legacy notion delivery',
    title: 'legacy notion delivery',
  }, member.auth);
  await database.query(`update app_private.event_deliveries
    set status='failed', last_attempt_id=gen_random_uuid(), error_detail='{"message":"legacy notion failure"}'::jsonb
    where destination='notion' and status='pending'`);

  const failedRebuild = crypto.randomUUID();
  const pendingRebuild = crypto.randomUUID();
  const processingRebuild = crypto.randomUUID();
  const notionDeletion = crypto.randomUUID();
  const cloudDeletion = crypto.randomUUID();
  const notionBacklog = crypto.randomUUID();
  const cloudBacklog = crypto.randomUUID();
  await database.query(`insert into app_private.background_jobs
    (id,job_type,status,attempt_count,last_attempt_id,locked_at,error_detail,payload)
    values
      ($1,'notion_reconcile','failed',3,gen_random_uuid(),null,'{"message":"legacy"}'::jsonb,'{}'::jsonb),
      ($2,'notion_reconcile','pending',0,null,null,null,'{}'::jsonb),
      ($3,'notion_reconcile','processing',1,gen_random_uuid(),now(),null,'{}'::jsonb),
      ($4,'deletion','failed',3,gen_random_uuid(),null,'{"message":"notion delete failed"}'::jsonb,'{"notion_page_id":"old-page","target_type":"issue","target_id":"old"}'::jsonb),
      ($5,'deletion','failed',3,gen_random_uuid(),null,'{"message":"cloud delete failed"}'::jsonb,'{"cloudinary_public_id":"keep-me","target_type":"upload","target_id":"old"}'::jsonb)`,
    [failedRebuild, pendingRebuild, processingRebuild, notionDeletion, cloudDeletion]);
  await database.query(`insert into app_private.external_cleanup_backlog(job_id,payload) values
    ($1,'{"notion_page_id":"old-page","target_type":"issue","target_id":"old"}'::jsonb),
    ($2,'{"cloudinary_public_id":"keep-me","target_type":"upload","target_id":"old"}'::jsonb)`,
    [notionBacklog, cloudBacklog]);
  await database.query(`insert into app_private.notion_pages(target_type,target_id,notion_page_id)
    values('issue',$1,'legacy-page')`, [crypto.randomUUID()]);

  const first = asRecord(await withRuntimeEnvironment(
    enabledEnvironment,
    () => callAction('rebuildNotionArchive', {}, admin.auth),
  ));
  const cleared = asRecord(first.cleared);
  assert.equal(cleared.jobs, 4);
  assert.equal(cleared.cleanup, 1);
  assert.ok(Number(cleared.deliveries) > 0);
  assert.equal(cleared.mappings, 1);

  const oldJobs = await database.query<{ id: string; status: string }>(
    'select id,status from app_private.background_jobs where id = any($1::uuid[]) order by id',
    [[failedRebuild, pendingRebuild, processingRebuild, notionDeletion]],
  );
  assert.equal(oldJobs.rows.length, 4);
  assert.ok(oldJobs.rows.every((job) => job.status === 'superseded'));
  assert.equal((await database.query<{ status: string }>(
    'select status from app_private.background_jobs where id=$1', [cloudDeletion],
  )).rows[0].status, 'failed');
  assert.deepEqual((await database.query<{ job_id: string }>(
    'select job_id from app_private.external_cleanup_backlog order by job_id',
  )).rows.map((row) => row.job_id), [cloudBacklog]);

  const firstJobId = String(first.jobId);
  const activeAfterFirst = await database.query<{ id: string }>(`
    select id from app_private.background_jobs
    where job_type='notion_reconcile' and status in ('pending','processing')`);
  assert.deepEqual(activeAfterFirst.rows.map((row) => row.id), [firstJobId]);

  const second = asRecord(await withRuntimeEnvironment(
    enabledEnvironment,
    () => callAction('rebuildNotionArchive', {}, admin.auth),
  ));
  const secondJobId = String(second.jobId);
  assert.notEqual(secondJobId, firstJobId);
  assert.equal((await database.query<{ status: string }>(
    'select status from app_private.background_jobs where id=$1', [firstJobId],
  )).rows[0].status, 'superseded');
  const activeAfterSecond = await database.query<{ id: string }>(`
    select id from app_private.background_jobs
    where job_type='notion_reconcile' and status in ('pending','processing')`);
  assert.deepEqual(activeAfterSecond.rows.map((row) => row.id), [secondJobId]);
});

integrationTest('administrators can clear Worker error records and scheduled background work', async () => {
  const admin = await seedActor('operations-clear-admin', { roles: ['platform-admin'] });
  const member = await seedActor('operations-clear-member');
  await database.query(`insert into app_private.operational_errors(action,code,status,operation_id) values
    ('legacy-one','internal',500,$1),('legacy-two','internal',500,$2)`,
    [crypto.randomUUID(), crypto.randomUUID()]);

  await assert.rejects(() => callAction('clearOperationalErrors', {}, member.auth), /permission-denied/);
  const errors = asRecord(await callAction('clearOperationalErrors', {}, admin.auth));
  assert.ok(Number(errors.cleared) >= 2);
  assert.equal((await database.query<{ count: number }>(
    'select count(*)::integer as count from app_private.operational_errors',
  )).rows[0].count, 0);

  const pending = crypto.randomUUID();
  const failed = crypto.randomUUID();
  const completed = crypto.randomUUID();
  const backlog = crypto.randomUUID();
  await database.query(`insert into app_private.background_jobs
    (id,job_type,status,attempt_count,last_attempt_id,error_detail,completed_at,payload)
    values
      ($1,'notion_reconcile','pending',0,null,null,null,'{}'::jsonb),
      ($2,'deletion','failed',3,gen_random_uuid(),'{"message":"failed"}'::jsonb,null,'{}'::jsonb),
      ($3,'deletion','completed',1,gen_random_uuid(),null,now(),'{}'::jsonb)`,
    [pending, failed, completed]);
  await database.query(`insert into app_private.external_cleanup_backlog(job_id,payload)
    values($1,'{"cloudinary_public_id":"old"}'::jsonb)`, [backlog]);

  await assert.rejects(() => callAction('clearScheduledWork', {}, member.auth), /permission-denied/);
  const schedules = asRecord(await callAction('clearScheduledWork', {}, admin.auth));
  assert.equal(schedules.jobs, 2);
  assert.equal(schedules.cleanup, 1);
  assert.equal(schedules.cleared, 3);
  const statuses = await database.query<{ id: string; status: string }>(
    'select id,status from app_private.background_jobs where id = any($1::uuid[]) order by id',
    [[pending, failed, completed]],
  );
  const byId = new Map(statuses.rows.map((row) => [row.id, row.status]));
  assert.equal(byId.get(pending), 'superseded');
  assert.equal(byId.get(failed), 'superseded');
  assert.equal(byId.get(completed), 'completed');
  assert.equal((await database.query<{ count: number }>(
    'select count(*)::integer as count from app_private.external_cleanup_backlog',
  )).rows[0].count, 0);
});
