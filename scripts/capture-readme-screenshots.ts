/**
 * Captures the public README screenshots against a throwaway demo instance.
 *
 * Usage: npx tsx scripts/capture-readme-screenshots.ts
 * Requires a production build: npm run build
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { seed } from '../e2e/seed';

const PORT = 3301;
const BASE = `http://localhost:${PORT}`;
const H = { 'x-requested-with': 'tuesday' };
const dataDir = 'data/readme-demo';

function clean(): void {
  for (const file of [`${dataDir}.db`, `${dataDir}.db-wal`, `${dataDir}.db-shm`]) {
    rmSync(file, { force: true });
  }
  rmSync(`${dataDir}-uploads`, { recursive: true, force: true });
  rmSync(`${dataDir}-backups`, { recursive: true, force: true });
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Demo server did not become healthy');
}

async function main(): Promise<void> {
  clean();
  mkdirSync('docs/screenshots', { recursive: true });
  const server = spawn(process.execPath, ['dist/server/index.js'], {
    env: {
      ...process.env,
      TUESDAY_NO_DOTENV: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_PATH: `./${dataDir}.db`,
      UPLOADS_DIR: `./${dataDir}-uploads`,
      BACKUP_DIR: `./${dataDir}-backups`,
      APP_URL: BASE,
      AI_FAKE: 'true',
      MAIL_FAKE: 'true',
      PUSH_FAKE: 'true',
      BACKUP_S3_FAKE: 'true',
      LOG_LEVEL: 'warn',
      COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  let browser;
  try {
    await waitForHealth();
    browser = await chromium.launch();
    const context = await browser.newContext({
      baseURL: BASE,
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const setup = await page.request.post('/api/auth/setup', {
      headers: H,
      data: {
        orgName: 'Studio',
        name: 'Erin Owner',
        email: 'erin@studio.test',
        password: 'password123',
        timezone: 'Europe/London',
        colorTheme: 'tuesday',
      },
    });
    if (setup.status() !== 201) throw new Error(`setup failed: ${setup.status()}`);
    await page.request.patch('/api/me', {
      headers: H,
      data: {
        preferences: {
          tourDone: true,
          onboardingDismissed: true,
          theme: 'light',
          colorTheme: 'tuesday',
          density: 'comfortable',
        },
      },
    });
    const demo = await seed(page);
    await page.request.put(`/api/items/${demo.itemIds[3]}/values/${demo.columnIds.due_date}`, {
      headers: H,
      data: { value: { date: '2026-10-18' } },
    });
    const kanban = await page.request.post(`/api/boards/${demo.boardId}/views`, {
      headers: H,
      data: {
        name: 'Status board',
        type: 'kanban',
        settings: { kanbanColumnId: demo.columnIds.status },
      },
    });
    const kanbanId = kanban.status() === 201 ? (await kanban.json()).view.id : 0;

    const shot = async (name: string) => {
      await page.waitForTimeout(450);
      await page.screenshot({ path: `docs/screenshots/${name}.png` });
      console.log(`captured ${name}`);
    };

    await page.goto('/');
    await page.waitForTimeout(900);
    await shot('home');

    await page.goto(`/boards/${demo.boardId}`);
    await page.getByTestId('item-row').first().waitFor();
    await shot('board-table');

    await page.goto(`/boards/${demo.boardId}?view=${kanbanId}`);
    await page.getByTestId('kanban-card').first().waitFor();
    await shot('board-kanban');

    await page.goto(`/boards/${demo.boardId}`);
    await page.getByTestId('item-row').first().waitFor();
    await page.getByTestId('item-open').first().click();
    await page.getByTestId('item-panel').waitFor();
    await shot('item-panel');
    await page.keyboard.press('Escape');

    await page.goto(`/boards/${demo.boardId}`);
    await page.getByTestId('item-row').first().waitFor();
    await page.getByTestId('automate-button').click();
    await shot('automations');
    await page.getByRole('tab', { name: /Templates/ }).click();
    await page.getByTestId('generate-board-templates').click();
    await page.getByTestId('generated-template-card').first().waitFor({ timeout: 15_000 });
    await shot('automation-templates');
    await page.getByLabel('Close automations').click();

    await page.goto(`/dashboards/${demo.dashboardId}`);
    await shot('dashboard');

    await page.goto(`/docs/${demo.docId}`);
    await page.waitForTimeout(1200);
    await shot('doc');

    await page.goto('/my-work');
    await shot('my-work');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForTimeout(900);
    await shot('home-mobile');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.request.patch('/api/me', {
      headers: H,
      data: { preferences: { theme: 'dark' } },
    });
    await page.evaluate(() => {
      try {
        const current = JSON.parse(localStorage.getItem('tuesday:prefs') ?? '{}');
        localStorage.setItem('tuesday:prefs', JSON.stringify({ ...current, theme: 'dark' }));
      } catch {}
    });
    await page.goto('/');
    await page.waitForTimeout(900);
    await shot('home-dark');

    console.log('README screenshots captured');
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
