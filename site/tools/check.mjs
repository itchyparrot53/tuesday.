#!/usr/bin/env node
// Acceptance checks for the Tuesday landing site.
// Start the site first: npx --yes serve site -l 4173
// Then run: node site/tools/check.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.SITE_URL || "http://127.0.0.1:4173/";
const here = path.dirname(fileURLToPath(import.meta.url));
const screens = path.join(here, "screens");
const widths = [1440, 1024, 768, 390, 360];
const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

await mkdir(screens, { recursive: true });
const browser = await chromium.launch();

for (const width of widths) {
  const height = width === 390 ? 844 : width === 360 ? 800 : 900;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const localErrors = [];
  page.on("pageerror", (error) => localErrors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location().url || "";
    if (url.includes("api.github.com")) notes.push(`${width}px: optional GitHub API 404 (repository not public), fallbacks kept`);
    else localErrors.push(`${message.text()} ${url}`);
  });

  const response = await page.goto(BASE, { waitUntil: "networkidle" });
  if (!response || !response.ok()) fail(`${width}px: page did not return 200`);
  await page.waitForTimeout(300);

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth
  }));
  if (metrics.scrollWidth > metrics.innerWidth) {
    fail(`${width}px: horizontal scroll (${metrics.scrollWidth} > ${metrics.innerWidth})`);
  }
  const heroCta = await page.locator(".hero-buttons").boundingBox();
  if (!heroCta || heroCta.y + heroCta.height > metrics.innerHeight) {
    fail(`${width}px: hero CTA is below the first viewport`);
  }
  const visibleText = await page.locator("body").innerText();
  if (/[\u2014\u2013]/.test(visibleText)) fail(`${width}px: visible em or en dash found`);

  await page.screenshot({ path: path.join(screens, `home-${width}.png`), fullPage: true });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  if (serious.length) {
    fail(`${width}px: axe serious/critical violations: ${serious.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`);
  } else {
    notes.push(`${width}px: axe 0 serious/critical violations`);
  }

  const anchors = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')]
      .map((link) => link.getAttribute("href"))
      .filter((href) => href && href.length > 1)
      .filter((href) => !document.getElementById(href.slice(1)))
  );
  if (anchors.length) fail(`${width}px: unresolved internal anchors: ${[...new Set(anchors)].join(", ")}`);

  const assetRefs = await page.evaluate(() => {
    const refs = new Set();
    document.querySelectorAll("[src]").forEach((element) => {
      if (element.getAttribute("src").startsWith("./assets/")) refs.add(element.getAttribute("src"));
    });
    document.querySelectorAll("source[srcset]").forEach((element) => {
      element.getAttribute("srcset").split(",").forEach((candidate) => {
        const url = candidate.trim().split(/\s+/)[0];
        if (url.startsWith("./assets/")) refs.add(url);
      });
    });
    document.querySelectorAll("[href]").forEach((element) => {
      if (element.getAttribute("href").startsWith("./assets/")) refs.add(element.getAttribute("href"));
    });
    return [...refs];
  });
  const css = await (await context.request.get(new URL("styles.css", BASE).href)).text();
  for (const match of css.matchAll(/url\(["']?(\.\/assets\/[^)"']+)/g)) assetRefs.push(match[1]);
  for (const ref of [...new Set(assetRefs)]) {
    const assetResponse = await context.request.get(new URL(ref, BASE).href);
    if (assetResponse.status() !== 200) fail(`${width}px: ${ref} returned ${assetResponse.status()}`);
  }

  if (localErrors.length) fail(`${width}px: console/page errors: ${localErrors.join(" | ")}`);
  else notes.push(`${width}px: no local console or page errors`);

  await context.close();
}

// Keyboard tabs.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#tab-home").focus();
  await page.keyboard.press("ArrowRight");
  const boardsSelected = await page.locator("#tab-boards").getAttribute("aria-selected");
  const boardsVisible = await page.locator("#panel-boards").isVisible();
  const focusId = await page.evaluate(() => document.activeElement.id);
  if (boardsSelected !== "true" || !boardsVisible || focusId !== "tab-boards") {
    fail("tabs: ArrowRight did not select and focus Boards");
  } else {
    notes.push("tabs: keyboard arrow navigation works");
  }
  await page.keyboard.press("End");
  const lastVisible = await page.locator("#panel-my-work").isVisible();
  if (!lastVisible) fail("tabs: End did not select the final tab");
  await context.close();
}

// Mobile menu, Escape and focus return.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#menu-button").click();
  const opened = await page.locator("#menu-button").getAttribute("aria-expanded");
  const menuVisible = await page.locator("#mobile-menu").isVisible();
  const firstFocus = await page.evaluate(() => document.activeElement.closest("#mobile-menu") !== null);
  await page.keyboard.press("Escape");
  const closed = await page.locator("#menu-button").getAttribute("aria-expanded");
  const menuHidden = await page.locator("#mobile-menu").isHidden();
  const focusReturned = await page.evaluate(() => document.activeElement.id === "menu-button");
  if (opened !== "true" || !menuVisible || !firstFocus) fail("mobile menu: did not open or focus its first control");
  if (closed !== "false" || !menuHidden || !focusReturned) fail("mobile menu: Escape did not close it and return focus");
  if (opened === "true" && closed === "false" && menuHidden && focusReturned) notes.push("mobile menu: opens, closes on Escape, returns focus");
  await context.close();
}

// No-JS fallback.
{
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  const visiblePanels = await page.locator(".tour-panel:visible").count();
  const installVisible = await page.locator("#install-code").isVisible();
  const installText = await page.locator("#install-code").innerText();
  if (visiblePanels !== 7) fail(`no-JS: expected 7 stacked tour panels, found ${visiblePanels}`);
  if (!installVisible || !installText.includes("docker compose up -d --build")) fail("no-JS: install commands are not visible");
  if (visiblePanels === 7 && installVisible) notes.push("no-JS: all tour panels and install commands are visible");
  await context.close();
}

// 404.
{
  const context = await browser.newContext({ viewport: { width: 1024, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(new URL("404.html", BASE).href, { waitUntil: "networkidle" });
  const hasHeader = await page.locator("header.site-header").count();
  const hasFooter = await page.locator("footer.site-footer").count();
  const message = await page.locator("h1").innerText();
  const homeLink = await page.locator("main a[href='./index.html']").count();
  if (!response || !hasHeader || !hasFooter || message !== "This page doesn't exist." || !homeLink || errors.length) {
    fail("404: page is missing the shared header/footer, message, home link or logs an error");
  } else {
    notes.push("404: shared header/footer, message and home link present");
  }
  await context.close();
}

await browser.close();
console.log(notes.join("\n"));
if (failures.length) {
  console.error(`\nFAIL\n${failures.map((message) => `- ${message}`).join("\n")}`);
  process.exit(1);
}
console.log("\nPASS: all landing site checks completed.");
