import { useState } from 'react';
import { Check } from 'lucide-react';
import type { CellEditorProps } from './CellEditor';
import { CellDisplay } from './CellDisplay';
import { Popover } from '../../components/ui/Popover';
import { useSetValue } from '../mutations';
import { labelStyle, useTheme } from '../../lib/labelColors';

export function PeopleCell(props: CellEditorProps) {
  const theme = useTheme();
  const { column, item, users, boardId, statusDone } = props;
  const value = item.values[String(column.id)] as { userIds?: number[] } | undefined;
  const selected = value?.userIds ?? [];
  const setValue = useSetValue(boardId);
  const [search, setSearch] = useState('');
  const list = [...users.values()].filter(
    (u) => u.isActive && u.name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(userId: number) {
    const next = selected.includes(userId)
      ? selected.filter((id) => id !== userId)
      : [...selected, userId];
    setValue.mutate({
      itemId: item.id,
      columnId: column.id,
      value: next.length ? { userIds: next } : null,
    });
  }

  return (
    <Popover
      className="w-[260px]"
      trigger={
        <button className="flex h-full w-full items-center justify-center overflow-hidden text-left">
          {selected.length ? (
            <CellDisplay column={column} value={value} users={users} statusDone={statusDone} />
          ) : (
            <span className="text-sm text-muted">Choose people</span>
          )}
        </button>
      }
    >
      <div className="mb-1 flex flex-wrap gap-1 border-b border-line pb-2">
        {selected.map((id) => {
          const user = users.get(id);
          if (!user) return null;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-sm"
            >
              {user.name}
              <button
                aria-label={`Remove ${user.name}`}
                className="text-muted hover:text-danger"
                onClick={() => toggle(id)}
              >
                ×
              </button>
            </span>
          );
        })}
        {selected.length === 0 && <span className="text-xs text-muted">No one yet</span>}
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search people"
        placeholder="Search people"
        className="mb-1 h-8 w-full rounded-control border border-line px-2 text-sm outline-none"
      />
      <div className="max-h-[240px] space-y-0.5 overflow-auto pt-1">
        {list.map((user) => (
          <button
            key={user.id}
            onClick={() => toggle(user.id)}
            className="flex h-8 w-full items-center gap-2 rounded-control px-1.5 text-left text-sm hover:bg-sunken"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full t-meta font-semibold"
              style={{
                backgroundColor: labelStyle(user.color, theme).tint,
                color: labelStyle(user.color, theme).text,
              }}
            >
              {user.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">{user.name}</span>
              {user.title && <span className="block truncate t-meta text-muted">{user.title}</span>}
            </span>
            {selected.includes(user.id) && <Check size={14} className="text-accent" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}
