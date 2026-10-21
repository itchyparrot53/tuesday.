# Tuesday landing site — build notes

Static, light-only site for Tuesday. Plain HTML, CSS and vanilla JS; no framework, build step, CDN, analytics or cookies.


## Revision 2: hero and copy pass

After the first build, the hero and the page copy were tightened again.

- The hero is now a compact split panel. The image is a slim 4:1 banner, with a 3.2:1 frame below 900px, and the panel overlaps it by 64px. At 1440x900 the hero CTA ends at **564px** and the facts strip is visible at **629px**. At 390x844 the CTA ends at **575px**. The one-line install chip and the non-affiliation line moved out of the hero; the install command lives in the self-host section.
- Hero copy is down to **25 words** including the badge and button labels. The page has **895 visible words** in total, down from the first pass, without dropping any product facts.
- Section badge pills were removed everywhere except the hero. The feature cards became a two-column ledger, the AI cards became one three-part glass panel, and the stat/link cards became one open-source panel. This also removes the repeated "pill, heading, four cards" rhythm.
- All visible em and en dashes were removed. The page title, body copy and 404 title now use periods, commas, colons or pipes. The acceptance script checks the rendered text for both characters.
- The mobile menu now morphs its icon to an X and animates in. The sticky-header state uses an IntersectionObserver sentinel rather than a scroll listener. Buttons have a press state, and there is a reduced-transparency fallback for the glass surfaces.
- Mobile fact figures were reduced so "1 container" and "1 SQLite file" stay on one line at 360px. Open-source stats stack at 390px.


## Revision 3: spacing pass

The rendered page was audited again section by section at 1440 and 390, with full-page captures and measured bounding boxes.

- Section padding is now **64px desktop, 48px tablet and 40px mobile**, giving 128px, 96px and 80px between sections. The facts strip uses 28px/64px, the CTA section uses 72px, and the footer uses 56px top. Section-head spacing is 28px.
- The mobile layout puts the copy before the phone again. The phone is a tall object and the heading was sitting after it on a small screen.
- At 1440 the page is now **9,465px tall**, down from 10,417px after the copy pass and 11,715px in the first build. At 390 it is **11,992px**.
- The hero itself was not compressed further: the CTA is still at 684px on a 900px viewport, with the facts strip visible below it.
- The tighter rhythm was checked for accidental clipping, horizontal scroll and focus visibility before the final acceptance run.


## Revision 4: slimmer hero asset

The new user-supplied `Glossy Pink Tuesday Logo Studio (1).webp` replaced the earlier hero.

- Source: **4096×1024** (4:1), 52,178 bytes. Outputs: `hero-1600.webp` 1600×400 (20,468 bytes), `hero-900.webp` 900×225 (10,092 bytes).
- Desktop hero frame: 4:1, 360px tall at 1440. Below 900px: 3.2:1 with an 8% horizontal crop, so the cards and full wordmark stay in frame.
- Page height at 1440 is now **9,465px**. At 390 it is **11,992px**.
- CTA now ends at **564px** on 1440×900 and **575px** on 390×844. The facts strip starts at **629px** on desktop.
- First load at 1440 (compressed, all tour screenshots): **367.9 KB**.

## What is here

- `index.html`, `styles.css`, `main.js`
- `404.html` with the same header, footer and menu
- `robots.txt`, `sitemap.xml`
- `assets/hero.webp`, `hero-1600.webp`, `hero-900.webp`
- `assets/shots/*.webp` — every PNG in `docs/screenshots/`
- `assets/brand/` — the six requested files from the brand kit
- `assets/fonts/` — self-hosted Bricolage Grotesque and Figtree variable fonts
- `tools/optimize-images.mjs` — image generation
- `tools/check.mjs` — Playwright + axe acceptance checks

The site is at `/site`, and deploys with `.github/workflows/pages.yml`.

## Decisions and ambiguities

