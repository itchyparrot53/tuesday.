import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('push: subscribe, receive a mention and turn off', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['notifications']);
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    Notification.requestPermission = async () => 'granted';
    let subscription: {
      endpoint: string;
      toJSON: () => unknown;
      unsubscribe: () => Promise<boolean>;
    } | null = null;
    const createSubscription = () => ({
      endpoint: 'https://push.example.test/abc',
      toJSON: () => ({
        endpoint: 'https://push.example.test/abc',
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      }),
      unsubscribe: async () => true,
    });
    Object.defineProperty(PushManager.prototype, 'subscribe', {
      value: async () => {
        subscription = createSubscription();
        return subscription;
      },
    });
    Object.defineProperty(PushManager.prototype, 'getSubscription', {
      value: async () => subscription,
    });
  });
  const owner = await signIn(page);
  await page.goto('/profile?tab=notifications');
  await expect(page.getByTestId('push-settings')).toBeVisible();
  await page.getByTestId('push-on').click();
  await expect(page.getByTestId('push-off')).toBeVisible();
  await axeCheck(page, 'profile push');

  const { boardId } = await createBoard(page, `Push board ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const item = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId: full.groups[0].id, name: 'Push target' },
  });
  const itemId = (await item.json()).item.id as number;
  const email = `pusher-${Date.now()}@e2e.test`;
  const invite = await page.request.post('/api/invites', {
    headers: H,
    data: { email, role: 'member' },
  });
  const token = (await invite.json()).invite.token as string;
  const accepted = await fetch('http://localhost:3200/api/auth/accept-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tuesday' },
    body: JSON.stringify({ token, name: 'Pusher', email, password: 'password123' }),
  });
  const cookie = String(accepted.headers.get('set-cookie')).split(';')[0];
  await fetch(`http://localhost:3200/api/items/${itemId}/updates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tuesday', cookie },
    body: JSON.stringify({ body: `@[Erin Owner](user:${owner.id}) please look` }),
  });
  await page.request.post('/api/admin/jobs/run-due', { headers: H });
  await expect
    .poll(async () => {
      await page.request.post('/api/admin/jobs/run-due', { headers: H });
      const outbox = await (await page.request.get('/api/admin/push/outbox')).json();
      return outbox.messages.some((entry: { payload: { url: string } }) =>
        entry.payload.url.includes(`/boards/${boardId}`),
      );
    })
    .toBe(true);

  await page.getByTestId('push-off').click();
  await expect(page.getByTestId('push-on')).toBeVisible();
});
