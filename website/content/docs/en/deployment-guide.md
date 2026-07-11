# Deployment guide

[繁體中文](../deployment-guide.md) · [Documentation home](../README.md)

This guide creates a production stack using Vercel, Supabase, Firebase, Cloudinary, Notion, and Upstash. Review the [configuration reference](configuration.md) and [security model](security.md) first.

## 0. Choose an environment strategy

- `main` uses the GitHub `production` Environment; `dev` uses `development`.
- Give each environment separate vendor projects and credentials.
- Assign a primary service owner and a backup administrator.

## 1. Fork and protect the repository

Fork `tavricccc/novae`, require the `Verify PR` check on protected branches, and create `production` and `development` under **Settings → Environments**. Require reviewers for production where possible.

## 2. Create Firebase resources

1. Create a project and Web App.
2. Enable the Google provider in Authentication and add authorized domains.
3. Create a Cloud Messaging Web Push certificate and save the public VAPID key.
4. Optionally register the Web App with App Check and reCAPTCHA Enterprise.
5. Create a service-account JSON for token verification and FCM.

Web configuration is public. Service-account JSON must never enter Git or a frontend variable.

## 3. Create Supabase resources

Create a project and save its ref, database password, publishable key, service-role key, and CLI access token. Do not manually create application tables; the deployment workflow applies migrations.

## 4. Create integration resources

- **Cloudinary:** create a dedicated cloud and save cloud name, API key, API secret, and a high-entropy webhook secret. After backend deployment, point notifications to `https://<PROJECT_REF>.supabase.co/functions/v1/cloudinaryWebhook`.
- **Notion:** create an internal integration and dedicated database, share the database with the integration, and save token/database ID. This is an operational copy, not disaster-recovery backup.
- **Upstash:** create a Redis database and save its REST URL and token. Do not share it across environments.

## 5. Connect Vercel

Create and link a Vercel project, then save project ID, org ID, and a least-privilege deployment token. Let GitHub Actions own deployments to avoid duplicate Git-based releases.

## 6. Add GitHub Environment secrets

Add all frontend/Vercel names and all backend names listed in the [configuration reference](configuration.md). Populate both GitHub Environments with their own values. Optional display names and `NOTION_VERSION` may use project defaults; App Check fields are conditional when App Check is disabled.

## 7. First release

1. Manually run **Deploy Supabase Backend** for `main`.
2. Confirm migrations, function deployment, `backendAction` healthcheck, and cleanup all pass.
3. Configure the Cloudinary webhook URL and matching secret.
4. Run **Deploy Frontend to Vercel**.
5. Add the production hostname to Firebase authorized domains, App Check/reCAPTCHA, and Vercel.

Later pushes to `main` or `dev` trigger workflows based on changed paths.

## 8. Acceptance checklist

- Unauthenticated and wrong-domain users cannot read school content.
- User, author, and administrator visibility matches each category.
- Proposal creation, review, comments, support, and status updates work.
- Images survive refresh and no private upload credential appears in responses.
- In-app notifications, Web Push, Notion synchronization, and dashboard data work.
- Function logs show no persistent failures and Vercel responses include security headers.

## 9. Recovery and destructive workflows

Redeploy a known-good commit for frontend recovery. Database migrations are forward-only: add a corrective migration instead of editing or rolling back deployed files. An older Function may be deployed only if it supports the current schema.

The database and Cloudinary reset workflows destroy data. Use them in production only with verified backups, explicit approval, and a maintenance window. Follow the [operations runbook](operations.md) before considering a reset.