1. **Hero source.** The supplied `Glossy Pink Tuesday Logo Studio (1).webp` is a **4096×1024** 4:1 master, replacing the earlier 2400×960 readme hero. It is copied to `site/assets/hero.webp`; the optimizer writes 1600×400 and 900×225 variants from it. The `<picture>` uses a 4096w final srcset candidate and a 4:1 frame on desktop. Below 900px the frame is 3.2:1 with an 8% horizontal crop so the cards and full wordmark stay in view without the old deep banner.
2. **Header at narrow widths.** Below 900px the header keeps the logo and one Menu control; the GitHub and Get started buttons live in the menu sheet. This keeps the 64px bar uncluttered at 390 and 360 widths, and the sheet carries all four links and both buttons as specified.
3. **Architecture diagram on phones.** The detailed wide SVG scales down to about 9px labels at 390px, which is not readable. Below 600px I added a second inline SVG with the same content and accessible label, reflowed so the optional connections sit below the data volume instead of beside it. It still scales to the column width, and labels stay at roughly 15px. The wide diagram is used at 600px and up.
4. **FAQ structure.** The nine native `<details>` items sit in one glass accordion panel with a 16px radius and 1px separators between items. This gives the requested single-open behaviour and the 1px rules without nine cards competing for attention.
5. **README anchor.** “See all features on GitHub” points at `#whats-inside`, which is the real named anchor in the repository README (the brief wrote `#-whats-inside`). The link uses the repository URL and opens in the same tab.
6. **Glass opacity where needed.** The hero panel (0.72 white), budget panel (0.66), comparison (0.66), status note (0.66), FAQ (0.62), CTA (0.62) and mobile menu (0.90) use stronger backgrounds than the shared `--glass` token where they sit over stronger colour. No other panels were changed.
7. **Copy fallback.** Successful copy shows “Copied” for 1.5s and announces it. If the Clipboard API is unavailable, the command text is selected and the button says “Selected” instead, so the label does not claim a copy that did not happen.
8. **GitHub API in this environment.** The repository at `itchyparrot53/tuesday` returned HTTP 404 from the GitHub API while I was building (the user account exists; the repository is not publicly readable yet). The page keeps its fallbacks (`v0.1.0`, “Star on GitHub”, hidden count pills) and does not show an error or a zero. This also produces the only two entries in the browser console at the moment: the two optional GitHub requests. No local asset, script or page errors occur. Once the repository is public the count and latest tag will populate and best-practices should return to 100.

## Image sizes

All screenshot sources are 1440×900 except `home-mobile.png` (390×844). The optimizer only downscales, so 1440-wide sources stay 1440 wide; it writes WebP quality 80. The hero variants are quality 82.

| File | Pixels | Bytes |
| --- | --- | ---: |
| `assets/hero.webp` | 4096×1024 | 52,178 |
| `assets/hero-1600.webp` | 1600×400 | 20,468 |
| `assets/hero-900.webp` | 900×225 | 10,092 |
| `assets/shots/home.webp` | 1440×900 | 56,050 |
| `assets/shots/board-table.webp` | 1440×900 | 51,102 |
| `assets/shots/board-kanban.webp` | 1440×900 | 35,778 |
| `assets/shots/item-panel.webp` | 1440×900 | 19,140 |
| `assets/shots/dashboard.webp` | 1440×900 | 23,854 |
| `assets/shots/doc.webp` | 1440×900 | 28,638 |
| `assets/shots/my-work.webp` | 1440×900 | 34,260 |
| `assets/shots/workflow-editor.webp` | 1440×900 | 24,470 |
| `assets/shots/home-mobile.webp` | 390×844 | 23,998 |
| `assets/shots/automation-templates.webp` | 1440×900 | 55,864 |
| `assets/shots/automations.webp` | 1440×900 | 36,550 |
| `assets/shots/home-dark.webp` | 1440×900 | 53,308 |
| `assets/shots/workflows.webp` | 1440×900 | 29,382 |

Brand and type:

| File | Bytes |
| --- | ---: |
| `assets/brand/tuesday-logo-horizontal-light.svg` | 6,912 |
| `assets/brand/tuesday-logo-stacked-light.svg` | 7,354 |
| `assets/brand/favicon.svg` | 597 |
| `assets/brand/favicon.ico` | 15,086 |
| `assets/brand/apple-touch-icon-180x180.png` | 3,547 |
| `assets/brand/og-image-1200x630.png` | 40,878 |
| `assets/fonts/BricolageGrotesque-Variable.woff2` | 41,344 |
| `assets/fonts/Figtree-Variable.woff2` | 20,156 |

`favicon.ico` and `apple-touch-icon-180x180.png` are also at the site root for browser fallback. The logo files were copied, not recoloured, cropped or redrawn.

## §9 checks — results, 21 October 2026

### 1. Local serve

