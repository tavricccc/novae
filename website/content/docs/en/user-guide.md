# User guide

[繁體中文](../user-guide.md) · [Documentation home](../README.md)

This guide covers student and administrator workflows. Category names, visibility, support thresholds, and deadlines are deployment-specific, so screens may differ from the examples.

## Roles

| Role | Typical capabilities |
| --- | --- |
| Visitor | Open sign-in; cannot read school content |
| School user | Browse authorized proposals/announcements, create, comment, support, manage own content and notifications |
| Author | Read own pending/private proposals and track their status |
| Administrator | Review proposals, update status, publish announcements, moderate content, view the dashboard |

Hidden UI is not authorization. Backend policy decides every protected operation.

## Sign in

Choose Google sign-in and use a verified account in the configured school domain. First sign-in synchronizes the user and role. PWA installation and Web Push permission are separate browser choices. After an administrator-role change, sign in again if the current token is stale.

## Browse and search

The board filters by category and status and searches proposal content. It only returns authorized records: `school` is school-wide, `reviewed-school` is author/admin-only until approval, and `owner-admin` always remains author/admin-only. A shared URL never bypasses these checks.

## Create a proposal

1. Open the create menu and choose proposal.
2. Select the category after reviewing its visibility and author-display behavior.
3. Write a title and Markdown body; add images if needed.
4. Preview and remove unnecessary names, contact details, or identity documents.
5. Submit into the public, review, or private flow chosen by the category.

| Configuration | Result for users |
| --- | --- |
| `readAccess: school` | Signed-in school users can browse it according to normal status/list rules |
| `readAccess: reviewed-school` | Starts pending; approval makes it school-visible and may enable support |
| `readAccess: owner-admin` | Never enters the school-wide board; remains accessible from the author's own proposals |
| `authorVisible: true` | Authorized readers see author information |
| `authorVisible: false` | Normal content views anonymize the author, while admins retain the relationship |

Images are compressed on-device and limited by source size, pixels, and per-content count.

## Support, comments, and status

Support appears only when `support.enabled` is true. Users can support or withdraw before `deadlineDays`; progress is measured against `goal`. Reaching the goal triggers the configured handling flow, not guaranteed adoption.

Comments support Markdown and limited images. Do not copy private-case details into a public discussion.

| Status | Meaning |
| --- | --- |
| Pending review | An administrator decides whether it becomes visible |
| Review rejected | Not published; author can read the reason |
| Processing | Work has started and may have a response deadline |
| Completed | Closed with an outcome explanation |
| Infeasible | Closed with an explanation of why it cannot proceed |

## Announcements and notifications

School users can read, like, and comment on announcements. Administrators create, edit, and delete them. Publishing may trigger in-app and Web Push delivery, so verify audience, dates, links, and title first.

The notification page stores in-app items and unread state. Opening an item rechecks target access. Web Push additionally requires browser support, OS permission, site permission, and a valid device token. Disabling Push does not disable in-app notifications.

## Administrator workflows

For review, verify category, public suitability, personal data, and media. Approve, or provide a specific actionable rejection reason. After approval, verify visibility, author display, and support behavior.

Move accepted work to processing. When closing it, choose completed or infeasible and write a clear outcome for users. The dashboard summarizes activity and integration health but is not an audit log; use the [operations runbook](operations.md) for incidents.

## Safety for users

- Check whether a category is public and whether it displays the author before posting.
- Anonymous display does not prevent administrators from identifying the author.
- Do not upload passwords, identity documents, medical data, or unnecessary third-party data.
- Do not expose private proposals in screenshots or public issues.
- Report access-control or disclosure problems through the [private security process](security.md#reporting-a-vulnerability).
