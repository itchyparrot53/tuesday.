import { describe, expect, test } from 'vitest';
import {
  FormulaError,
  columnRefs,
  computeFormulas,
  evaluate,
  parseFormula,
  refValue,
} from '../shared/formula';
import type { Column, Item } from '../shared/types';

const ctx = {
  today: '2026-10-18',
  ref: (title: string) => {
    const values: Record<string, number | string> = { Hours: 3, Name: 'Ada' };
    return values[title] ?? null;
  },
};

function value(expression: string) {
  return evaluate(parseFormula(expression), ctx);
}

describe('formula engine', () => {
  test.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 / 4', 2.5],
    ['10 % 3', 1],
    ['-5 + 2', -3],
    ['"a" & "b"', 'ab'],
    ['3 & 4', '34'],
    ['2 = 2', true],
    ['2 != 3', true],
    ['2 < 3', true],
    ['3 <= 3', true],
    ['4 > 5', false],
    ['IF(TRUE, 1, 2)', 1],
    ['IF(FALSE, 1, 2)', 2],
    ['AND(TRUE, FALSE)', false],
    ['OR(FALSE, TRUE)', true],
    ['NOT(FALSE)', true],
    ['SUM(1, 2, 3)', 6],
    ['AVERAGE(2, 4)', 3],
    ['MIN(3, 1, 2)', 1],
    ['MAX(3, 1, 2)', 3],
    ['ROUND(1.234, 2)', 1.23],
    ['ABS(-4)', 4],
    ['CONCAT("a", 1)', 'a1'],
    ['LEN("abc")', 3],
    ['UPPER("abc")', 'ABC'],
    ['LOWER("ABC")', 'abc'],
    ['DAYS("2026-01-01", "2026-01-10")', 9],
    ['ADD_DAYS("2026-01-01", 3)', '2026-01-04'],
    ['TODAY()', '2026-10-18'],
    ['{Hours} * 2', 6],
    ['{Hours} > 2', true],
  ] as [string, unknown][])('evaluates %s', (expression, expected) => {
    expect(value(expression)).toBe(expected);
  });

  test('collects column references case-sensitively', () => {
    expect(columnRefs(parseFormula('{Hours} * {Rate} + IF({Hours} > 0, 1, 0)'))).toEqual([
      'Hours',
      'Rate',
    ]);
  });

  test('reports division by zero and type errors', () => {
    expect(() => value('1 / 0')).toThrow(new FormulaError('#DIV/0'));
    expect(() => value('1 + "abc"')).toThrow(new FormulaError('#TYPE'));
  });

  test('reports parse errors with a position', () => {
    try {
      parseFormula('1 + @');
      throw new Error('should fail');
    } catch (err) {
      expect(err).toBeInstanceOf(FormulaError);
      expect((err as FormulaError).position).toBeGreaterThanOrEqual(0);
    }
    expect(() => parseFormula('constructor')).toThrow(FormulaError);
    expect(() => parseFormula('1 +')).toThrow(FormulaError);
  });

  test('rejects deeply nested formulas', () => {
    expect(() => parseFormula(`${'('.repeat(60)}1${')'.repeat(60)}`)).toThrow(/deeply/);
  });

  test('computes formula columns, references and cycles', () => {
    const columns: Column[] = [
      {
        id: 1,
        boardId: 1,
        title: 'Hours',
        type: 'number',
        settings: {},
        position: 1,
        width: 120,
      },
      {
        id: 2,
        boardId: 1,
        title: 'Double',
        type: 'formula',
        settings: { expression: '{Hours} * 2', format: 'number', decimals: 0 },
        position: 2,
        width: 120,
      },
      {
        id: 3,
        boardId: 1,
        title: 'Quad',
        type: 'formula',
        settings: { expression: '{Double} * 2' },
        position: 3,
        width: 120,
      },
      {
        id: 4,
        boardId: 1,
        title: 'Missing',
        type: 'formula',
        settings: { expression: '{Nope} + 1' },
        position: 4,
        width: 120,
      },
      {
        id: 5,
        boardId: 1,
        title: 'Cycle A',
        type: 'formula',
        settings: { expression: '{Cycle B} + 1' },
        position: 5,
        width: 120,
      },
      {
        id: 6,
        boardId: 1,
        title: 'Cycle B',
        type: 'formula',
        settings: { expression: '{Cycle A} + 1' },
        position: 6,
        width: 120,
      },
    ];
    const item: Item = {
      id: 1,
      boardId: 1,
      groupId: 1,
      parentId: null,
      name: 'Task',
      position: 1,
      createdBy: 1,
      createdAt: '',
      updatedAt: '',
      values: { '1': { number: 3 } },
      updateCount: 0,
    };
    const computed = computeFormulas(columns, item, {
      today: '2026-10-18',
      userName: () => '',
    });
    expect(computed[2]).toEqual({ formula: 6 });
    expect(computed[3]).toEqual({ formula: 12 });
    expect(computed[4]).toMatchObject({ formula: null, error: '#REF' });
    expect(computed[5]).toMatchObject({ error: '#CYCLE' });
    expect(computed[6]).toMatchObject({ error: '#CYCLE' });
  });

  test('refValue converts column values for formulas', () => {
    const column = (type: Column['type'], settings = {}): Column => ({
      id: 1,
      boardId: 1,
      title: 'X',
      type,
      settings,
      position: 1,
      width: 120,
    });
    expect(
      refValue(
        column('time_tracking'),
        { totalSeconds: 5400, runningSince: null, runningUserId: null },
        { userName: () => '' },
      ),
    ).toBe(1.5);
    expect(
      refValue(
        column('status', { labels: [{ id: 'done', name: 'Done', color: '#2BB673' }] }),
        { labelId: 'done' },
        { userName: () => '' },
      ),
    ).toBe('Done');
    expect(refValue(column('checkbox'), { checked: true }, { userName: () => '' })).toBe(true);
  });
});
