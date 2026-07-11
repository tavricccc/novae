# Project overview

[繁體中文](../project-overview.md) · [Documentation home](../README.md)

The Novae (Novae) is a self-hosted web application for submitting, discussing, supporting, and tracking issues within a school community. It combines public proposals, private rights cases, facility reports, announcements, and notifications while keeping identities and sensitive data behind controlled boundaries.

## Why this project exists

Forms and social posts are easy to publish but hard to track. Novae adds configurable categories, review, status, response deadlines, support thresholds, notifications, operational copies, and administrative visibility so students and administrators can work from the same traceable record.

## Core capabilities

| Area | Capability |
| --- | --- |
| Identity | Google sign-in restricted to a verified school domain; server-managed admin roles |
| Proposals | Categories, search, comments, sharing, review, status, and deadlines |
| Privacy | School-wide, reviewed school-wide, or owner-and-admin access per category |
| Support | Optional category-specific thresholds, deadlines, cancellation, and live progress |
| Announcements | Admin publishing and editing; user likes and comments |
| Notifications | In-app notifications and personal or topic-based Web Push |
| Media | Browser WebP compression, signed upload, and expiring signed delivery URLs |
| Operations | Admin dashboard, background jobs, retention, failure tracking, and automated deployment |

## Good fit

- Student unions or school organizations that need proposals and support thresholds.
- Teams handling both public issues and confidential student-rights cases.
- Small teams willing to operate a managed-cloud deployment.
- Developers studying a production-oriented Vue, Supabase, and Firebase Auth integration.

## Not a good fit

- Environments that prohibit third-party cloud services or require fully offline hosting.
- Statutory complaints, digital signatures, official document exchange, or non-repudiation audits.
- Multi-tenant billing, cross-school isolation, or enterprise identity governance.
- Deployments with no owner for vendors, credentials, billing, backups, and incidents.

## Ownership and boundaries

Novae is deployable software, not a hosted service. Adopters create and operate their own Firebase, Supabase, Vercel, Cloudinary, Notion, and Upstash resources. They remain responsible for applicable law, consent and notice, retention, administrator appointments, billing, and incident response.

The current design assumes one school, one allowed email domain, and one administrator group. Firebase is limited to sign-in, App Check, and messaging. Supabase owns primary data and domain behavior, Cloudinary stores images, and Notion is an operational copy rather than the source of truth.

## Maturity and non-goals

The repository includes type checking, linting, production builds, Edge Function checks, architecture regression tests, and separate frontend/backend delivery workflows. These controls reduce deployment risk; they are not an SLA, security certification, or compliance certification. The project does not currently promise a stable public API.

Next: [Quick start](quick-start.md) · [Architecture](architecture.md) · [Deployment guide](deployment-guide.md)
