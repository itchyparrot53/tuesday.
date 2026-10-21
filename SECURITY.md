# Security policy

## Supported versions

| Version | Supported                 |
| ------- | ------------------------- |
| `0.1.x` | Yes — current public beta |
| `< 0.1` | No                        |

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.**

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/itchyparrot53/tuesday./security/advisories/new>

If private reporting is unavailable, contact the maintainers through GitHub and ask for a private channel before sharing details.

Please include:

- affected version or commit,
- deployment shape (Docker, reverse proxy, single node),
- steps to reproduce,
- impact and any known exploitation,
- a minimal proof of concept if safe,
- whether you want credit.

We aim to acknowledge within 72 hours and to agree a disclosure timeline. Please give us a reasonable window to ship a fix before publishing details.

## Scope

In scope:

- authentication, sessions, CSRF and permission bypasses,
- board, item, doc, dashboard, file and AI-context access control,
- SQL injection, XSS, SSRF and unsafe file upload handling,
- webhook signing and replay issues,
- secret exposure in the app or repository,
- privilege escalation through invites, guests, SSO or API tokens,
- backup/restore path traversal or archive handling.

Out of scope:

- denial of service from a single authenticated user on their own instance,
- misconfiguration by the operator (for example exposing the app over plain HTTP),
- vulnerabilities in a model provider or SMTP provider,
- social engineering,
- issues that require an already-compromised host.

## Safe harbour

We will not pursue legal action for good-faith research that stays within this scope, avoids privacy violations and does not degrade other people's instances. Do not test against instances you do not own or have permission to test.

## Operator hardening checklist

- Put Tuesday behind HTTPS and set `APP_URL`, `COOKIE_SECURE=true` and `TRUST_PROXY=true`.
- Keep `.env`, the `/data` volume and backups private; encrypt off-site copies (`BACKUP_ENCRYPTION_KEY`).
- Use a dedicated OpenRouter key with a budget; leave AI off if you do not need it.
- Keep `WEBHOOKS_ALLOW_PRIVATE=false` unless you deliberately need private-network webhooks.
- Run the restore drill before trusting a backup.
- Subscribe to GitHub security advisories and keep the image updated.
- Never enable `AI_FAKE`, `MAIL_FAKE`, `PUSH_FAKE` or `BACKUP_S3_FAKE` in production.

## Security design notes

- Sessions are HttpOnly cookies with hashed server-side tokens and CSRF protection.
- Board, item, doc, dashboard, file, AI-tool, SSE and notification access is checked server-side.
- Outbound webhooks are HMAC-SHA256 signed and retried through the job queue.
- Off-site backups are encrypted with AES-256-GCM.
- Audit events are append-only through the API and retained for 365 days by default.
