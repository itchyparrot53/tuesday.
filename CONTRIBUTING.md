# Contributing to Tuesday

Thanks for taking the time to help. Tuesday is a self-hosted work OS; small, well-tested changes are more valuable than large rewrites.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Good first contributions

- Reproduce a bug on a clean Docker install and add a failing test.
- Improve an empty state, keyboard path or mobile layout.
- Add a deterministic test for an uncovered server route.
- Improve the docs with a setup problem you actually hit.
- Review a dependency or accessibility issue.

Look for `good first issue` and `help wanted` labels.

## Development setup

Requirements: Node.js 24+, npm, and Docker if you want to test the production image.

```bash
git clone https://github.com/itchyparrot53/tuesday..git
cd tuesday
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs on port 3000; Vite proxies `/api`. The default database is `./data/tuesday.db`. Set `TUESDAY_NO_DOTENV=1` if you do not want `.env` loaded.

No external service is required. AI, SMTP, OIDC, S3 and push adapters all have fake modes for development and tests.

## Before opening a pull request

Run the same gates CI runs:

```bash
npm run typecheck
npm run check:design
npm run check:colors
npm test
npm run build
```

If you changed UI or an interaction, also run the relevant Playwright spec:

```bash
npx playwright install chromium
npx playwright test e2e/07-automations.spec.ts
```

For a broad check, `npm run e2e` runs the full 132-test suite against an isolated database on port 3200 with fake AI, mail, push and S3. It never touches your development data.

## Design contract

The visual contract lives in `web/src/styles.css` and `PLAN-PART3.md` (sections 6.3–6.9):

- Use the design tokens (`bg-surface`, `text-muted`, `border-line`, `shadow-pop`, …) instead of raw colours and shadows.
- Use the type utilities (`.t-display`, `.t-title`, `.t-section`, `.t-label`, `.t-meta`) instead of arbitrary pixel font sizes.
- Use `rounded-sheet`, `rounded-dialog`, `rounded-pop`, `rounded-control`, `rounded-chip` or `rounded-full`; do not invent radii.
- Use the shared `Dialog`, `Drawer`, `Button`, `Input`, `Select`, `Menu` and `Toast` primitives.
- Native `<select>` is allowed only where the design lint allowlist records it. Migrate new selects to `components/ui/Select`.
- `npm run check:design` must report `0 design finding(s)`. An intentional exception uses a trailing `// design-ok: <reason>` comment and is listed by the lint.

Accessibility is part of the design contract: keyboard paths, visible focus, labels for icon-only buttons, reduced motion and no horizontal overflow at 375px. The design e2e suite runs axe on every captured screen.

## Tests

- **Server/unit:** `tests/*.test.ts` with Vitest. Use the helpers in `tests/helpers.ts`; prefer API-level assertions.
- **E2E:** `e2e/*.spec.ts` with Playwright. Each spec creates its own board/data. Do not depend on another spec's data.
- **Design gallery:** `e2e/13-design.spec.ts` captures every screen at 1440/375 in light/dark and writes `e2e/screenshots/design/index.html`.
- **Smoke:** `npm run smoke` builds a disposable Docker image, starts it, restarts it and checks persistence/deep health.

Do not weaken or skip a test to make a change pass. If a test is genuinely flaky, fix the source of the flake or isolate the timing; explain it in the PR.

## Database changes

Migrations are numbered SQL files in `server/db/migrations/` and run forward-only. To change the schema:

1. Add the next `NNN_name.sql` file. Never edit an applied migration.
2. Update the row mapper/service and shared types together.
3. Add a test that exercises the old and new path where relevant.
4. Check `tests/upgrade.test.ts` still passes.
5. Take a backup before testing against a real database.

## AI changes

- Never commit an API key or a real customer board.
- Use `AI_FAKE=true` or inject a fake fetch. Tests must not call OpenRouter.
- Keep AI opt-in. A missing key must leave the rest of the app working.
- Route every call through `AiGateway` so budgets, usage and routing are recorded.
- Treat board content as untrusted input; keep prompts explicit about JSON shape and validate model output against real database ids.

## Pull requests

Keep the PR focused. Include:

- What changed and why.
- Screenshots or a short recording for UI changes.
- The commands you ran and their result.
- Any migration, config or upgrade note.
- Known limitations or follow-ups.

Use clear commit messages. One logical change per commit is preferred; squash merge is fine.

## Documentation

If you add a user-facing feature, update the README feature tour, `CHANGELOG.md` and the relevant doc under `docs/`. Screenshots in `docs/screenshots/` are captured from a synthetic demo dataset with `scripts/capture-readme-screenshots.ts`; do not use real customer data.

## Release process

The maintainer runs the release checklist in [docs/PUBLIC-RELEASE-PLAN.md](docs/PUBLIC-RELEASE-PLAN.md): CI green from a fresh clone, Docker smoke, restore drill, changelog, tag, GitHub Release and image publish. Do not tag a release with failing CI.
