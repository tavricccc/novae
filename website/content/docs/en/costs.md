# Cost guide

[繁體中文](../costs.md) · [Documentation home](../README.md)

Novae has no fixed monthly price. Total cost combines Vercel, Supabase, Firebase/Google Cloud, Cloudinary, Notion, and Upstash plans and usage. Vendor prices change, so this page provides an estimation method rather than a price quote.

## Build a usage model

For each environment, estimate monthly active users, peak concurrency, reads and writes per user, image uploads/size/retention/views, Realtime connection time, Edge invocations, database storage and egress, push volume, Notion syncs, Redis commands, and fixed costs for production, development, preview, and recovery.

```text
monthly cost = fixed plan fees
             + usage beyond included requests / compute / storage / egress
             + backup, logs, domain, and taxes
             + 20–30% growth and peak headroom
```

## Main drivers

| Service | Drivers | Project controls |
| --- | --- | --- |
| Vercel | Builds and bandwidth | Static frontend, immutable assets |
| Supabase | Database, egress, Realtime, Edge, backup | Cursor pagination, counters, retention |
| Firebase / Google | Auth, FCM, App Check/reCAPTCHA | Domain restriction, topic/personal push split |
| Cloudinary | Storage, transformations, delivery | WebP compression, size limits, cleanup |
| Notion | Workspace/API constraints | Asynchronous and aggregated sync |
| Upstash | Commands and bandwidth | Layered limits and compact keys |

## Planning tiers

- **Pilot:** a single school with low image volume may fit free tiers, but verify backup, log retention, suspension, and production-use terms. Keep an upgrade and export plan.
- **Sustained school service:** budget explicitly for database/backup, media delivery, frontend bandwidth, and monitoring. Use a separate development stack and alerts at 50%, 75%, and 90%.
- **High activity or multiple organizations:** load-test and revisit data governance first. Multi-tenancy, enterprise SSO, and a formal SLA require engineering and operations beyond plan upgrades.

## Monthly review

Export usage and billing from each vendor, split it by environment, compare with budget and cost per active user, then investigate request, storage, egress, retry, and retention anomalies. Fix duplicate reads, runaway retries, oversized images, and stale data before upgrading. Record the lookup date and official pricing URL with every budget decision.

Verify free-tier production terms, egress and transformation pricing, backup/PITR and log add-ons, taxes/currency/education discounts, overage behavior, data regions, and deletion retention directly with vendors.

Official entry points: [Vercel](https://vercel.com/pricing), [Supabase](https://supabase.com/pricing), [Firebase](https://firebase.google.com/pricing), [Cloudinary](https://cloudinary.com/pricing), [Notion](https://www.notion.com/pricing), and [Upstash](https://upstash.com/pricing).
