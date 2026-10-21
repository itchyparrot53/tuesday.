import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { tickOnce } from '../server/jobs/scheduler';

async function fixture() {
  const app = await createTestApp();
  const { cookie } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const due = (board.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'date',
  )!;
  const groupId = board.groups[0].id as number;
  const addItem = async (name: string, date: string) => {
    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId, name, values: { [due.id]: { date } } },
    });
  };
  const createAutomation = async (payload: Record<string, unknown>) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/automations`,
      headers: { ...H, cookie },
      payload,
    });
    return res;
  };
  return { app, cookie, board, due, groupId, addItem, createAutomation };
}

function jobCount(app: any): number {
  return (
    app.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'automation_run'").get() as {
      n: number;
    }
  ).n;
}

describe('automation scheduler', () => {
  test('date arrivals fire once at the right hour and respect the timezone', async () => {
    const f = await fixture();
    await f.addItem('Due tomorrow', '2026-10-21');
    await f.createAutomation({
      name: 'Day before',
      trigger: { type: 'date_arrives', columnId: f.due.id, offsetDays: -1, hour: 9 },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: '{{name}} is due tomorrow' }],
    });
    tickOnce(f.app, new Date('2026-10-20T08:00:00Z'));
    expect(jobCount(f.app)).toBe(0);
    tickOnce(f.app, new Date('2026-10-20T09:00:00Z'));
    expect(jobCount(f.app)).toBe(1);
    tickOnce(f.app, new Date('2026-10-20T09:01:00Z'));
    expect(jobCount(f.app)).toBe(1);

    const tz = await f.app.inject({
      method: 'PATCH',
      url: '/api/org',
      headers: { ...H, cookie: f.cookie },
      payload: { timezone: 'Europe/London' },
    });
    expect(tz.statusCode).toBe(200);
    await f.addItem('Due in two days', '2026-10-22');
    const second = await f.createAutomation({
      name: 'Day before London',
      trigger: { type: 'date_arrives', columnId: f.due.id, offsetDays: -1, hour: 9 },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: '{{name}} is due tomorrow' }],
    });
    expect(second.statusCode).toBe(201);
    tickOnce(f.app, new Date('2026-10-21T08:30:00Z'));
    expect(jobCount(f.app)).toBe(3);
    await f.app.close();
  });

  test('date passed fires once for overdue items and not for future dates', async () => {
    const f = await fixture();
    await f.addItem('Already overdue', '2026-10-18');
    await f.addItem('Not yet due', '2026-10-25');
    const created = await f.createAutomation({
      name: 'Overdue chase',
      trigger: { type: 'date_passed', columnId: f.due.id, hour: 9 },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: '{{name}} is overdue' }],
    });
    expect(created.statusCode).toBe(201);
    tickOnce(f.app, new Date('2026-10-20T08:00:00Z'));
    expect(jobCount(f.app)).toBe(0);
    tickOnce(f.app, new Date('2026-10-20T09:00:00Z'));
    expect(jobCount(f.app)).toBe(1);
    tickOnce(f.app, new Date('2026-10-20T09:01:00Z'));
    expect(jobCount(f.app)).toBe(1);
    await f.app.close();
  });

  test('recurring weekly fires only on its weekday at the right hour', async () => {
    const f = await fixture();
    const created = await f.createAutomation({
      name: 'Weekly check-in',
      trigger: { type: 'recurring', every: 'week', weekday: 1, hour: 9 },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: 'Weekly check-in' }],
    });
    expect(created.statusCode).toBe(201);
    tickOnce(f.app, new Date('2026-10-19T09:00:00Z'));
    expect(jobCount(f.app)).toBe(1);
    tickOnce(f.app, new Date('2026-10-19T09:00:30Z'));
    expect(jobCount(f.app)).toBe(1);
    tickOnce(f.app, new Date('2026-10-20T09:00:00Z'));
    expect(jobCount(f.app)).toBe(1);
    await f.app.close();
  });
});

describe('scheduled backups', () => {
  test('daily backup runs once per hour and prune keeps BACKUP_KEEP', async () => {
    const { mkdtempSync, rmSync, readdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-scheduler-backup-'));
    const { createBackup, listBackups } = await import('../server/services/backups');
    const app = await createTestApp({
      config: {
        backupDir: path.join(dir, 'backups'),
        uploadsDir: path.join(dir, 'uploads'),
        backupKeep: 2,
        backupHour: 3,
      },
    });
    const { cookie } = await setupOwner(app);
    expect(cookie).toBeTruthy();
    tickOnce(app, new Date('2026-10-20T03:00:00Z'));
    const files = () =>
      readdirSync(path.join(dir, 'backups')).filter((name: string) => name.endsWith('.tar.gz'));
    for (let i = 0; i < 20 && files().length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(files().filter((name: string) => name.includes('-auto-'))).toHaveLength(1);
    tickOnce(app, new Date('2026-10-20T03:00:30Z'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(files().filter((name: string) => name.includes('-auto-'))).toHaveLength(1);

    await createBackup(app, true);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await createBackup(app, true);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await createBackup(app, true);
    const config = app.config;
    expect(
      listBackups(config).filter((entry) => entry.name.includes('-auto-')).length,
    ).toBeGreaterThan(2);
    tickOnce(app, new Date('2026-10-21T03:00:00Z'));
    for (let i = 0; i < 20; i++) {
      if (listBackups(config).filter((entry) => entry.name.includes('-auto-')).length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(listBackups(config).filter((entry) => entry.name.includes('-auto-')).length).toBe(2);
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
