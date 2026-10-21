import { useState } from 'react';
import type { CellEditorProps } from './CellEditor';
import { CellDisplay } from './CellDisplay';
import { Popover } from '../../components/ui/Popover';
import { Button } from '../../components/ui/Button';
import { useSetValue } from '../mutations';

export function TimelineCell(props: CellEditorProps) {
  const { column, item, users, boardId, statusDone } = props;
  const value = item.values[String(column.id)] as { from?: string; to?: string } | undefined;
  const setValue = useSetValue(boardId);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFrom(value?.from ?? '');
          setTo(value?.to ?? '');
        }
      }}
      className="w-[280px]"
      trigger={
        <button className="flex h-full w-full items-center overflow-hidden text-left">
          {value?.from && value.to ? (
            <CellDisplay column={column} value={value} users={users} statusDone={statusDone} />
          ) : (
            <span className="text-sm text-muted">Set dates</span>
          )}
        </button>
      }
    >
      <label className="t-label mb-1 block text-ink" htmlFor="timeline-from">
        From
      </label>
      <input
        id="timeline-from"
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="mb-2 h-full w-full rounded-control border border-line px-2 text-sm"
      />
      <label className="t-label mb-1 block text-ink" htmlFor="timeline-to">
        To
      </label>
      <input
        id="timeline-to"
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="mb-3 h-full w-full rounded-control border border-line px-2 text-sm"
      />
      {from && to && from <= to && (
        <p className="mb-2 t-meta text-muted">
          {Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000))}{' '}
          days
        </p>
      )}
      <div className="mb-2 flex gap-1">
        {[
          { label: 'Today', offset: 0 },
          { label: 'Tomorrow', offset: 1 },
          { label: 'Next week', offset: 7 },
        ].map((option) => (
          <Button
            key={option.label}
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new Date();
              next.setDate(next.getDate() + option.offset);
              setTo(next.toISOString().slice(0, 10));
              if (!from) setFrom(new Date().toISOString().slice(0, 10));
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue.mutate({ itemId: item.id, columnId: column.id, value: null });
            setOpen(false);
          }}
        >
          Clear
        </Button>
        <Button
          size="sm"
          disabled={!from || !to || from > to}
          onClick={() => {
            setValue.mutate({
              itemId: item.id,
              columnId: column.id,
              value: { from, to },
            });
            setOpen(false);
          }}
        >
          Save
        </Button>
      </div>
    </Popover>
  );
}