`npx --yes serve site -l 4173` initially failed before starting because this machine’s `~/.npm` cache contains root-owned files (`EPERM`). I ran the same server with a writable cache:

```bash
npm_config_cache=/tmp/npm-cache npx --yes serve site -l 4173
```

The site returned HTTP 200 from the shared `serve` process on port 4173. There were no local console errors or page errors. The only console entries were the two GitHub API 404s described above.

### 2. Playwright checks — pass

`node site/tools/check.mjs`

- 1440, 1024, 768, 390 and 360: `scrollWidth <= innerWidth` at every width. No horizontal page scroll.
- Hero CTA is inside the first viewport at every tested width (900px tall desktop/tablet, 844px at 390, 800px at 360).
- Rendered text contains no em or en dash.
- Full-page screenshots saved to `site/tools/screens/` (git-ignored).
- `@axe-core/playwright` reported **0 serious or critical violations** at every width. (WCAG 2 A/AA + 2.1 A/AA tags; 0 violations of any impact at every width.)
- Every internal anchor resolves.
- Every `./assets/` reference in the document and in `styles.css` returns 200.
- Tabs: ArrowRight moves to Boards, selects it, shows its panel and keeps focus on the tab; End reaches My work.
- Mobile menu: opens, focuses its first link, closes on Escape and returns focus to the Menu button.
- 404: shared header/footer, exact message and a home link.
- No-JS: all seven tour panels are visible and the install commands are present.

### 3. Contrast — pass

Key measured ratios:

- White button text on Tuesday Pink: **4.99:1**
- Muted `#6e6272` on `--paper`: **5.38:1**
- Muted on `--mist`: **5.12:1**
- Muted on glass over `--petal` (composited): **≈4.9:1**
- Code text `#f4eef5` on `--night`: **16.17:1**
- Code comments `#ac9fb0` on `--night`: **7.33:1**

axe reported no colour-contrast violations at any tested width. The only use of `--faint` is an SVG stroke, never text.

### 4. Weight and Lighthouse — pass

- First load at 1440 with the compressed `serve` response (all seven tour screenshots included): **367.9 KB**, under the 1.5 MB ceiling.
- Page height at 1440: **9,465px**, down from 10,417px after the copy pass and 11,715px in the first build.
- Lighthouse (Chromium, headless, `serve` on port 4173): **Performance 96 · Accessibility 100 · Best practices 96 · SEO 100**.
  - FCP 0.8s, LCP 2.5s, TBT 20ms, CLS 0.
  - Best practices lost 4 points solely to the two GitHub API 404 console entries while the repository is not public. The Lighthouse run with the repo visible should be 100; this is an external availability issue, not a local request failure.

### 5. Content — pass

- No lorem ipsum, exclamation marks, em dashes or emoji.
- No invented numbers, customers, testimonials, logos or download counts. The only figures beyond product facts are the example AI figures and percentages explicitly labelled “Example figures”/“Example workflow”. The earlier “five views” wording was replaced with “multiple views” because the source copy names four views.
- Every external link points at `https://github.com/itchyparrot53/tuesday/...` and uses the same tab.
- No `target="_blank"` and no `rel="noopener"` anywhere.
- No framework, CDN, Google Fonts, analytics, cookie banner or third-party embed.
- The only runtime third-party request is the optional GitHub API pair.

### 6. Without JavaScript — pass

With JavaScript disabled at 390px, all seven tour panels are visible stacked, all sections read in order, and the install code block is visible with the four commands. The `<details>` FAQ continues to work natively.

## Owner note

**Enable GitHub Pages: Settings → Pages → Source: GitHub Actions.**

The workflow deploys on every push to `main` that touches `site/**`, or manually via `workflow_dispatch`.

## Reproduce

```bash
npm ci
npm i --no-save sharp
node site/tools/optimize-images.mjs
npm_config_cache=/tmp/npm-cache npx --yes serve site -l 4173
node site/tools/check.mjs
```

Lighthouse:

```bash
CHROME_PATH="$(node -e "console.log(require('playwright').chromium.executablePath())")" \
  npx --yes lighthouse http://127.0.0.1:4173/ \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo
```

## Scope

Changed only `site/`, `.github/workflows/pages.yml`, `.gitignore` and the one website line at the top of `README.md`. `site/brand-kit-src/` and `site/tools/screens/` are git-ignored.
