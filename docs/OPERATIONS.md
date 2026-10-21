# Tuesday operations runbook

Tuesday is a single-node, self-hosted app: Fastify + SQLite (WAL) + a React PWA. This runbook covers install, upgrade, configuration, backups, monitoring and recovery.

## Install

```bash
git clone <your repo> tuesday && cd tuesday
cp .env.example .env      # edit the values below
docker compose up -d --build
```

Open `APP_URL`. The first visit goes through `/setup` (account, organisation, starter board, invites). Migrations in `server/db/migrations/` run automatically on start and are recorded in `_migrations`.

## Upgrade

```bash
# take a backup first (Admin → Data, or wait for the nightly one)
git pull
docker compose up -d --build
```

Migrations are additive and idempotent. `tests/upgrade.test.ts` proves data written at the Part 3B schema (`010_review_design.sql`) survives every later migration. Run `npm run smoke` after an upgrade.

## Configuration reference

| Variable                      | Default                             | What it does                                                                             |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `PORT`                        | `3000`                              | Server port inside the container.                                                        |
| `DATABASE_PATH`               | `./data/tuesday.db`                 | SQLite file (Docker uses `/data/tuesday.db`).                                            |
| `APP_URL`                     | `http://localhost:3000`             | Public URL used in links, invite and reset emails, OIDC redirects.                       |
| `COOKIE_SECURE`               | `false`                             | Set `true` when served over HTTPS.                                                       |
| `LOG_LEVEL`                   | `info`                              | `fatal`, `error`, `warn`, `info` or `debug`.                                             |
| `OPENROUTER_API_KEY`          | empty                               | Enables AI. Empty runs without AI.                                                       |
| `OPENROUTER_DEFAULT_MODEL`    | `deepseek/deepseek-v4.1-flash-1017` | Default model tier.                                                                      |
| `OPENROUTER_FAST_MODEL`       | `deepseek/deepseek-v4.1-flash-1017` | Fast tier model.                                                                         |
| `AI_FAKE`                     | `false`                             | Deterministic fake AI, for demos/tests only.                                             |
| `UPLOADS_DIR`                 | `./data/uploads`                    | File uploads (Docker: `/data/uploads`).                                                  |
| `MAX_UPLOAD_MB`               | `25`                                | Maximum upload size.                                                                     |
| `BACKUP_DIR`                  | `./data/backups`                    | Local backup archives (Docker: `/data/backups`).                                         |
| `BACKUP_KEEP`                 | `7`                                 | Local backups kept; 0 disables automatic backups.                                        |
| `BACKUP_HOUR`                 | `3`                                 | Hour (0–23, org timezone) for the nightly backup.                                        |
| `WEBHOOKS_ALLOW_PRIVATE`      | `false`                             | Allow webhooks to private/loopback addresses.                                            |
| `SMTP_HOST`                   | empty                               | SMTP host; Purelymail uses `smtp.purelymail.com`.                                        |
| `SMTP_PORT`                   | `465`                               | Implicit TLS port.                                                                       |
| `SMTP_SECURE`                 | `true` when port 465                | Implicit TLS on/off.                                                                     |
| `SMTP_FALLBACK_PORT`          | `587`                               | One STARTTLS retry port on connection errors; 0 disables.                                |
| `SMTP_USER`                   | empty                               | Full mailbox address.                                                                    |
| `SMTP_PASS`                   | empty                               | Mailbox password. Never commit it.                                                       |
| `MAIL_FROM`                   | `Tuesday <SMTP_USER>`               | From header.                                                                             |
| `MAIL_FAKE`                   | `false`                             | Capture mail in memory instead of sending.                                               |
| `OIDC_ISSUER`                 | empty                               | OpenID Connect issuer URL.                                                               |
| `OIDC_CLIENT_ID`              | empty                               | OIDC client id.                                                                          |
| `OIDC_CLIENT_SECRET`          | empty                               | OIDC client secret.                                                                      |
| `OIDC_BUTTON_LABEL`           | `Sign in with SSO`                  | Login button label.                                                                      |
| `OIDC_ALLOWED_DOMAINS`        | empty                               | Comma-separated domains that may join without an invite.                                 |
| `OIDC_DEFAULT_ROLE`           | `member`                            | Role for allowed-domain joins (`member` or `viewer`).                                    |
| `OIDC_ONLY`                   | `false`                             | Hide password login for everyone except the owner.                                       |
| `TRUST_PROXY`                 | `false`                             | Trust `X-Forwarded-For` from a reverse proxy.                                            |
| `VAPID_PUBLIC_KEY`            | empty                               | Web-push key; empty generates one and stores it in the DB.                               |
| `VAPID_PRIVATE_KEY`           | empty                               | Web-push private key; never expose it.                                                   |
| `VAPID_SUBJECT`               | `mailto:{MAIL_FROM}`                | Push contact (mailto: or URL).                                                           |
| `PUSH_FAKE`                   | `false`                             | Record push payloads instead of sending.                                                 |
| `BACKUP_S3_ENDPOINT`          | empty                               | S3-compatible endpoint (R2, B2, MinIO, Wasabi, S3).                                      |
| `BACKUP_S3_REGION`            | `auto`                              | S3 region.                                                                               |
| `BACKUP_S3_BUCKET`            | empty                               | Bucket name.                                                                             |
| `BACKUP_S3_ACCESS_KEY_ID`     | empty                               | S3 access key id.                                                                        |
| `BACKUP_S3_SECRET_ACCESS_KEY` | empty                               | S3 secret key.                                                                           |
| `BACKUP_S3_PREFIX`            | `tuesday/`                          | Key prefix.                                                                              |
| `BACKUP_S3_KEEP`              | `30`                                | Remote copies kept; older ones are deleted.                                              |
| `BACKUP_S3_FAKE`              | `false`                             | Write off-site copies to `./data/fake-s3`.                                               |
| `BACKUP_ENCRYPTION_KEY`       | empty                               | ≥32 characters; enables AES-256-GCM off-site encryption. Store it in a password manager. |
| `HEALTH_TOKEN`                | empty                               | Bearer token for `/api/health/deep` and `/api/metrics`; empty means admins only.         |

