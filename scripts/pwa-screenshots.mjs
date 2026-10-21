// Regenerates the PWA store screenshots from the seeded e2e server.
// Run once after `npm run build`: node scripts/pwa-screenshots.mjs
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
for (const [name, width, height] of [
  ['home-wide', 1280, 720],
  ['home-narrow', 750, 1334],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(process.env.APP_URL ?? 'http://localhost:3200/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `web/public/screenshots/${name}.png` });
  await page.close();
}
await browser.close();
console.log('PWA screenshots written to web/public/screenshots');
