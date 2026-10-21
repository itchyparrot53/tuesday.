import { expect, type Page } from '@playwright/test';
import { H } from './helpers';

export interface Seed {
  workspaceId: number;
  boardId: number;
  dashboardId: number;
  docId: number;
  formToken: string;
  itemIds: number[];
  groupIds: number[];
  columnIds: Record<string, number>;
}

const ITEM_NAMES = [
  'Kickoff workshop',
  'Write messaging brief',
  'Design homepage',
  'Build pricing page',
  'Collect customer quotes',
  'Shoot product photos',
  'Accessibility review',
  'Launch email',
  'Press outreach',
  'Analytics setup',
  'Retro and next steps',
  'Announce on LinkedIn',
];

export async function seed(page: Page): Promise<Seed> {
  const workspaceList = await (await page.request.get('/api/workspaces')).json();
  let workspace = workspaceList.workspaces.find(
    (entry: { name: string }) => entry.name === 'Studio',
  );
  if (!workspace) {
    const created = await page.request.post('/api/workspaces', {
      headers: H,
      data: { name: 'Studio', color: '#FF6FB1' },
    });
    expect(created.status()).toBe(201);
    workspace = (await created.json()).workspace;
  }
  const workspaceId = workspace.id as number;
  const boards = await (await page.request.get('/api/workspaces')).json();
  const existingBoard = boards.workspaces
    .find((entry: { id: number }) => entry.id === workspaceId)
    ?.boards?.find((entry: { name: string }) => entry.name === 'Website relaunch');
  if (existingBoard) {
    const full = await (await page.request.get(`/api/boards/${existingBoard.id}`)).json();
    const dashboards = await (await page.request.get('/api/workspaces')).json();
    const dashboard = dashboards.workspaces.find(
      (entry: { id: number }) => entry.id === workspaceId,
    )?.dashboards?.[0];
    const doc = dashboards.workspaces
      .find((entry: { id: number }) => entry.id === workspaceId)
      ?.docs?.find((entry: { title: string }) => entry.title === 'Relaunch brief');
    const forms = await (await page.request.get(`/api/boards/${existingBoard.id}/forms`)).json();
    const existingItems = await (
      await page.request.get(`/api/boards/${existingBoard.id}/items`)
    ).json();
    return {
      workspaceId,
      boardId: existingBoard.id,
      dashboardId: dashboard?.id ?? 0,
      docId: doc?.id ?? 0,
      formToken: forms.forms?.[0]?.token ?? '',
      itemIds: (existingItems.items ?? []).map((item: { id: number }) => item.id),
      groupIds: full.groups.map((group: { id: number }) => group.id),
      columnIds: Object.fromEntries(
        full.columns.map((column: { title: string; id: number }) => [
          column.title.toLowerCase().replace(/\s+/g, '_'),
          column.id,
        ]),
      ),
    };
  }
  const boardRes = await page.request.post('/api/boards', {
    headers: H,
    data: {
      workspaceId,
      name: 'Website relaunch',
      description: 'Q4 launch plan for the new site.',
    },
  });
  expect(boardRes.status()).toBe(201);
  const full = await boardRes.json();
  const boardId = full.board.id as number;
  const columnIds: Record<string, number> = {};
  for (const column of full.columns as { id: number; title: string }[]) {
    columnIds[column.title.toLowerCase().replace(/\s+/g, '_')] = column.id;
  }
  const extraColumns = [
    ['Timeline', 'timeline'],
    ['Priority', 'dropdown'],
    ['Budget', 'number'],
    ['Approved', 'checkbox'],
    ['Brief', 'link'],
    ['Contact', 'email'],
    ['Notes', 'long_text'],
    ['Effort', 'rating'],
    ['Phone', 'phone'],
    ['Text', 'text'],
    ['File', 'file'],
    ['Formula', 'formula'],
    ['Dependency', 'dependency'],
    ['Connected', 'connect'],
    ['Mirror', 'mirror'],
    ['Time tracking', 'time_tracking'],
    ['AI summary', 'ai'],
  ] as const;
  for (const [title, type] of extraColumns) {
    const settings: Record<string, unknown> = {};
    if (type === 'formula') settings.expression = '{Budget} * 0.1';
    if (type === 'dependency') settings.autoShift = true;
    if (type === 'connect') {
      settings.targetBoardId = boardId;
      settings.allowMultiple = true;
    }
    if (type === 'mirror') {
      settings.connectColumnId = columnIds.connected;
      settings.targetColumnId = columnIds.status;
      settings.aggregate = 'list';
    }
    if (type === 'ai') {
      settings.prompt = 'Summarise {{name}} in one sentence.';
      settings.autoRun = false;
      settings.output = 'text';
    }
    const res = await page.request.post(`/api/boards/${boardId}/columns`, {
      headers: H,
      data: { title, type, ...(Object.keys(settings).length ? { settings } : {}) },
    });
    if (res.status() === 201) {
      columnIds[title.toLowerCase()] = (await res.json()).column.id;
    }
  }
  const launched = await page.request.post(`/api/boards/${boardId}/groups`, {
    headers: H,
    data: { title: 'Launched', color: '#14B8A6' },
  });
  expect(launched.status()).toBe(201);
  const groupIds = [
    full.groups[0].id as number,
    full.groups[1].id as number,
    (await launched.json()).group.id as number,
  ];
  const me = await (await page.request.get('/api/auth/me')).json();
  const ownerId = me.user.id as number;
  const itemIds: number[] = [];
  const plusDays = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  for (let i = 0; i < ITEM_NAMES.length; i++) {
    const item = await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: {
        groupId: groupIds[i % 3],
        name: ITEM_NAMES[i],
        values: {
          [String(columnIds.status)]: {
            labelId: i % 4 === 0 ? 'done' : i % 3 === 0 ? 'progress' : 'todo',
          },
          [String(columnIds.owner)]: { userIds: [ownerId] },
          [String(columnIds.due_date)]: { date: `2026-10-${20 + (i % 9)}` },
          ...(columnIds.timeline
            ? {
                [String(columnIds.timeline)]: (() => {
                  const from = `2026-10-${String(15 + (i % 10)).padStart(2, '0')}`;
                  return { from, to: plusDays(from, 5) };
                })(),
              }
            : {}),
          ...(columnIds.priority
            ? {
                [String(columnIds.priority)]: {
                  optionIds: [
                    (await (await page.request.get(`/api/boards/${boardId}`)).json()).columns.find(
                      (column: { id: number }) => column.id === columnIds.priority,
                    )?.settings.options?.[i % 3]?.id,
                  ].filter(Boolean),
                },
              }
            : {}),
          ...(columnIds.budget ? { [String(columnIds.budget)]: { number: 4000 + i * 750 } } : {}),
          ...(columnIds.effort ? { [String(columnIds.effort)]: { rating: (i % 5) + 1 } } : {}),
        },
      },
    });
    expect(item.status()).toBe(201);
    itemIds.push((await item.json()).item.id);
  }
  await page.request.post(`/api/items/${itemIds[0]}/updates`, {
    headers: H,
    data: { body: 'Kickoff went well. **Next:** finalise the brief by Friday.' },
  });
  await page.request.post(`/api/items/${itemIds[1]}/updates`, {
    headers: H,
    data: { body: 'Nina is reviewing the first draft. Feedback by Monday, please.' },
  });
  for (const name of ['Draft the hero copy', 'Review with Nina']) {
    await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: { groupId: groupIds[1], parentId: itemIds[1], name },
    });
  }
  if (columnIds.file) {
    if (columnIds.dependency) {
      await page.request.put(`/api/items/${itemIds[1]}/values/${columnIds.dependency}`, {
        headers: H,
        data: { value: { itemIds: [itemIds[0]] } },
      });
    }
    if (columnIds.connected) {
      await page.request.put(`/api/items/${itemIds[1]}/values/${columnIds.connected}`, {
        headers: H,
        data: { value: { itemIds: [itemIds[0]] } },
      });
    }
    await page.request.post(`/api/items/${itemIds[0]}/files`, {
      headers: { 'x-requested-with': 'tuesday' },
      multipart: {
        file: {
          name: 'brand-notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Warm, direct, human.'),
        },
        columnId: String(columnIds.file),
      },
    });
  }
  const dashboardRes = await page.request.post('/api/dashboards', {
    headers: H,
    data: { workspaceId, name: 'Launch overview', boardIds: [boardId] },
  });
  const dashboardId = dashboardRes.status() === 201 ? (await dashboardRes.json()).dashboard.id : 0;
  const docRes = await page.request.post('/api/docs', {
    headers: H,
    data: {
      workspaceId,
      title: 'Relaunch brief',
      content:
        '# Website relaunch\n\nThe new site ships in three phases. Keep the tone warm and direct.\n\n## Decisions\n\n- One accent colour\n- Editorial typography\n- No stock photography\n\n- [x] Kickoff\n- [ ] Final copy review\n',
    },
  });
  const docId = docRes.status() === 201 ? (await docRes.json()).doc.id : 0;
  await page.request.post(`/api/boards/${boardId}/automations`, {
    headers: H,
    data: {
      name: 'Notify when done',
      trigger: { type: 'status_changed', columnId: columnIds.status, toLabelId: 'done' },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: '{{name}} is done' }],
    },
  });
  const formRes = await page.request.post(`/api/boards/${boardId}/forms`, {
    headers: H,
    data: { title: 'Website feedback' },
  });
  const formToken = formRes.status() === 201 ? (await formRes.json()).form.token : '';
  const trashItem = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId: groupIds[0], name: 'Old launch brief' },
  });
  if (trashItem.status() === 201) {
    await page.request.delete(`/api/items/${(await trashItem.json()).item.id}`, { headers: H });
  }
  await page.request.post('/api/me/tokens', {
    headers: H,
    data: { name: 'Design gallery token', scope: 'read' },
  });
  return {
    workspaceId,
    boardId,
    dashboardId,
    docId,
    formToken,
    itemIds,
    groupIds,
    columnIds,
  };
}
