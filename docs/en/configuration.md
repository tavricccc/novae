# Configuration reference

[繁體中文](../configuration.md) · [Documentation home](../README.md)

This page covers versioned product rules: categories, visibility, rate limits, and images. Public environment variables and private deployment credentials now live in [environment and credentials](environment-configuration.md). Never move a value across their exposure boundary.

## Generated configuration

| Source | Controls |
| --- | --- |
| `config/issue-categories.config.json` | Categories, visibility, author display, support, and response deadlines |
| `config/rate-limits.config.json` | Action limits, image counts, and compression |

After editing either file:

```bash
npm run generate:all
git diff
```

Generated output is committed with its source. Typecheck, lint, and build also run generation first.

## Category schema

```json
{
  "id": "public-issues",
  "label": "公共議題",
  "readAccess": "reviewed-school",
  "authorVisible": false,
  "support": { "enabled": true, "goal": 50, "deadlineDays": 14 },
  "responseDeadlineDays": 7
}
```

`id` is a permanent unique identifier and must not be renamed or reused after launch. `label` is user-facing. `readAccess` accepts `school`, `reviewed-school`, or `owner-admin`. `authorVisible` controls display, not whether the backend retains author identity. Enabled support requires a positive `goal` and `deadlineDays`; `responseDeadlineDays` controls the management response target.

| Access value | Meaning |
| --- | --- |
| `school` | Any signed-in user in the allowed domain can read |
| `reviewed-school` | Author/admin before approval; school-wide after approval |
| `owner-admin` | Only the author and administrators can read |

Before removing a used category, inventory existing content, copies, search, and statistics. Add a forward migration to clean up or migrate data; never edit an already-deployed migration.

### Common combinations

| Combination | Typical content | User-visible result |
| --- | --- | --- |
| `school`, visible author, no support | Facility report | School users can read it and see the author; no support progress |
| `reviewed-school`, hidden author, support | Public issue | Admin review first; approval exposes anonymous content and a support deadline |
| `owner-admin`, visible author, no support | Rights case | Only author/admin can read; identity supports case follow-up |

Changing `authorVisible` cannot undo identity already seen or captured. A higher `goal` or shorter `deadlineDays` makes success harder. Test and communicate how changes apply to existing proposals; do not assume configuration changes are automatically retroactive.

## Rate limits and images

Each action limit has a numeric `limit` and a user-facing message. Per-second limits absorb bursts; hourly/daily limits manage abuse and cost. Check Edge, Redis, database, and vendor capacity before raising them.

`imageUploads` limits attachments by content type. `imageCompression` sets source size, pixel count, longest edge, target KB, WebP quality, and fallback scales. Browser checks improve UX; the backend still validates upload ownership, state, and Markdown references.

### Rate-limit behavior

| Key group | User or system effect when exceeded |
| --- | --- |
| `issueCreateDaily` | No more proposals that day |
| `commentCreateHourly` | Comments and replies pause temporarily |
| `imageUploadDaily` | No new image upload sessions that day |
| `loginSyncHourly`, `avatarCacheDaily` | Repeated profile synchronization/update pauses |
| `supportToggleHourly`, `announcementLikeHourly` | Support or like toggles pause temporarily |
| `pushTokenWriteHourly` | Device Push registration pauses; in-app notifications continue |
| `backendActionRead*` | General reads receive hourly and burst protection |
| `backendActionWrite*` | General writes receive hourly and burst protection |
| `backendActionSensitiveWrite*` | Deletion and sensitive writes use stricter limits |
| `backendActionAdminWrite*` | Administrator writes have an independent limit |
| `backendActionUploadResolve*` | Signed image resolution pauses and images may fail to load |
| `backendHealthcheck*` | Excess health probes are rejected |
| `cloudinaryWebhook*` | Excess image callbacks are rejected or delayed |
| `workerRun*` | Duplicate worker triggers are rejected |

Lower limits reduce abuse and cost but reject legitimate peaks more often. Messages should explain when to retry without disclosing internal defenses.

### Image behavior

`issueMaxImages`, `announcementMaxImages`, and `commentMaxImages` cap references per item. `maxSourceMegabytes` rejects oversized source files before expensive work. `maxDimension` limits the longest output edge. `maxUploadKilobytes` is the compression target, `webpQuality` is the first-pass quality, and `outputScales` are progressively smaller retries. Smaller values save bandwidth but can reduce readability and increase compression failures.

## Change checklist

- Regenerate and inspect committed output.
- Run Edge and architecture checks when contracts or schema are affected.
- Never commit secrets, production identifiers, or real user data.
- Update both language editions of affected documentation.
- Use a new migration for category removal or schema changes.
- Continue with [environment and credentials](environment-configuration.md) when configuring `.env`, GitHub, or deployment platforms.
