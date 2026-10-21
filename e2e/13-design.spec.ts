import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { axeCheck, designShots, expectStyle } from './design';
import { seed, type Seed } from './seed';
import { H, signIn } from './helpers';

interface Entry {
  name: string;
  open: (page: Page, browser: Browser, seedData: Seed | null) => Promise<void>;
  auth?: boolean;
  needsSeed?: boolean;
  shell?: boolean;
}

const registry: Entry[] = [
  {
    name: 'setup',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/auth/state', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ needsSetup: true, orgName: null }),
        });
      });
      await fresh.goto('/setup');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'setup');
      await context.close();
    },
  },
  {
    name: 'login',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.goto('/login');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'login');
      await context.close();
    },
  },
  {
    name: 'invite',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/invites/demo-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ email: null, role: 'member', orgName: 'Studio' }),
        });
      });
      await fresh.goto('/invite/demo-token');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'invite');
      await context.close();
    },
  },
  {
    name: 'public-form',
    auth: false,
    needsSeed: true,
    open: async (page, browser, seedData) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.goto(`/f/${seedData!.formToken}`);
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'public-form');
      await context.close();
    },
  },
  {
    name: 'home',
    open: async (page) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'home');
    },
  },
  {
    name: 'workspace',
    open: async (page, _browser, s) => {
      await page.goto(`/workspaces/${s!.workspaceId}`);
      await page.waitForLoadState('networkidle');
      await expectStyle(page.getByTestId('page-title'), 'font-family', /Bricolage/);
      await designShots(page, 'workspace');
    },
  },
  {
    name: 'board-table',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await expectStyle(page.getByTestId('page-title'), 'font-family', /Bricolage/);
      await expectStyle(page.getByTestId('tab-indicator'), 'height', '2px');
      await expectStyle(page.getByTestId('tab-indicator'), 'background-color', 'rgb(0, 115, 234)');
      await expectStyle(page.getByTestId('item-row').first(), 'height', '40px');
      await expectStyle(
        page.locator('[data-column-title="Status"] .status-cell .status-pill').first(),
        'color',
        'rgb(38, 117, 82)',
      );
      await designShots(page, 'board-table');
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      await page.waitForTimeout(350);
      await expectStyle(
        page.locator('[data-column-title="Status"] .status-cell .status-pill').first(),
        'color',
        'rgb(83, 196, 142)',
      );
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
      });
      const activeCell = page.locator('[data-grid-cell][data-column-title="Item"]').first();
      await activeCell.click();
      await expect(activeCell).toHaveClass(/ring-2/);
      const ring = await activeCell.evaluate((element) => getComputedStyle(element).boxShadow);
      expect(ring).toContain('rgb(0, 115, 234)');
    },
  },
  {
    name: 'board-webhook',
    needsSeed: true,
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.getByRole('button', { name: 'Board menu' }).click();
      await page.getByRole('menuitem', { name: /Inbound webhook/ }).click();
      await expect(
        page.getByRole('dialog').getByText('Inbound webhook', { exact: true }),
      ).toBeVisible();
      await designShots(page, 'board-webhook');
      await page.keyboard.press('Escape');
    },
  },
  {
    name: 'board-table-compact',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('user-menu').click();
      await page.getByTestId('density-option-compact').click();
      await page.waitForTimeout(300);
      await expectStyle(page.getByTestId('item-row').first(), 'height', '32px');
      await designShots(page, 'board-table-compact', { density: 'compact' });
    },
  },
  {
    name: 'board-kanban',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('view-picker').click();
      await page.getByRole('menuitem', { name: 'Kanban' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'board-kanban');
    },
  },
  {
    name: 'board-calendar',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('view-picker').click();
      await page.getByRole('menuitem', { name: 'Calendar' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'board-calendar');
    },
  },
  {
    name: 'board-timeline',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('view-picker').click();
      await page.getByRole('menuitem', { name: 'Timeline' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'board-timeline');
    },
  },
  {
    name: 'cell-status-picker',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-column-title="Status"] .status-cell').first().click();
      await page.waitForTimeout(200);
      await designShots(page, 'cell-status-picker');
    },
  },
  {
    name: 'cell-people-picker',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="cell"][data-column-title="Owner"] button').first().click();
      await page.waitForTimeout(200);
      await designShots(page, 'cell-people-picker');
    },
  },
  {
    name: 'item-panel',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="item-row"]').first().getByTestId('item-open').click();
      await page.waitForTimeout(200);
      await designShots(page, 'item-panel');
    },
  },
  {
    name: 'item-panel-files',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="item-row"]').first().getByTestId('item-open').click();
      await page.getByTestId('item-tab-files').click();
      await page.waitForTimeout(200);
      await designShots(page, 'item-panel-files');
    },
  },
  {
    name: 'import',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Board menu' }).click();
      await page.getByRole('menuitem', { name: 'Import from CSV' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'import');
    },
  },
  {
    name: 'templates',
    open: async (page, _browser, s) => {
      await page.goto(`/workspaces/${s!.workspaceId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Board…', exact: true }).click();
      await page.getByTestId('create-board-tab').filter({ hasText: 'From a template' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'templates');
    },
  },
  {
    name: 'duplicate',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Board menu' }).click();
      await page.getByRole('menuitem', { name: 'Duplicate board' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'duplicate');
    },
  },
  {
    name: 'my-work',
    open: async (page) => {
      await page.goto('/my-work');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'my-work');
    },
  },
  {
    name: 'inbox',
    open: async (page) => {
      await page.goto('/inbox');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'inbox');
    },
  },
  {
    name: 'trash',
    open: async (page) => {
      await page.goto('/trash');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'trash');
    },
  },
  {
    name: 'profile',
    open: async (page) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'profile');
    },
  },
  {
    name: 'admin-members',
    open: async (page) => {
      await page.goto('/admin?tab=members');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-members');
    },
  },
  {
    name: 'admin-guide',
    open: async (page) => {
      await page.goto('/admin?tab=guide');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-guide');
    },
  },
  {
    name: 'admin-invites',
    open: async (page) => {
      await page.goto('/admin?tab=invites');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-invites');
    },
  },
  {
    name: 'admin-ai',
    open: async (page) => {
      await page.goto('/admin?tab=ai');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-ai');
    },
  },
  {
    name: 'admin-integrations',
    open: async (page) => {
      await page.goto('/admin?tab=integrations');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-integrations');
    },
  },
  {
    name: 'admin-data',
    open: async (page) => {
      await page.goto('/admin?tab=data');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-data');
    },
  },
  {
    name: 'dashboard',
    open: async (page, _browser, s) => {
      await page.goto(`/dashboards/${s!.dashboardId}`);
      await page.waitForLoadState('networkidle');
      await designShots(page, 'dashboard');
    },
  },
  {
    name: 'doc',
    open: async (page, _browser, s) => {
      await page.goto(`/docs/${s!.docId}`);
      await page.waitForLoadState('networkidle');
      await designShots(page, 'doc');
    },
  },
  {
    name: 'doc-history',
    open: async (page, _browser, s) => {
      await page.goto(`/docs/${s!.docId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Doc menu' }).click();
      await page.getByRole('menuitem', { name: 'Version history' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'doc-history');
    },
  },
  {
    name: 'palette',
    open: async (page) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('Control+k');
      await designShots(page, 'palette');
    },
  },
  {
    name: 'automations',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('automate-button').click();
      await designShots(page, 'automations');
    },
  },
  {
    name: 'automation-editor',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('automate-button').click();
      await page.getByRole('button', { name: 'New automation' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'automation-editor');
    },
  },
  {
    name: 'workflows',
    open: async (page, _browser, s) => {
      await page.request.post('/api/workflows', {
        headers: H,
        data: {
          name: 'Onboarding → delivery handoff',
          description: 'Create the delivery row when onboarding starts.',
          triggerBoardId: s!.boardId,
          trigger: { type: 'item_created' },
          conditions: [],
          steps: [
            {
              type: 'create_item',
              boardId: s!.boardId,
              groupId: s!.groupIds[0],
              name: 'Delivery: {{name}}',
            },
            {
              type: 'assign_from',
              sourceColumnId: s!.columnIds.owner,
              targetColumnId: s!.columnIds.owner,
            },
          ],
        },
      });
      await page.goto('/workflows');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'workflows');
    },
  },
  {
    name: 'workflow-editor',
    open: async (page) => {
      await page.goto('/workflows');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'New workflow' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'workflow-editor');
    },
  },
  {
    name: 'automation-templates',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('automate-button').click();
      await page.getByRole('tab', { name: /Templates/ }).click();
      await designShots(page, 'automation-templates');
    },
  },
  {
    name: 'automation-generated',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('automate-button').click();
      await page.getByRole('tab', { name: /Templates/ }).click();
      await page.getByTestId('generate-board-templates').click();
      await page.getByTestId('generated-template-card').first().waitFor({ timeout: 15_000 });
      await designShots(page, 'automation-generated');
    },
  },
  {
    name: 'automation-activity',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('automate-button').click();
      await page.getByRole('tab', { name: 'Activity' }).click();
      await designShots(page, 'automation-activity');
    },
  },
  {
    name: 'form-builder',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Form', exact: true }).click();
      await designShots(page, 'form-builder');
    },
  },
  {
    name: 'summary',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Board menu' }).click();
      await page.getByRole('menuitem', { name: 'Summarize board' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'summary');
    },
  },
  {
    name: 'generate-board',
    open: async (page, _browser, s) => {
      await page.goto(`/workspaces/${s!.workspaceId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Board…', exact: true }).click();
      await page.getByTestId('create-board-tab').filter({ hasText: 'Describe it' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'generate-board');
    },
  },
  {
    name: 'ai-column-dialog',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('add-column').click();
      await page.getByRole('menuitem', { name: 'AI column' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'ai-column-dialog');
    },
  },
  {
    name: 'meeting-notes',
    open: async (page, _browser, s) => {
      await page.goto(`/boards/${s!.boardId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Board menu' }).click();
      await page.getByRole('menuitem', { name: 'Meeting notes → items' }).click();
      await page.waitForTimeout(250);
      await designShots(page, 'meeting-notes');
    },
  },
  {
    name: 'ai-page',
    open: async (page) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByTestId('ask-ai').click();
      await expect(page.getByTestId('ai-page')).toBeVisible();
      await designShots(page, 'ai-page');
    },
  },
  {
    name: 'ai-page-chat',
    needsSeed: true,
    open: async (page, _browser, s) => {
      const conversation = await (
        await page.request.post('/api/ai/conversations', { headers: H, data: {} })
      ).json();
      await page.request.post(`/api/ai/conversations/${conversation.conversation.id}/messages`, {
        headers: H,
        data: { content: '/fake-tool {"name":"list_people","args":{}}' },
      });
      await page.request.post(`/api/ai/conversations/${conversation.conversation.id}/messages`, {
        headers: H,
        data: { content: `see [[item:${s!.itemIds[0]}]]` },
      });
      await expect
        .poll(async () => {
          const detail = await (
            await page.request.get(`/api/ai/conversations/${conversation.conversation.id}`)
          ).json();
          return detail.messages.some(
            (message: { role: string; content: string }) =>
              message.role === 'assistant' && message.content.includes('[[item:'),
          );
        })
        .toBe(true);
      await page.goto(`/ai/${conversation.conversation.id}`);
      await expect(page.getByTestId('ai-chat-title')).toBeVisible();
      await expect(page.getByTestId('ai-ref-chip').first()).toBeVisible();
      await expectStyle(page.getByTestId('ai-chat-title'), 'font-family', /Bricolage/);
      await expectStyle(page.getByTestId('ai-ref-chip').first(), 'border-radius', '6px');
      await designShots(page, 'ai-page-chat');
    },
  },
  {
    name: 'forgot-password',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/auth/state', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            needsSetup: false,
            orgName: 'Studio',
            sso: { enabled: false, label: 'Sign in with SSO', only: false },
            mail: true,
          }),
        });
      });
      await fresh.goto('/forgot-password');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'forgot-password');
      await context.close();
    },
  },
  {
    name: 'reset-password',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/auth/reset/demo-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ email: 'e***@studio.test' }),
        });
      });
      await fresh.goto('/reset-password/demo-token');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'reset-password');
      await context.close();
    },
  },
  {
    name: 'profile-notifications',
    open: async (page) => {
      await page.goto('/profile?tab=notifications');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'profile-notifications');
    },
  },
  {
    name: 'admin-email',
    open: async (page) => {
      await page.goto('/admin?tab=email');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-email');
    },
  },
  {
    name: 'admin-go-live',
    open: async (page) => {
      await page.goto('/admin?tab=go-live');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-go-live');
    },
  },
  {
    name: 'release',
    open: async (page) => {
      await page.goto('/release');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'release');
    },
  },
  {
    name: 'share-dialog',
    open: async (page) => {
      const workspace = (await (await page.request.get('/api/workspaces')).json()).workspaces[0];
      const board = await (
        await page.request.post('/api/boards', {
          headers: H,
          data: { workspaceId: workspace.id, name: `Share ${Date.now()}` },
        })
      ).json();
      await page.goto(`/boards/${board.board.id}`);
      await page.getByTestId('board-share').click();
      await expect(page.getByTestId('share-dialog')).toBeVisible();
      await designShots(page, 'share-dialog');
    },
  },
  {
    name: 'home-guest',
    open: async (page) => {
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.user) body.user.isGuest = true;
        await route.fulfill({ response, json: body });
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'home-guest');
      await page.unroute('**/api/auth/me');
    },
  },
  {
    name: 'profile-security',
    open: async (page) => {
      await page.goto('/profile?tab=security');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'profile-security');
    },
  },
  {
    name: 'admin-audit',
    open: async (page) => {
      await page.goto('/admin?tab=audit');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-audit');
    },
  },
  {
    name: 'admin-ai-usage',
    open: async (page) => {
      await page.goto('/admin?tab=ai');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('ai-usage')).toBeVisible();
      await designShots(page, 'admin-ai-usage');
    },
  },
  {
    name: 'search',
    open: async (page) => {
      await page.goto('/search?q=launch');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'search');
    },
  },
  {
    name: 'ai-filter',
    needsSeed: true,
    open: async (page) => {
      await page.goto(
        `/boards/${(await (await page.request.get('/api/workspaces')).json()).workspaces.find((w: { name: string }) => w.name === 'Studio')?.boards.find((b: { name: string }) => b.name === 'Website relaunch')?.id}`,
      );
      await page.getByTestId('ai-filter-open').click();
      await page.getByTestId('ai-filter-input').fill('Write brief');
      await page.getByTestId('ai-filter-input').press('Enter');
      await expect(page.getByTestId('ai-filter-chip')).toBeVisible();
      await designShots(page, 'ai-filter');
    },
  },
  {
    name: 'column-suggestions',
    needsSeed: true,
    open: async (page) => {
      const workspaces = await (await page.request.get('/api/workspaces')).json();
      const board = workspaces.workspaces[0].boards[0];
      await page.goto(`/boards/${board.id}`);
      await page.getByTestId('add-column').click();
      await page.getByTestId('ai-suggest-columns').click();
      await expect(page.getByTestId('column-suggestion').first()).toBeVisible();
      await designShots(page, 'column-suggestions');
    },
  },
  {
    name: 'dashboard-risk',
    needsSeed: true,
    open: async (page) => {
      await page.goto('/dashboards/1');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'dashboard-risk');
    },
  },
  {
    name: 'describe-dashboard',
    open: async (page) => {
      await page.goto('/');
      await page.getByTestId('home-new').click();
      await page.getByRole('menuitem', { name: 'Dashboard' }).click();
      await page.getByLabel('Describe the dashboard').fill('status and workload');
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(page.getByTestId('describe-dashboard')).toContainText('Items');
      await designShots(page, 'describe-dashboard');
    },
  },
  {
    name: 'install-dialog',
    open: async (page) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () =>
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        });
        Object.defineProperty(navigator, 'standalone', { get: () => false });
      });
      await page.goto('/');
      await page.getByTestId('user-menu').click();
      await page.getByTestId('install-app').click();
      await expect(page.getByTestId('install-dialog')).toBeVisible();
      await designShots(page, 'install-dialog');
    },
  },
  {
    name: 'home-mobile-nav',
    open: async (page) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'home-mobile-nav');
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  },
  {
    name: 'share-page',
    open: async (page) => {
      await page.goto('/share?title=Read%20this&url=https%3A%2F%2Fexample.com');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'share-page');
    },
  },
  {
    name: 'profile-push',
    open: async (page) => {
      await page.goto('/profile?tab=notifications');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'profile-push');
    },
  },
  {
    name: 'admin-data-offsite',
    open: async (page) => {
      await page.goto('/admin?tab=data');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'admin-data-offsite');
    },
  },
  {
    name: 'home-first-run',
    open: async (page) => {
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.user) body.user.preferences = { ...body.user.preferences, tourDone: true };
        await route.fulfill({ response, json: body });
      });
      await page.route('**/api/home', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.onboarding = {
          show: true,
          steps: [
            { id: 'create_board', done: true },
            { id: 'add_item', done: false },
            { id: 'invite_team', done: false },
            { id: 'try_ai', done: false },
            { id: 'take_tour', done: true },
          ],
        };
        await route.fulfill({ response, json: body });
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('home-getting-started')).toBeVisible();
      await designShots(page, 'home-first-run');
      await page.unroute('**/api/home');
    },
  },
  {
    name: 'setup-account',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/auth/state', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ needsSetup: true, orgName: null }),
        });
      });
      await fresh.goto('/setup');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'setup-account');
      await context.close();
    },
  },
  {
    name: 'setup-org',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/auth/state', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ needsSetup: true, orgName: null }),
        });
      });
      await fresh.goto('/setup');
      await fresh.getByLabel('Your name').fill('Erin Owner');
      await fresh.getByLabel('Email').fill('erin@studio.test');
      await fresh.getByLabel('Password').fill('password123');
      await fresh.getByTestId('setup-next').click();
      await expect(fresh.getByLabel('Organisation name')).toBeVisible();
      await designShots(fresh, 'setup-org');
      await context.close();
    },
  },
  {
    name: 'welcome-starter',
    shell: false,
    open: async (page) => {
      await page.route('**/api/workspaces', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workspaces: [
              {
                id: 1,
                name: 'Studio',
                description: '',
                color: '#3E8EF7',
                isPrivate: false,
                position: 1,
                createdBy: 1,
                memberIds: [1],
                boards: [],
                docs: [],
                dashboards: [],
              },
            ],
          }),
        });
      });
      await page.goto('/welcome?step=starter');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'welcome-starter');
      await page.unroute('**/api/workspaces');
    },
  },
  {
    name: 'welcome-invite',
    shell: false,
    open: async (page) => {
      await page.route('**/api/workspaces', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workspaces: [
              {
                id: 1,
                name: 'Studio',
                description: '',
                color: '#3E8EF7',
                isPrivate: false,
                position: 1,
                createdBy: 1,
                memberIds: [1],
                boards: [],
                docs: [],
                dashboards: [],
              },
            ],
          }),
        });
      });
      await page.goto('/welcome?step=invite');
      await page.waitForLoadState('networkidle');
      await designShots(page, 'welcome-invite');
      await page.unroute('**/api/workspaces');
    },
  },
  {
    name: 'invite-accept',
    auth: false,
    open: async (page, browser) => {
      const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
      const fresh = await context.newPage();
      await fresh.route('**/api/invites/demo-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            email: null,
            role: 'member',
            orgName: 'Studio',
            invitedBy: { name: 'Erin Owner', color: '#FF6FB1' },
            memberCount: 4,
            members: [
              { name: 'Erin Owner', color: '#FF6FB1' },
              { name: 'Sam Lee', color: '#3E8EF7' },
              { name: 'Mia Chen', color: '#2BB673' },
              { name: 'Noah Park', color: '#F5A524' },
            ],
          }),
        });
      });
      await fresh.goto('/invite/demo-token');
      await fresh.waitForLoadState('networkidle');
      await designShots(fresh, 'invite-accept');
      await context.close();
    },
  },
  {
    name: 'create-board-dialog',
    open: async (page) => {
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.user) body.user.preferences = { ...body.user.preferences, tourDone: true };
        await route.fulfill({ response, json: body });
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.getByTestId('home-new').click();
      await page.getByRole('menuitem', { name: 'Board…', exact: true }).click();
      await expect(page.getByTestId('create-board-dialog')).toBeVisible();
      await designShots(page, 'create-board-dialog');
      await page.keyboard.press('Escape');
    },
  },
  {
    name: 'tour',
    open: async (page) => {
      const reset = await page.request.patch('/api/me', {
        headers: { 'x-requested-with': 'tuesday' },
        data: { preferences: { tourDone: false } },
      });
      expect(reset.status()).toBe(200);
      await page.goto('/');
      await expect(page.getByTestId('tour-step')).toBeVisible({ timeout: 5000 });
      await designShots(page, 'tour');
      await page.getByTestId('tour-skip').click();
    },
  },
];

test.afterAll(() => {
  execFileSync('node', ['scripts/build-design-gallery.mjs'], { stdio: 'inherit' });
});

for (const entry of registry) {
  test(entry.name, async ({ page, browser }) => {
    let seedData: Seed | null = null;
    if (entry.auth !== false || entry.needsSeed) {
      await signIn(page);
      seedData = await seed(page);
    }
    await entry.open(page, browser, seedData);
    if (entry.auth !== false) {
      if (entry.shell !== false) await expect(page.getByTestId('sidebar')).toBeVisible();
      await axeCheck(page, `final ${entry.name}`);
    }
  });
}
