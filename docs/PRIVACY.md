# Privacy

Tuesday is self-hosted. The operator of an instance controls the database, uploaded files, backups and the configuration of every external service.

## What stays on your server

- Boards, items, updates, docs, dashboards, files and audit events.
- Accounts, sessions, notification preferences and API tokens (hashed).
- Backups, unless the operator configures an S3-compatible off-site target.
- Organisation memory embeddings, if enabled.

## What leaves your server

Only when the operator configures it:

| Destination           | Data                                                                 | When                                                         |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| OpenRouter (AI)       | The prompt and the board/item/doc content attached to that AI action | When a person uses an AI feature                             |
| SMTP provider         | Email address, name and the notification content                     | When Tuesday sends an invite, reset, mention, digest or test |
| OIDC provider         | Authentication request and verified email                            | When someone signs in with SSO                               |
| S3-compatible storage | Encrypted backup archives                                            | When a backup runs, if configured                            |
| Web push service      | Encrypted push payload and subscription endpoint                     | When a push notification is sent                             |
| Outbound webhooks     | The configured event payload, HMAC-signed                            | When an automation or inbound webhook delivery runs          |

Tuesday does not include analytics, advertising, telemetry or third-party runtime fonts/CDNs.

## AI-specific notes

- AI is off without `OPENROUTER_API_KEY`.
- Admins can cap spend, route models, disable memory and turn AI off entirely.
- Organisation memory is opt-in. Turning it off stops sending new text; existing vectors remain local until removed.
- `AI_FAKE=true` is a deterministic local mode for demos and tests. It makes no network calls.

## Data retention

- Audit log: 365 days by default.
- Email log: 90 days by default.
- Backups: controlled by `BACKUP_KEEP` locally and `BACKUP_S3_KEEP` off-site.
- Deleted items go to Trash; the operator controls the volume lifecycle.

## Operator responsibilities

The operator decides the lawful basis for processing, who can access an instance, whether AI or email is enabled, where backups are stored and how long data is kept. For a team deployment, publish an internal privacy notice that reflects those choices.

This document describes the software, not a legal contract. It is not legal advice.
