<div align="center">

<img src="docs/brand/readme-hero.webp" width="100%" alt="Tuesday logo" />

![Status](https://img.shields.io/badge/status-public%20beta-c9356c?style=for-the-badge&labelColor=2b2130)
![Stars](https://img.shields.io/github/stars/itchyparrot53/tuesday.?style=for-the-badge&color=c9356c&labelColor=2b2130)
![Issues](https://img.shields.io/github/issues/itchyparrot53/tuesday.?style=for-the-badge&color=c9356c&labelColor=2b2130)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Licence](https://img.shields.io/badge/Licence-MIT-c9356c?style=for-the-badge&labelColor=2b2130)

</div>

> [!IMPORTANT]
> 0.1.0 is a public beta. Back up your data and pin a release tag for production.

<a name="what-is-tuesday"></a>

## What is Tuesday?

This is my rebuild of monday.com. I wanted the boards, docs, dashboards and automations without handing my workspace to a SaaS, so Tuesday runs on your own server.

It is one Docker container, one SQLite file and one `/data` volume. There is no Postgres, Redis or required cloud service. AI, email, SSO, off-site backups and push are optional.

I planned it with **Opus 5.5** and built it with **DeepSeek 4.1 Flash**.

<a name="why-tuesday"></a>

## Why Tuesday?

- Your data stays on your hardware. The only outbound calls are the ones you turn on.
- Boards, docs, dashboards, automations and the focus queue share one permission model.
- Board recipes handle small loops. Cross-board workflows carry handoffs and log every run.
- AI is optional. Use your own OpenRouter key or run without it. Budgets and routing keep spend visible.
- One process, one SQLite file and a documented restore drill.

---

<a name="whats-inside"></a>

## What's inside

<div align="center">
  <img src="docs/screenshots/board-table.png" alt="Board table with groups, typed columns and saved views" width="100%" />
</div>

- **Boards.** Groups, typed columns, subitems, table, kanban, calendar and timeline views, filters, saved views, bulk edit and import/export.
- **Daily work.** A ranked Home queue, My work, inbox, mentions, files, dependencies, time tracking and keyboard navigation.
- **Automations and workflows.** 16 recipes, board-specific templates, chained subitem steps, cross-board triggers and logged runs.
- **AI, only if you want it.** Assistant, board generation, AI columns, summaries, writing help, meeting notes, budgets and routing.
- **Docs and dashboards.** Versioned markdown docs, plus number, chart, list, risk and AI widgets.
- **Admin and mobile.** Roles, private boards, guests, OIDC SSO, SMTP, audit log, API tokens, backups, health and metrics. The PWA installs, works offline, sends push and accepts Android shares.

<details>
<summary>More screenshots</summary>

<img src="docs/screenshots/board-kanban.png" alt="Board kanban by status" width="100%" />

<img src="docs/screenshots/workflow-editor.png" alt="Cross-board workflow editor" width="100%" />

<img src="docs/screenshots/dashboard.png" alt="Dashboard with number, chart and risk widgets" width="100%" />

<div align="center">
  <img src="docs/screenshots/home-mobile.png" alt="Tuesday mobile home" width="300" />
</div>

</details>

---

<a name="quick-start"></a>

## Quick start

Docker Engine 24+ with Compose, about 2 GB of RAM and a persistent volume. Node 24+ is only needed for development.

```bash
git clone https://github.com/itchyparrot53/tuesday..git tuesday
cd tuesday
cp .env.example .env
# Set APP_URL. OPENROUTER_API_KEY is optional.
docker compose up -d --build
```

Open http://localhost:3000 and create the owner account. There is no default login.

For production, set `APP_URL`, `COOKIE_SECURE=true` and `TRUST_PROXY=true`, then put it behind HTTPS. See [operations](docs/OPERATIONS.md).

To use the published image:

```bash
cp .env.example .env
TUESDAY_VERSION=v0.1.0 docker compose -f docker-compose.release.yml up -d
```

---

<a name="configuration"></a>
<details id="configuration">
<summary><strong>Configuration</strong></summary>

Start from `.env.example`. The essentials:

| Variable | Default | Why it matters |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | Public origin for invite links, email, webhooks and the AI referer. |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS. |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy that sets `X-Forwarded-For`. |
| `OPENROUTER_API_KEY` | empty | Enables AI. Leave empty for a no-AI install. |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | empty | Invites, password resets, mentions and digests. |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | empty | SSO. Redirect URI: `{APP_URL}/api/auth/oidc/callback`. |
| `BACKUP_S3_*` | empty | Encrypted off-site backups to any S3-compatible bucket. |
| `VAPID_SUBJECT` | empty | Contact for web push. Keys are generated on first use. |
| `AI_FAKE` / `MAIL_FAKE` / `PUSH_FAKE` | `false` | Development only. Never enable in production. |

The full reference, secret rotation and troubleshooting are in [docs/OPERATIONS.md](docs/OPERATIONS.md). API tokens are in [docs/API.md](docs/API.md).

</details>

<a name="architecture"></a>
<details id="architecture">
<summary><strong>Architecture</strong></summary>

```text
Browser
  React 19 · Vite · TanStack Query · Tailwind 4 · PWA
        │  HTTPS + SSE
        ▼
Fastify 5 API
  TypeScript · SQLite (WAL) · migrations · in-process job queue
        │
        ├── /data/tuesday.db       source of truth
        ├── /data/uploads          item files
        ├── /data/backups          local archives
        └── optional adapters      OpenRouter · SMTP · OIDC · S3 · Web Push
```

| Path | What lives there |
| --- | --- |
| `server/` | Fastify routes, services, auth, AI, jobs and SQLite migrations |
| `shared/` | Types and Zod schemas shared by server and web |
| `web/src/` | React app, board views, design system and PWA code |
| `e2e/` | Playwright specs, isolated test server and design gallery |
| `tests/` | Vitest server and unit tests |
| `deploy/` | Caddy, Cloudflare Tunnel and production Compose examples |
| `docs/` | Operations, API, privacy, release and the public release plan |

SQLite runs in WAL mode with numbered migrations. A database-backed queue handles email, webhooks, AI and backups. SSE keeps boards live, and one `/data` volume holds all stateful data.

Permissions are checked on the server for boards, items, docs, dashboards, AI tools, SSE and notifications. Sessions use HttpOnly cookies with CSRF protection, and webhooks are HMAC-signed.

</details>

<details id="development">
<summary><strong>Development and testing</strong></summary>

```bash
git clone https://github.com/itchyparrot53/tuesday..git tuesday
cd tuesday
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Fastify on port 3000. The default database is `./data/tuesday.db`; set `TUESDAY_NO_DOTENV=1` to ignore `.env`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Fastify with `tsx watch` and Vite together |
| `npm run build` | Build the web app and server bundle |
| `npm start` | Run the production build |
| `npm run typecheck` | Type-check web and server |
| `npm test` | Run the Vitest suite |
| `npm run e2e` | Build and run Playwright on port 3200 |
| `npm run check:design` | Design lint (must be `0 design finding(s)`) |
| `npm run check:colors` | Reject hard-coded colours outside token files |
| `npm run smoke` | Docker build, restart and deep-health smoke test |

E2E uses an isolated SQLite database with fake AI, email, push and S3 adapters. It never touches your data.

</details>

<a name="self-hosting"></a>
<details id="self-hosting">
<summary><strong>Self-hosting and upgrades</strong></summary>

- Install, upgrade, every environment variable, backups, restore, health, metrics and email, SSO and push troubleshooting are in the [operations runbook](docs/OPERATIONS.md).
- The [Caddy example](deploy/Caddyfile.example), [Cloudflare Tunnel example](deploy/cloudflared.example.yml) and [production Compose example](deploy/docker-compose.prod.example.yml) cover HTTPS.
- Bearer tokens, CSV and file calls, webhooks and errors are in the [API reference](docs/API.md).
- HTTPS, email DNS, backups, go-live and rollback are in the [release checklist](docs/RELEASE.md).
- Backups are local archives plus optional encrypted S3-compatible copies. Test a restore with `scripts/restore-drill.sh` before trusting it.

The published image is `ghcr.io/itchyparrot53/tuesday`. Pin a version in production; `latest` follows the newest stable tag.

```bash
cp .env.example .env
TUESDAY_VERSION=v0.1.0 docker compose -f docker-compose.release.yml up -d
```

To upgrade from source:

```bash
git fetch --tags
git checkout v0.1.0
docker compose up -d --build
```

</details>

---

## Documentation

- [Operations](docs/OPERATIONS.md)
- [API](docs/API.md)
- [Release](docs/RELEASE.md)
- [Privacy](docs/PRIVACY.md)
- [Public release plan](docs/PUBLIC-RELEASE-PLAN.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

---

<a name="support"></a>

## Support

Questions and setup help go to [GitHub Discussions](https://github.com/itchyparrot53/tuesday./discussions). Bugs and feature requests go to [GitHub Issues](https://github.com/itchyparrot53/tuesday./issues). Vulnerabilities go through the private advisory in [SECURITY.md](SECURITY.md).

Tuesday is maintained on a best-effort basis. There is no SLA, hosted support or guaranteed response time for the public beta.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

MIT. See [LICENSE](LICENSE).

Tuesday is not affiliated with, endorsed by or connected to monday.com.
