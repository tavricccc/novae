# Environment and credentials

[繁體中文](../environment-configuration.md) · [Documentation home](../README.md) · [Product rules](configuration.md)

This page separates public environment variables bundled for browsers from private backend and deployment credentials. See the [from-scratch deployment guide](deployment-guide.md) for exact acquisition steps.

## Where values belong

| Type | Local development | Production and development | Exposure |
| --- | --- | --- | --- |
| `VITE_*` | Untracked `.env` | GitHub Environment secrets | Visible to browser users |
| Backend and deployment credentials | Never committed | GitHub, Supabase, or vendor secret settings | Controlled backend and deployment only |

Production and development must use separate resources and credentials. Never place a service-role key, database password, or third-party secret in a `VITE_*` value.

## Frontend environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_SCHOOL_NAME` | No | School name shown on startup and account screens; hidden when empty |
| `VITE_ALLOWED_DOMAIN` | Yes | Sign-in hint and client precheck |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase Web configuration |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase Web App ID |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | FCM sender ID |
| `VITE_FIREBASE_VAPID_KEY` | Yes | Web Push public key |
| `VITE_FIREBASE_APP_CHECK_ENABLED` | No | Enables App Check when `true` |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Conditional | Required with App Check |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key |

## Backend and deployment credentials

| Group | Names |
| --- | --- |
| Supabase | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` |
| Access | `ALLOWED_DOMAIN`, `ADMIN_EMAILS` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_WEBHOOK_SECRET` |
| Internal | `WEBHOOK_SECRET` |
| Notion | `NOTION_TOKEN`, `NOTION_DATABASE_ID`, optional `NOTION_VERSION` |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Vercel | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |

## Related values

`ADMIN_EMAILS` contains full addresses separated by ASCII commas. Keep `VITE_ALLOWED_DOMAIN` and `ALLOWED_DOMAIN` identical and enter only the text after `@`; administrators must belong to that domain.

`FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY` normally reuse their frontend counterparts. `CLOUDINARY_WEBHOOK_SECRET` reuses `CLOUDINARY_API_SECRET` for the current standard HMAC verification, while `WEBHOOK_SECRET` must be independently random. `GOOGLE_SERVICE_ACCOUNT_JSON` contains the complete JSON, not a file path.

Hosted Supabase Edge Functions inject `SUPABASE_URL`, so no GitHub secret is required. The release workflow writes `SUPABASE_SERVICE_ROLE_KEY` to Edge as `APP_SUPABASE_SERVICE_ROLE_KEY`.

## Completion checklist

- `.env` and credentials are not committed to Git.
- `VITE_ALLOWED_DOMAIN` and `ALLOWED_DOMAIN` match exactly.
- Production and development do not share databases, projects, or credentials.
- Complete the relevant checks in [quick start](quick-start.md) or [deployment](deployment-guide.md).
