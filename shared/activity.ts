import type { Activity } from './types';

export function describeActivity(entry: Activity): string {
  switch (entry.action) {
    case 'item_created':
      return 'created this item';
    case 'item_renamed':
      return `changed the name from "${String(entry.data.from ?? '')}" to "${String(entry.data.to ?? '')}"`;
    case 'value_changed':
      return `changed ${String(entry.data.columnTitle ?? 'a field')} from "${String(entry.data.from ?? '')}" to "${String(entry.data.to ?? '')}"`;
    case 'item_moved':
      return `moved this item from ${String(entry.data.from ?? 'a group')} to ${String(entry.data.to ?? 'a group')}`;
    case 'item_archived':
      return 'archived this item';
    case 'update_posted':
      return 'posted an update';
    case 'board_created':
      return 'created this board';
    default:
      return String(entry.action).replace(/_/g, ' ');
  }
}
