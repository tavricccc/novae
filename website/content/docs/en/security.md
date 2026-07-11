# Security and privacy model

[繁體中文](../security.md) · [Documentation home](../README.md)

This document describes current trust boundaries, controls, and adopter responsibilities. It is not an independent audit or compliance certification.

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request. Contact the repository owner privately using a method listed on their GitHub profile. Include the affected version/commit, prerequisites, impact, proof of concept, and suggested mitigation. Do not access data you do not own, disrupt production, or include real personal data or active credentials.

The project currently promises neither a response SLA nor a bounty. Maintainers will make a reasonable effort to acknowledge, remediate, and coordinate disclosure. Keep the report private until a fix is available.

## Security objectives

- Private proposals and author identities remain limited to authorized authors and admins.
- UI state, direct requests, and Realtime cannot grant administrative access.
- Service-role keys, passwords, service accounts, API secrets, and webhook secrets never enter browsers or Git.
- Webhooks, workers, and maintenance entry points verify their caller.
- Upload references, notifications, and deletion jobs cannot cross users or content.
- External side effects are traceable, retryable, and idempotent where practical.

## Trust boundaries

| Zone | Assumption | Controls |
| --- | --- | --- |
| Browser | Untrusted | Public config only; all important validation repeated server-side |
| Firebase | Identity issuer | Signature, project/audience, verified email, allowed domain |
| Edge Functions | Trusted compute | Action allowlist, roles, limits, idempotency, schema validation |
| Postgres | Source of truth and final policy | RLS, private schema, RPC, constraints, transactions |
| Vendors | Limited-trust processors | Least privilege, signatures, dedicated resources, failure isolation |
| GitHub Actions | Deployment control plane | Environment secrets, review gates, pinned tool versions |

## Authentication and authorization

A Firebase ID token proves identity, not authorization. The backend checks token validity, verified email, allowed domain, user state, and server-side administrator role. Client role state is never authoritative.

Sensitive operations pass through `backendAction` or a dedicated Function. Postgres RLS and private schemas provide defense in depth. Private author data is separated from public content, and Realtime events enforce recipient, author, publication, or administrator scope.

## Input, content, and media

Edge actions validate unknown input with explicit schemas. Rendered Markdown is sanitized, and upload references are checked before content writes. Images use authenticated uploads and signed delivery URLs. Browser compression is not a security boundary; backend quotas and ownership checks still apply. Webhooks validate signatures/secrets and are rate-limited.

## Credential handling

`VITE_*`, Firebase Web API keys, and Supabase publishable keys are public configuration. Service-role keys, database passwords, service-account JSON, Cloudinary secrets, Notion/Redis tokens, and webhook secrets belong only in deployment secret stores. Separate environments, use minimum scope, avoid logging credentials, and rotate after personnel changes, suspected exposure, or scheduled review.

## Browser and deployment controls

Vercel sets CSP, Permissions Policy, Referrer Policy, `nosniff`, and clickjacking protection. Service-worker and version metadata are not long-cached, while hashed assets are immutable. Review data flow before widening CSP for a new integration.

## Privacy responsibilities

Each adopter controls its deployment and must provide privacy notice, lawful basis, retention, data-subject request, and incident processes. Supabase, Firebase, Vercel, Cloudinary, Notion, and Upstash may process content or metadata; assess contracts, regions, and cross-border transfers.

Anonymous display is not anonymous collection. The system retains the author relationship for authorization, notifications, and administration.

## Known limitations

- Multiple vendors create partial-outage and control-plane risk.
- Administrator accounts are highly privileged and require strong Google account security.
- The Notion copy expands the processing surface and is not an audit log or encrypted backup.
- Current CSP allows broad HTTPS image, connection, and frame sources for integrations; adopters can narrow it to known hosts.
- Automated checks do not replace penetration testing, dependency monitoring, cloud configuration review, or incident exercises.

## Pre-launch checklist

- [ ] Protected branches and production reviewers are enabled.
- [ ] Production/development data and credentials are separate.
- [ ] Authorized domains and administrator lists are minimal.
- [ ] Every webhook has an independent high-entropy secret.
- [ ] RLS, migrations, Functions, and smoke tests pass.
- [ ] Cloudinary does not allow unauthenticated public writes.
- [ ] Logs and dashboards do not expose credentials or personal data.
- [ ] Backup, restore, deletion, and rotation have been exercised.
