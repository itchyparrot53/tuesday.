import { describe, expect, test } from 'vitest';
import {
  DEFAULT_STATUS_LABELS,
  cellToText,
  defaultSettings,
  isEmptyValue,
  validateValue,
} from '../shared/columns';

const statusSettings = { labels: DEFAULT_STATUS_LABELS };

describe('column values', () => {
  test('status accepts a known label and rejects an unknown one', () => {
    expect(validateValue('status', statusSettings, 'done')).toEqual({ labelId: 'done' });
    expect(() => validateValue('status', statusSettings, 'nope')).toThrow(/Unknown status/);
  });

  test('people accepts integer ids only', () => {
    expect(validateValue('people', {}, [1, 2])).toEqual({ userIds: [1, 2] });
    expect(() => validateValue('people', {}, ['a'])).toThrow();
  });

  test('date validates format and optional time', () => {
    expect(validateValue('date', {}, { date: '2026-10-20' })).toEqual({ date: '2026-10-20' });
    expect(validateValue('date', {}, { date: '2026-10-20', time: '09:30' })).toEqual({
      date: '2026-10-20',
      time: '09:30',
    });
    expect(() => validateValue('date', {}, { date: '20/10/2026' })).toThrow();
  });

  test('timeline requires from <= to', () => {
    expect(validateValue('timeline', {}, { from: '2026-10-01', to: '2026-10-02' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-02',
    });
    expect(() => validateValue('timeline', {}, { from: '2026-10-03', to: '2026-10-02' })).toThrow();
  });

  test('text accepts both a raw string and a cell value', () => {
    expect(validateValue('text', {}, 'hello')).toEqual({ text: 'hello' });
    expect(validateValue('text', {}, { text: 'hello' })).toEqual({ text: 'hello' });
    expect(() => validateValue('text', {}, { number: 1 })).toThrow();
  });

  test('number accepts both a raw number and a cell value', () => {
    expect(validateValue('number', {}, 42)).toEqual({ number: 42 });
    expect(validateValue('number', {}, { number: 42 })).toEqual({ number: 42 });
    expect(() => validateValue('number', {}, { number: Number.NaN })).toThrow();
  });

  test('rating stays inside the configured maximum', () => {
    expect(validateValue('rating', { max: 5 }, 4)).toEqual({ rating: 4 });
    expect(() => validateValue('rating', { max: 5 }, 6)).toThrow(/Rating/);
    expect(() => validateValue('rating', { max: 5 }, 0)).toThrow();
  });

  test('email and link formats are checked', () => {
    expect(validateValue('email', {}, 'a@b.co')).toEqual({ text: 'a@b.co' });
    expect(() => validateValue('email', {}, 'not-an-email')).toThrow();
    expect(validateValue('link', {}, { url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
    });
    expect(() => validateValue('link', {}, { url: 'ftp://example.com' })).toThrow();
  });

  test('empty values are detected', () => {
    expect(isEmptyValue('text', { text: '  ' })).toBe(true);
    expect(isEmptyValue('status', { labelId: 'done' })).toBe(false);
    expect(isEmptyValue('checkbox', { checked: false })).toBe(true);
    expect(isEmptyValue('timeline', { from: '2026-01-01', to: '2026-01-02' })).toBe(false);
  });

  test('cellToText renders status, people and timeline', () => {
    expect(cellToText('status', statusSettings, { labelId: 'progress' }, () => '')).toBe(
      'In progress',
    );
    expect(
      cellToText('people', {}, { userIds: [1, 2] }, (id) => (id === 1 ? 'Ada' : 'Grace')),
    ).toBe('Ada, Grace');
    expect(cellToText('timeline', {}, { from: '2026-01-01', to: '2026-01-05' }, () => '')).toBe(
      '2026-01-01 → 2026-01-05',
    );
    expect(cellToText('rating', { max: 5 }, { rating: 4 }, () => '')).toBe('4/5');
    expect(
      cellToText(
        'number',
        { unit: 'USD', unitPosition: 'prefix', decimals: 2 },
        { number: 3 },
        () => '',
      ),
    ).toBe('USD3.00');
  });

  test('default settings match the contract', () => {
    expect(defaultSettings('rating')).toEqual({ max: 5 });
    expect(defaultSettings('ai')).toEqual({
      prompt: '',
      autoRun: true,
      output: 'text',
      labels: [],
    });
  });
});