## Backups and restore

- Local: automatic nightly at `BACKUP_HOUR`, plus **Admin → Data → Create backup**. Archives are `tuesday.db` + `uploads` in a `.tar.gz`.
- Off-site: when `BACKUP_S3_*` is set, every automatic backup is uploaded (encrypted when `BACKUP_ENCRYPTION_KEY` is set), pruned to `BACKUP_S3_KEEP`, and listed in **Admin → Data → Off-site copies**. Use **Upload latest now** for an on-demand copy.
- Encryption format: `TUEB1` magic, 12-byte IV, ciphertext, 16-byte GCM tag. Without the original key an encrypted backup cannot be restored — keep it safe and out of the repository.
- Restore local: upload the archive in Admin → Data, or run `stageRestore`/`applyPendingRestore` by restarting after staging. Restore remote: pick a row → **Restore…** → type the organisation name → restart Tuesday.
- Before any restore, take a fresh backup. Restores replace the database and uploads and keep a `pre-restore-*` copy in `BACKUP_DIR`.

## Monitoring

- `GET /api/health` — Docker health check.
- `GET /api/health/deep` — database `quick_check`, disk free, queue age, backup age, mail/AI/push state; 200 ok / 503 problem. Auth: admin session or `Authorization: Bearer $HEALTH_TOKEN`.
- `GET /api/metrics` — Prometheus text format: request counts, jobs, emails, push, AI calls/cost, SSE connections, active users, DB size and queue depth; ends with `tuesday_up 1`.

Example Uptime Kuma: HTTP(s) monitor on `https://your-host/api/health/deep` with header `Authorization: Bearer <HEALTH_TOKEN>`, expected status 200. Example Prometheus scrape:

```yaml
scrape_configs:
  - job_name: tuesday
    authorization:
      credentials: <HEALTH_TOKEN>
    static_configs:
      - targets: ['tuesday.example.com']
    metrics_path: /api/metrics
```

## Email troubleshooting

- Port 465 is implicit TLS; Tuesday retries once on 587 STARTTLS on connection errors only. `EAUTH` never falls back.
- Set Purelymail SPF/DKIM for your domain; check **Admin → Email** for the last 50 sends and the last error.
- `MAIL_FAKE=true` captures messages (admin outbox endpoint) and is for tests only.

## Single sign-on

Register `{APP_URL}/api/auth/oidc/callback` with the provider and set `OIDC_*`. Accounts link by verified email; invites are honoured; allowed domains can join directly. `OIDC_ONLY=true` keeps password login only for the owner.

## Push and VAPID

Set `VAPID_SUBJECT=mailto:you@yourdomain.com`. If the key pair is empty, Tuesday generates one on first use and stores it in `settings`. Install the PWA, then Profile → Notifications → Turn on. `PUSH_FAKE=true` records payloads in the admin outbox.

## Data locations

The Docker volume `tuesday-data` holds `tuesday.db`, `tuesday.db-wal`, `uploads/`, `backups/`, and `fake-s3/` in fake mode. Back up the whole volume or rely on the archive above.

## Secrets and rotation

Keep `.env` out of git. Rotating `BACKUP_ENCRYPTION_KEY` makes old encrypted copies unreadable with the new key — retain old keys for restores. Rotating VAPID keys invalidates existing push subscriptions; users re-enable push. Rotating `HEALTH_TOKEN` only updates monitoring.

## Smoke test

```bash
npm run smoke        # bash scripts/smoke.sh
```

Builds `tuesday:smoke`, starts `tuesday-smoke` on 3299 with fake AI/mail/push/S3, sets up an org, creates a workspace/board/item, restarts, checks the item survived, calls deep health and metrics with `smoke-token`, prints `SMOKE OK`, and removes the container, volume and image.
