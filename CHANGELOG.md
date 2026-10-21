# Changelog

All notable changes to Tuesday are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
semantic versioning once it reaches 1.0.

## [0.1.0] — 2026-10-20

The first public beta. Tuesday is a complete self-hosted work OS in one
container.

### Added

- Organisations, workspaces, boards, groups, typed columns, items, subitems and updates with @mentions.
- Table, kanban, calendar and timeline views; filters, sorting, search, saved views, bulk edit and undo.
- Home focus queue, My work, Inbox and command palette.
- Docs with versions and preview, dashboards with chart/list/number/risk/AI widgets, files, forms and board templates.
- A live Admin → Guide covering organisation setup, invites, boards, email, AI, backups, restore drills, go-live and daily usage.
- Seven day-named colour palettes — Monday through Sunday — with Monday as the default, no promoted theme, and sensible light/dark defaults on selection.
- Formula, dependency, connect, mirror, time-tracking, rating, file and AI columns.
- Automation center with curated recipes, a sentence-style builder, board-specific LLM templates, date-passed triggers, chained subitem actions (copy a person from a column, tag them in a note), run history and signed outbound webhooks.
- Org-level Workflows with cross-board steps: create an item, copy a value, assign from a source people column, set a value, move group, post a tagged update, notify and view runs.
- Optional AI through OpenRouter: assistant, board generation, AI columns, summaries, writing help, meeting notes, budgets, routing and organisation memory.
- Invites, roles, private boards, guests, OIDC single sign-on, SMTP email, audit log and session management.
- Installable PWA with offline outbox, push notifications, Android share target and mobile navigation.
- Local and encrypted off-site backups, restore workflow, deep health, metrics and a go-live checklist.
- AI page polish: per-chat draft autosave, composer autofocus, mobile-visible message actions, retry, context count/clear-all, copy chat link, transcript export, search clear and follow-up prompts.
- Fixes: long-text editors now open with the current value; update replies and edits keep focus while typing.
- 349 unit tests, 132 Playwright tests and a 76-screen accessibility/design gallery.

### Security

- Cookie sessions with CSRF protection, hashed session tokens, rate limiting, HMAC-signed webhooks and encrypted off-site backups.
- Server-side permission checks across boards, items, docs, dashboards, AI tools, SSE events and notifications.

[0.1.0]: https://github.com/itchyparrot53/tuesday./releases/tag/v0.1.0
