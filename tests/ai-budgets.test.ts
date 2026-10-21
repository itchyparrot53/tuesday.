import { describe, expect, test } from 'vitest';
import { H, createTestApp, fakeOpenRouter, setupOwner } from './helpers';
import { DEFAULT_ROUTING } from '../shared/ai';

async function adminSettings(app: any, cookie: string) {
  const current = await app.inject({ method: 'GET', url: '/api/ai/settings', headers: { cookie } });
  return current.json();
}

describe('AI routing', () => {
  test('changing the write tier moves the model the provider receives', async () => {
    const fake = fakeOpenRouter([{ text: 'hello' }]);
    const app = await createTestApp({ aiFetch: fake });
    const { cookie } = await setupOwner(app);
    const settings = await adminSettings(app, cookie);
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie },
      payload: {
        ...settings,
        strongModel: 'strong/model',
        routing: { ...DEFAULT_ROUTING, write: 'strong' },
      },
    });
    expect(updated.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: '/api/ai/write',
      headers: { ...H, cookie },
      payload: { text: 'make this better', mode: 'improve' },
    });
    const call = fake.calls.at(-1);
    expect(call.model).toBe('strong/model');
    await app.close();
  });

  test('unknown routing keys are rejected', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const settings = await adminSettings(app, cookie);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie },
      payload: { ...settings, routing: { ...DEFAULT_ROUTING, nope: 'fast' } },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('AI budgets', () => {
  async function spend(app: any, userId: number, feature: string, cost: number, status = 'ok') {
    app.db
      .prepare(
        `INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, cost_usd, created_at, tier, status)
         VALUES (?, ?, 'test/model', 1, 1, ?, ?, 'fast', ?)`,
      )
      .run(userId, feature, cost, new Date().toISOString(), status);
  }

  test('org, feature and person limits each block with their message', async () => {
    const app = await createTestApp({ aiFetch: fakeOpenRouter([{ text: 'no' }]) });
    const { cookie, user } = await setupOwner(app);
    const settings = await adminSettings(app, cookie);
    await spend(app, user.id, 'write', 0.02);
    await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie },
      payload: { ...settings, monthlyBudgetUsd: 0.01 },
    });
    const org = await app.inject({
      method: 'POST',
      url: '/api/ai/write',
      headers: { ...H, cookie },
      payload: { text: 'hello', mode: 'improve' },
    });
    expect(org.statusCode).toBe(402);
    expect(org.json().error.message).toContain("organisation's monthly AI budget");
    expect(
      (
        app.db.prepare("SELECT count(*) AS n FROM ai_usage WHERE status = 'blocked'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);

    await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie },
      payload: { ...settings, monthlyBudgetUsd: 0 },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/ai/budgets/feature/write',
      headers: { ...H, cookie },
      payload: { monthlyUsd: 0.01 },
    });
    const feature = await app.inject({
      method: 'POST',
      url: '/api/ai/write',
      headers: { ...H, cookie },
      payload: { text: 'hello', mode: 'improve' },
    });
    expect(feature.json().error.message).toContain('Writing help');

    await app.inject({
      method: 'DELETE',
      url: '/api/ai/budgets/feature/write',
      headers: { ...H, cookie },
    });
    const personal = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie },
      payload: { ...settings, monthlyBudgetUsd: 0, defaultUserMonthlyUsd: 0.01 },
    });
    expect(personal.statusCode).toBe(200);
    const person = await app.inject({
      method: 'POST',
      url: '/api/ai/write',
      headers: { ...H, cookie },
      payload: { text: 'hello', mode: 'improve' },
    });
    expect(person.json().error.message).toContain('AI limit for this month');
    await app.close();
  });

  test('80% alerts fire once and admins get a notification', async () => {
    const app = await createTestApp();
    const { cookie, user } = await setupOwner(app);
    await spend(app, user.id, 'write', 0.008);
    const settings = await adminSettings(app, cookie);
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie },
      payload: { ...settings, defaultUserMonthlyUsd: 0.01 },
    });
    expect(saved.statusCode).toBe(200);
    const { checkAlerts } = await import('../server/ai/budgets');
    const current = app.ai.settings();
    checkAlerts(app.db, current, 'write', user.id);
    checkAlerts(app.db, current, 'write', user.id);
    expect(
      (app.db.prepare('SELECT count(*) AS n FROM ai_budget_alerts').get() as { n: number }).n,
    ).toBe(1);
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM notifications WHERE kind = 'ai_budget'")
          .get() as { n: number }
      ).n,
    ).toBeGreaterThan(0);
    await app.close();
  });

  test('budget routes are admin-only and CSV has the header', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const denied = await app.inject({ method: 'GET', url: '/api/ai/budgets' });
    expect(denied.statusCode).toBe(401);
    const list = await app.inject({ method: 'GET', url: '/api/ai/budgets', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const csv = await app.inject({ method: 'GET', url: '/api/ai/usage.csv', headers: { cookie } });
    expect(csv.body.split('\n')[0]).toBe(
      'time,user,feature,tier,model,prompt_tokens,completion_tokens,cost_usd,status',
    );
    const my = await app.inject({ method: 'GET', url: '/api/me/ai-usage', headers: { cookie } });
    expect(my.json()).toHaveProperty('monthCostUsd');
    await app.close();
  });
});
