import { validateValue, type CellValue } from '../../shared/columns';
import type { Column, User } from '../../shared/types';
import { badRequest } from '../lib/errors';

function validNames(names: string[]): string {
  return names.join(', ');
}

export function parseHumanValue(
  column: Column,
  raw: string,
  users: User[],
  items?: { id: number; name: string }[],
): CellValue | null {
  const text = raw.trim();
  if (!text) return null;
  if (['formula', 'mirror', 'time_tracking', 'file'].includes(column.type)) {
    throw badRequest(`${column.type} columns are read-only for AI and import`);
  }
  const settings = column.settings;

  let value: CellValue;
  switch (column.type) {
    case 'status': {
      const labels = settings.labels ?? [];
      const label = labels.find((l) => l.name.toLowerCase() === text.toLowerCase());
      if (!label) {
        throw badRequest(
          `Unknown status "${text}". Valid: ${validNames(labels.map((l) => l.name))}`,
        );
      }
      value = { labelId: label.id };
      break;
    }
    case 'dropdown': {
      const options = settings.options ?? [];
      const names = text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      const ids: string[] = [];
      for (const name of names) {
        const option = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
        if (!option) {
          throw badRequest(
            `Unknown option "${name}". Valid: ${validNames(options.map((o) => o.name))}`,
          );
        }
        ids.push(option.id);
      }
      value = { optionIds: ids };
      break;
    }
    case 'people': {
      const tokens = text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      const ids: number[] = [];
      for (const token of tokens) {
        const needle = token.toLowerCase();
        let user = users.find(
          (u) => u.name.toLowerCase() === needle || u.email.toLowerCase() === needle,
        );
        if (!user) {
          const byFirst = users.filter((u) => u.name.split(/\s+/)[0].toLowerCase() === needle);
          if (byFirst.length === 1) user = byFirst[0];
        }
        if (!user) throw badRequest(`Unknown person "${token}"`);
        ids.push(user.id);
      }
      value = { userIds: ids };
      break;
    }
    case 'date': {
      const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?$/);
      if (!match) throw badRequest('Date must be YYYY-MM-DD with an optional HH:MM time');
      value = match[2] ? { date: match[1], time: match[2] } : { date: match[1] };
      break;
    }
    case 'timeline': {
      const [from, to] = text.split('..').map((part) => part.trim());
      if (!from || !to) throw badRequest('Timeline must be YYYY-MM-DD..YYYY-MM-DD');
      value = { from, to };
      break;
    }
    case 'checkbox': {
      const lowered = text.toLowerCase();
      if (['true', 'yes', '1'].includes(lowered)) value = { checked: true };
      else if (['false', 'no', '0'].includes(lowered)) value = { checked: false };
      else throw badRequest('Checkbox must be yes or no');
      break;
    }
    case 'number': {
      const number = Number(text);
      if (!Number.isFinite(number)) throw badRequest('Expected a number');
      value = { number };
      break;
    }
    case 'rating': {
      const rating = Number(text);
      if (!Number.isInteger(rating)) throw badRequest('Expected an integer rating');
      value = { rating };
      break;
    }
    case 'link':
      value = { url: text };
      break;
    case 'dependency':
    case 'connect': {
      if (!items) throw badRequest('Item links are read-only for AI and import');
      const ids = text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((name) => {
          const match = items.find((item) => item.name.toLowerCase() === name.toLowerCase());
          if (!match) throw badRequest(`Unknown item "${name}"`);
          return match.id;
        });
      value = { itemIds: ids };
      break;
    }
    default:
      value = { text };
      break;
  }

  try {
    return validateValue(column.type, settings, value);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Invalid value');
  }
}
