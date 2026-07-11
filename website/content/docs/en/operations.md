# Operations runbook

[繁體中文](../operations.md) · [Documentation home](../README.md)

This runbook covers routine checks, incidents, and recovery. Provider logs may contain personal data or sensitive metadata; redact them before sharing.

## Service objectives

The project does not define an SLA. Operators should set targets for sign-in success, action error rate and p95 latency, outbox depth and oldest age, push/image/Notion failure rate, database capacity, and vendor usage.

## After every deployment

1. Confirm both GitHub Actions workflows succeeded.
2. Check the backend smoke test and maintenance response.
3. Test protected reads as a normal user and an administrator.
4. Create low-risk test content and verify write, Realtime, image, and notification paths.
5. Inspect the dashboard, Function logs, database health, and Vercel logs.
6. Observe at least one worker cycle and confirm the outbox is not accumulating.

## Routine cadence

| Frequency | Review |
| --- | --- |
| Daily | Sign-in/action errors, outbox backlog, Function failures, vendor incidents |
| Weekly | Image/Notion/FCM failures, database capacity, Redis usage, admin list |
| Monthly | Billing, credential use, dependency updates, retention, restore exercise |
| Each term | Domain, categories, thresholds, deadlines, owners, privacy notice |

## Incident response

1. Record scope, start time, environment, affected actions, and recent releases.
2. Preserve workflow runs, request IDs, redacted errors, and vendor status.
3. Stop the faulty release or trigger; do not reset data as a first response.
4. Isolate browser/Vercel, Firebase, Edge, Postgres, Redis, Cloudinary, Notion, or FCM.
5. Apply the smallest fix, run proportionate checks, and smoke-test.
6. Reprocess backlog only after confirming idempotency.
7. Record timeline, cause, impact, remediation, and prevention; follow organizational notification rules for data or credential incidents.

## Symptom guide

| Symptom | First check | Avoid |
| --- | --- | --- |
| All actions return 401/403 | Firebase project, domain, service account | Disabling authentication |
| Migration failure | First SQL error and migration history | Editing deployed migrations |
| Outbox stalled | Worker trigger, secret, provider, oldest event | Unlimited retries |
| Images stay pending | Webhook URL/secret, Cloudinary quota | Making resources public |
| Cost spike | Requests, storage, egress, retries, retention | Upgrading every service blindly |

See [troubleshooting](troubleshooting.md) for detailed checks.

## Retention, backup, and recovery

Cron and `maintenanceCleanup` apply retention to transient and failure data. Deletion can span Postgres, Cloudinary, and Notion state; do not delete from only one provider. Change retention with a new migration and updated privacy notice.

Use Supabase database backups appropriate to the plan. Treat Notion only as an operational copy. Account for Cloudinary assets with their database metadata. Exercise restore in an isolated environment monthly, record RPO/RTO gaps, rotate temporary credentials, run smoke tests, and prevent duplicate side effects when workers resume.

## Local maintenance commands

```bash
npm run verify:local
npm run db:start
npm run db:reset:local
npm run db:lint:local
```

These commands validate code or operate locally; they do not verify production vendor integrations.
