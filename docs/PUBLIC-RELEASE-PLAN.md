# Public release plan

**Goal:** publish Tuesday as a credible, self-hostable open-source project — a clean GitHub repository, a readable README, reproducible builds, honest limitations and a v0.1.0 release people can actually run.

**Current state:** the application is feature-complete for a beta. This plan is about packaging, trust and distribution, not adding product surface.

| Area         | State                                                                                 | Verdict                   |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------- |
| Product      | Boards, docs, dashboards, automations, AI, PWA, admin and backups                     | Ready for beta            |
| Quality      | 349 unit tests, 132 Playwright tests, 76 design screenshots, axe checks, Docker smoke | Strong                    |
| Operations   | Docker, health, metrics, backups, restore drill, runbook                              | Good, needs public polish |
| Public repo  | README, screenshots, license, community files, CI                                     | This pass                 |
| Distribution | Private GitHub remote exists; no public release or prebuilt image                     | Almost ready              |
| Trust        | No secret/legal/security review yet                                                   | Blocker                   |

### Done in this packaging pass

- [x] Rewrote `README.md` in a user-first public structure with a hero, screenshots, quick start, feature tour, configuration, architecture, development, self-hosting, docs, support and license.
- [x] Captured a clean synthetic screenshot set in `docs/screenshots/` and added `scripts/capture-readme-screenshots.ts` to reproduce it.
- [x] Added `LICENSE` (MIT, pending maintainer confirmation), `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and `docs/PRIVACY.md`.
- [x] Added `.github/workflows/ci.yml`, issue forms, a PR template, Dependabot and `.gitattributes`.
- [x] Added public package metadata (description, license, repository, homepage, keywords).
- [x] Removed customer-specific examples from public `docs/RELEASE.md` and `docs/API.md`.
- [x] Removed the internal build diary from the public tree; the private archive keeps it in history.
- [x] Pushed the repository to `itchyparrot53/Tuesday` (currently private).
- [ ] Make the repository public, run CI from a fresh clone and publish the first release.

---

## 1. Repository hygiene

The build diary lives in the private archive rather than the public tree, so the repository only carries product documentation.

### Internal notes

The build planning, progress reports, audits and QA harness are kept in the private archive. They are not part of the public repository and the public documentation does not link to them.

### Keep public

- `server/`, `shared/`, `web/`, `e2e/`, `tests/`, `scripts/`, `deploy/`
- `docs/OPERATIONS.md`, `docs/API.md`, `docs/RELEASE.md`, `docs/PRIVACY.md`, `docs/PUBLIC-RELEASE-PLAN.md`
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `CHANGELOG.md`
- `docs/screenshots/` and `scripts/capture-readme-screenshots.ts`
- `.env.example`, `Dockerfile`, `docker-compose.yml`, `package.json`, `package-lock.json`

### Add

- [x] `.github/workflows/ci.yml`
- [x] `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml`
- [x] `.github/PULL_REQUEST_TEMPLATE.md`
- [x] `.github/dependabot.yml`
- [x] `.gitattributes` for image diff handling
- [ ] `CODEOWNERS` if the maintainer team is known

### Cleanup checks

- [ ] Decide whether `e2e/screenshots/` stays ignored (recommended) and `docs/screenshots/` stays tracked.
- [ ] Remove `.DS_Store` from the working tree and keep it ignored.
- [ ] Run `git ls-files | rg '\.(log|db|sqlite|env|pem|key)$'` and confirm only examples are present.
- [ ] Confirm `package.json` is `private: true` so nobody accidentally publishes to npm.
- [ ] Add the repository description, website and topics on GitHub.
- [ ] Add a social preview image (1280×640) in GitHub repository settings.

---

## 2. Legal, identity and privacy

- [x] **License file added.** This pass assumes MIT; confirm before publishing. If you prefer AGPL for a hosted-service moat, change `LICENSE`, `package.json` and the README before the first tag.
- [ ] **Check the name.** “Tuesday” is a common word and a work-management product name. Do a trademark search in your jurisdiction before spending on domains or promotion. The README already carries a non-affiliation disclaimer for monday.com.
- [x] **GitHub identity confirmed as `itchyparrot53/Tuesday`.** The repository is created but still private; make it public when the release checklist is green.
- [x] **Remove customer-specific deployment details** from public docs. `docs/RELEASE.md` and `docs/API.md` now use generic domains; internal deployment notes should still move to a private repo.
- [x] **Add a privacy note** to the README and `docs/PRIVACY.md`: self-hosted data stays local; AI sends selected board content to OpenRouter only when used; SMTP, OIDC, S3 and push are operator-configured.
- [ ] **Review screenshots** for real names, emails, domains or customer data. The current set uses the synthetic “Studio / Erin Owner / Website relaunch” dataset.
- [ ] **Third-party notices:** list direct dependencies and their licenses in `THIRD-PARTY-NOTICES.md` (or generate with `license-checker`).
- [ ] **Trademark and content license:** state that the code is MIT but the name/logo are not granted as trademarks.

---

## 3. Security review before the first public push

### Secret and history scan

- [ ] Run `gitleaks detect --source . --redact` against the full history, not just the working tree.
- [ ] Run `git log --all -p | rg -i 'sk-or-v1|api[_-]?key|secret|password|BEGIN .*PRIVATE KEY'` and review matches.
- [ ] Confirm `.env`, `data/`, backups and `e2e/.auth` were never committed. A quick scan found no tracked `.env` or database; repeat with a dedicated scanner before publishing.
- [ ] Rotate any real key that ever touched a committed file or screenshot.
- [ ] Add a secret scanning pre-commit hook or GitHub secret scanning + push protection.

### Dependency and supply chain

- [ ] Run `npm audit --omit=dev` and `npm audit`; document accepted findings.
- [ ] Enable Dependabot for npm, GitHub Actions and Docker.
- [ ] Pin GitHub Actions by major version, and consider SHA pinning for release workflows.
- [ ] Add `npm run check:colors`, `check:design`, `typecheck`, `test` and `build` to CI.
- [ ] Generate an SBOM (`syft`) and attach it to the release.
- [ ] Consider signing images with cosign/Sigstore and publishing provenance.

### Application security checklist

- [ ] Confirm `COOKIE_SECURE=true`, `TRUST_PROXY=true` guidance for HTTPS deployments.
- [ ] Run the restore drill on a throwaway volume with the current image.
- [ ] Verify rate limits on login, invites, AI endpoints and inbound webhooks.
- [ ] Review the `WEBHOOKS_ALLOW_PRIVATE` default and documentation.
- [ ] Confirm fake adapters (`AI_FAKE`, `MAIL_FAKE`, `PUSH_FAKE`, `BACKUP_S3_FAKE`) warn or fail if enabled with `NODE_ENV=production`.
- [ ] Publish a threat-model summary in `SECURITY.md`: cookie sessions, CSRF, SSRF/webhooks, AI prompt injection, upload handling, backup encryption, multi-tenant board permissions.
- [ ] Enable GitHub private vulnerability reporting and add a response target.

### Privacy

- [ ] Document what AI features send to OpenRouter, and that admins can leave AI off.
- [ ] Document retention: audit log 365 days, email log 90 days, backups per `BACKUP_KEEP`, no analytics by default.
- [ ] Confirm there is no telemetry or third-party font/CDN call at runtime. The app self-hosts fonts; keep it that way.

---

## 4. Build and distribution

### Versioning and releases

- [ ] Decide the first public tag: `v0.1.0` is the current version.
- [ ] Tag from `main` only after CI is green.
- [ ] Publish a GitHub Release with:
  - source zip/tarball (automatic),
  - `CHANGELOG.md` entry,
  - Docker image digest,
  - upgrade notes and known limitations,
  - checksums/SBOM.
- [ ] Add `GET /api/version` or include the commit SHA in `/api/health` so support can identify builds.

### Prebuilt image

- [ ] Publish `ghcr.io/<owner>/tuesday:v0.1.0` and `:latest` for `linux/amd64` and `linux/arm64`.
- [ ] Add a `docker-compose.release.yml` that uses the image instead of `build: .`.
- [ ] Document that the image runs as the `node` user and needs a writable `/data`.
- [ ] Smoke-test the published image on a clean volume, then test an upgrade with an existing database.
- [ ] Add image labels (`org.opencontainers.image.source`, `revision`, `version`, `licenses`).

### CI shape

Proposed `.github/workflows/ci.yml`:

1. **checks** — `npm ci`, `typecheck`, `check:design`, `check:colors`, `test`, `build`.
2. **e2e** — install Chromium, `npm run e2e` against the isolated fake server.
3. **docker** — build the image, start it on a temp volume, hit `/api/health`.
4. **release** (tags only) — multi-arch build/push to GHCR, SBOM and GitHub Release.

Keep E2E on pull requests but allow a manual `workflow_dispatch` for release re-runs.

---

## 5. Documentation

The README is now user-first and mirrors the reference structure: hero, badges, what/why, screenshots, quick start, feature tour, configuration, architecture, development, self-hosting, contributing, license.

Still needed before launch:

- [x] `docs/RELEASE.md` generalised away from a specific customer; consider splitting a `docs/SELF-HOSTING.md` — public HTTPS path, Caddy/Tunnel, SMTP DNS, backups, restore, upgrade/rollback.
- [ ] `docs/CONFIGURATION.md` — every env var with defaults, required/optional, security notes. `docs/OPERATIONS.md` covers much of this; split if it gets too long.
- [ ] `docs/ARCHITECTURE.md` — a public version of the data model, request flow, job queue and permission model.
- [ ] `docs/UPGRADING.md` — migrations, backups before upgrade, rollback, breaking-change policy.
- [ ] `docs/PRIVACY.md` — see above.
- [ ] `docs/FAQ.md` — no default login, AI off, SQLite scale expectations, reverse proxy, email deliverability.
- [ ] A short “known limitations” section: single-node only, SQLite concurrency, no built-in TLS, no hosted demo, API beta.
- [ ] Link checks: `lychee --offline` or `markdown-link-check` in CI.
- [ ] Screenshot regeneration instructions are in `scripts/capture-readme-screenshots.ts`; keep the synthetic dataset reproducible.

---

## 6. GitHub project setup

- [ ] Create the repository (public) and push `main`.
- [ ] Description: “Self-hosted work OS — boards, docs, dashboards, automations and optional AI in one Docker container.”
- [ ] Topics: `self-hosted`, `work-management`, `project-management`, `monday-alternative`, `kanban`, `sqlite`, `fastify`, `react`, `typescript`, `docker`, `ai`, `pwa`.
- [ ] Enable Issues, Discussions and private vulnerability reporting.
- [ ] Add labels: `bug`, `enhancement`, `documentation`, `good first issue`, `help wanted`, `security`, `dependencies`, `area/*`.
- [ ] Add milestones: `v0.1.0 public beta`, `v0.2.0 distribution`, `v1.0`.
- [ ] Protect `main`: require PR, passing CI, no force push; require one review once there are multiple maintainers.
- [ ] Add a release checklist issue template.
- [ ] Pin a short “Start here” issue or discussion with setup help.
- [ ] Add a support policy: GitHub Issues for bugs, Discussions for setup/questions, security advisories for vulnerabilities. No private email until a public one exists.

---

## 7. Owner decisions

| Decision             | Recommendation                                                                 | Needed before         |
| -------------------- | ------------------------------------------------------------------------------ | --------------------- |
| License              | MIT (assumed in this pass)                                                     | First public push     |
| GitHub owner/repo    | `itchyparrot53/Tuesday` (created, still private)                               | Already done          |
| Public contact       | A dedicated maintainer email or GitHub-only support                            | README/support policy |
| Brand name           | Keep “Tuesday” with the non-affiliation disclaimer, or rename before promotion | Launch                |
| Customer references  | Move private deployment notes out of public docs                               | Launch                |
| Hosted demo          | Optional; if added, use synthetic data and a reset schedule                    | Announcement          |
| Image registry       | GHCR under the same owner                                                      | v0.2.0                |
| Default AI           | Off without a key; no model calls on first run                                 | Already true          |
| Telemetry            | None                                                                           | Already true          |
| Support expectations | Best-effort beta; no SLA                                                       | README/SUPPORT        |

---

## 8. Launch sequence

### Phase A — repository ready (1–2 days)

- Archive internal planning files.
- Add license, changelog, contributing, security, code of conduct, issue/PR templates, Dependabot and CI.
- Generalise deployment docs and add privacy/security notes.
- Run secret scan and dependency audit.
- Re-capture screenshots if any UI changes.

### Phase B — release candidate (1 day)

- Create the GitHub repo and push `main`.
- Turn on branch protection, private advisories and secret scanning.
- Run CI from a fresh clone.
- Build and smoke-test the image on a clean volume.
- Draft the v0.1.0 release notes.

### Phase C — public beta (launch day)

- Tag `v0.1.0`, publish the GitHub Release and GHCR image.
- Publish the README and a short “what/why/how to run” announcement.
- Open Discussions with a pinned setup thread.
- Watch the first 48 hours: setup failures, Docker issues, security reports.

### Phase D — after launch

- Add a hosted demo only if support load allows.
- Ship v0.2.0 with prebuilt images and upgrade docs.
- Keep a monthly dependency/security review.
- Track roadmap in public issues, not private docs.

---

## 9. Definition of done for v0.1.0

- [ ] Public repo contains no internal build diary, logs, databases, backups or customer-specific deployment notes.
- [ ] `LICENSE`, `README`, `CHANGELOG`, `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT` exist and are linked.
- [ ] CI is green from a fresh clone: typecheck, design lint, colors, unit, build, e2e, Docker.
- [ ] A clean Docker install reaches setup in under two minutes.
- [ ] Upgrade from an existing database is tested, including one migration.
- [ ] Backup and restore drill passes on the published image.
- [ ] No high/critical dependency vulnerabilities without a documented exception.
- [ ] No secrets in git history (verified by a dedicated scanner).
- [ ] README screenshots match the released UI and contain only synthetic data.
- [ ] v0.1.0 GitHub Release and image are published together.
- [ ] Security reporting path works and is tested.

---

## 10. Known limitations to state publicly

- Single-node deployment; SQLite is the source of truth. Very high write concurrency is not the target.
- The API is beta and may change before 1.0.
- No built-in TLS; use Caddy, nginx or a tunnel.
- AI quality and availability depend on the configured OpenRouter model; costs are the operator's.
- Email deliverability depends on SPF/DKIM/DMARC and the SMTP provider.
- Android share-target and push behavior need device-level verification.
- The project is maintained best-effort; there is no SLA or hosted support yet.
