import type { Column, User } from '../../../../shared/types';
import { shortDate, isPastDate } from '../../lib/format';
import { cn } from '../../lib/cn';
import { Check, Clock, Star } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { DEFAULT_LABEL_COLOR, labelStyle, useTheme } from '../../lib/labelColors';

function formatNumber(settings: Column['settings'], n: number): string {
  const decimals = settings.decimals ?? 0;
  const text = n.toFixed(decimals);
  const unit = settings.unit ?? '';
  if (!unit) return text;
  return settings.unitPosition === 'prefix' ? `${unit}${text}` : `${text}${unit}`;
}

export function CellDisplay({
  column,
  value,
  users,
  statusDone,
}: {
  column: Column;
  value: unknown;
  users: Map<number, User>;
  statusDone: boolean;
}) {
  const theme = useTheme();
  if (!value) return null;

  switch (column.type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone':
      return (
        <span className="w-full truncate text-sm text-ink">{(value as { text: string }).text}</span>
      );
    case 'number':
      return (
        <span className="w-full truncate text-center text-sm text-ink">
          {formatNumber(column.settings, (value as { number: number }).number)}
        </span>
      );
    case 'status': {
      const label = column.settings.labels?.find(
        (l) => l.id === (value as { labelId: string }).labelId,
      );
      if (!label) return null;
      return (
        <div className="status-cell flex h-[var(--row-h)] w-full items-center justify-center">
          <span
            className={cn(
              'status-pill flex h-full w-full items-center justify-center gap-1 px-2 text-sm font-semibold',
              statusDone && 'status-done-pop',
            )}
            style={{
              backgroundColor: labelStyle(label.color, theme).tint,
              color: labelStyle(label.color, theme).text,
            }}
          >
            {statusDone && <Check size={13} className="shrink-0" />}
            {label.name}
          </span>
        </div>
      );
    }
    case 'dropdown': {
      const ids = (value as { optionIds: string[] }).optionIds;
      return (
        <div className="flex w-full flex-wrap justify-center gap-1 overflow-hidden">
          {ids.slice(0, 2).map((id) => {
            const option = column.settings.options?.find((o) => o.id === id);
            if (!option) return null;
            return (
              <span
                key={id}
                className="rounded-chip px-1.5 py-0.5 t-meta font-medium"
                style={{
                  backgroundColor: labelStyle(option.color, theme).tint,
                  color: labelStyle(option.color, theme).text,
                }}
              >
                {option.name}
              </span>
            );
          })}
          {ids.length > 2 && <span className="t-meta text-muted">+{ids.length - 2}</span>}
        </div>
      );
    }
    case 'people': {
      const chosen = (value as { userIds: number[] }).userIds
        .map((id) => users.get(id))
        .filter(Boolean) as User[];
      return (
        <div className="flex w-full items-center justify-center">
          {chosen.slice(0, 3).map((user, index) => (
            <span key={user.id} className={index > 0 ? '-ml-1.5' : ''}>
              <Avatar
                name={user.name}
                color={user.color}
                size={24}
                className="ring-2 ring-surface"
              />
            </span>
          ))}
          {chosen.length > 3 && (
            <span className="ml-1 t-meta text-muted">+{chosen.length - 3}</span>
          )}
        </div>
      );
    }
    case 'date': {
      const v = value as { date: string; time?: string };
      const overdue = isPastDate(v.date) && !statusDone;
      return (
        <span
          className={cn(
            'flex w-full min-w-0 items-center justify-center gap-1 truncate text-sm',
            overdue ? 'text-danger' : 'text-ink',
          )}
        >
          {overdue && <Clock size={12} className="shrink-0" />}
          <span className="truncate">
            {shortDate(v.date)}
            {v.time ? ` ${v.time}` : ''}
          </span>
        </span>
      );
    }
    case 'timeline': {
      const v = value as { from: string; to: string };
      return (
        <span
          className="truncate rounded-chip px-1.5 py-0.5 t-meta font-medium"
          style={{
            backgroundColor: labelStyle(DEFAULT_LABEL_COLOR, theme).tint,
            color: labelStyle(DEFAULT_LABEL_COLOR, theme).text,
          }}
        >
          {shortDate(v.from)} – {shortDate(v.to)}
        </span>
      );
    }
    case 'checkbox':
      return (value as { checked: boolean }).checked ? (
        <Check size={15} className="mx-auto text-success" />
      ) : null;
    case 'link': {
      const v = value as { url: string; label?: string };
      return (
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="w-full truncate text-center text-sm text-accent hover:underline"
        >
          {v.label || v.url}
        </a>
      );
    }
    case 'rating': {
      const rating = (value as { rating: number }).rating;
      const max = column.settings.max ?? 5;
      return (
        <div className="flex w-full items-center justify-center gap-0.5">
          {Array.from({ length: max }).map((_, i) => (
            <Star
              key={i}
              size={13}
              className={i < rating ? 'fill-warning text-warning' : 'text-line-strong'}
            />
          ))}
        </div>
      );
    }
    case 'file': {
      const count = ((value as { fileIds?: number[] }).fileIds ?? []).length;
      if (!count) return null;
      return (
        <span className="truncate t-meta text-muted">
          📎 {count} file{count === 1 ? '' : 's'}
        </span>
      );
    }
    case 'ai': {
      const v = value as { text: string; labelId?: string };
      if (v.labelId) {
        const label = column.settings.labels?.find((l) => l.id === v.labelId);
        if (label) {
          return (
            <span
              className="truncate rounded-chip px-1.5 py-0.5 t-meta font-medium"
              style={{
                backgroundColor: labelStyle(label.color, theme).tint,
                color: labelStyle(label.color, theme).text,
              }}
            >
              {label.name}
            </span>
          );
        }
      }
      return <span className="truncate text-sm text-ink">{v.text}</span>;
    }
  }
}
