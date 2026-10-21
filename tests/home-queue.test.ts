import { describe, expect, test } from 'vitest';
import type { HomeSummary, MyWorkBucket } from '../shared/types';
import { buildQueue, dueLabel, lateDays } from '../web/src/home/queue';

const TODAY = '2026-10-19';

function entry(
  id: number,
  name: string,
  bucket: MyWorkBucket,
  dueDate: string | null,
  board = 'Board',
) {
  return {
    item: { id, name, values: {} },
    board: { id: 1, name: board, workspaceId: 1 },
    groupTitle: '',
    dueDate,
    statusColumnId: null,
    bucket,
    isDone: false,
  } as never;
}

function summary(myDay: HomeSummary['myDay']): HomeSummary {
  return {
    today: TODAY,
    counts: { open: 4, dueToday: 1, overdue: 2, doneThisWeek: 0 },
    myDay,
    week: [],
    doneTrend: [],
    mentions: [],
    boards: [],
    activity: [],
    onboarding: { show: false, steps: [] },
  };
}

describe('home focus queue', () => {
  test('ranks overdue oldest first, then today, then the next three days', () => {
    const queue = buildQueue(
      summary({
        overdue: [
          entry(1, 'Recent overdue', 'overdue', '2026-10-18'),
          entry(2, 'Old overdue', 'overdue', '2026-10-10'),
        ],
        today: [entry(3, 'Today item', 'today', TODAY)],
        upcoming: [
          entry(4, 'Later this week', 'this_week', '2026-10-21'),
          entry(5, 'Tomorrow', 'this_week', '2026-10-20'),
        ],
      }),
    );
    expect(queue.map((row) => row.item.name)).toEqual([
      'Old overdue',
      'Recent overdue',
      'Today item',
      'Tomorrow',
      'Later this week',
    ]);
  });

  test('never lists the same item twice', () => {
    const duplicate = entry(1, 'Same item', 'overdue', '2026-10-18');
    const queue = buildQueue(
      summary({
        overdue: [duplicate],
        today: [duplicate],
        upcoming: [duplicate],
      }),
    );
    expect(queue).toHaveLength(1);
  });

  test('labels late and future dates from the organisation today', () => {
    const late = entry(1, 'Late', 'overdue', '2026-10-14');
    expect(lateDays(late, TODAY)).toBe(5);
    expect(dueLabel(late, TODAY)).toBe('5 days late');

    const today = entry(2, 'Today', 'today', TODAY);
    expect(lateDays(today, TODAY)).toBe(0);
    expect(dueLabel(today, TODAY)).toBe('Today');

    const soon = entry(3, 'Soon', 'this_week', '2026-10-21');
    expect(dueLabel(soon, TODAY)).toBe('Wed 21');
  });
});
