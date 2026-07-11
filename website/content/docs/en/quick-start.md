# Quick start

[繁體中文](../quick-start.md) · [Documentation home](../README.md)

This tutorial starts the frontend locally and verifies the codebase. A working Firebase and Supabase project is required for full behavior. Notifications, images, and Notion can be configured later.

## Prerequisites

- Node.js 24, matching CI
- npm and Git
- A Firebase Web App with Google sign-in enabled
- A Supabase project with this repository's migrations and Edge Functions

Docker is also required if you run the local Supabase stack.

## 1. Clone and install

```bash
git clone https://github.com/tavricccc/novae.git
cd novae
npm ci
```

## 2. Configure the frontend

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in the Firebase, Supabase, and allowed-domain values. Every `VITE_*` value is bundled for browsers; never put service-role keys, database passwords, or third-party secrets there. See the [configuration reference](configuration.md#frontend-environment-variables).

## 3. Start development

```bash
npm run dev
```

Open the URL printed by Vite. The sign-in email must match `VITE_ALLOWED_DOMAIN`, and the backend `ALLOWED_DOMAIN` must use the same value.

## 4. Verify the project

For routine changes:

```bash
npm run typecheck
npm run lint
npm run build
```

Before a pull request:

```bash
npm run verify:local
```

The full command checks types, unused declarations, lint, the production build, Edge Functions, architecture rules, and an offline production-dependency audit.

## 5. Optional local Supabase

```bash
npm run db:start
npm run db:reset:local
npm run db:lint:local
```

The local stack does not replace Firebase, Cloudinary, Notion, Upstash, or FCM. Use isolated development resources to test those integrations.

## Completion checklist

- The dev server starts without configuration errors.
- An account in the allowed domain completes sign-in and user sync.
- `npm run verify:local` passes.
- `.env` and all private credentials remain untracked.

See [troubleshooting](troubleshooting.md) for failures, or continue to the [deployment guide](deployment-guide.md).
