import { useState } from 'react';
import { addDays, format } from 'date-fns';
import type { CellEditorProps } from './CellEditor';
import { CellDisplay } from './CellDisplay';
import { Popover } from '../../components/ui/Popover';
import { Button } from '../../components/ui/Button';
import { useSetValue } from '../mutations';

export function DateCell(props: CellEditorProps) {
  const { column, item, users, boardId, statusDone } = props;
  const value = item.values[String(column.id)] as { date?: string; time?: string } | undefined;
  const setValue = useSetValue(boardId);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDate(value?.date ?? '');
          setTime(value?.time ?? '');
        }
      }}
      className="w-[260px]"
      trigger={
        <button className="flex h-full w-full items-center overflow-hidden text-left">
          {value?.date ? (
            <CellDisplay column={column} value={value} users={users} statusDone={statusDone} />
          ) : (
            <span className="text-sm text-muted">Pick a date</span>
          )}
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {[
          ['Today', 0],
          ['Tomorrow', 1],
          ['Next week', 7],
        ].map(([label, offset]) => (
          <button
            key={label}
            className="rounded-chip bg-surface-2 px-2 py-0.5 t-meta text-muted hover:bg-sunken hover:text-ink"
            onClick={() => setDate(format(addDays(new Date(), Number(offset)), 'yyyy-MM-dd'))}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="date"
        aria-label="Date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-2 h-full w-full rounded-control border border-line px-2 text-sm"
        autoFocus
      />
      {column.settings.includeTime && (
        <input
          type="time"
          aria-label="Time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mb-2 h-full w-full rounded-control border border-line px-2 text-sm"
        />
      )}
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
          disabled={!date}
          onClick={() => {
            setValue.mutate({
              itemId: item.id,
              columnId: column.id,
              value: { date, ...(time ? { time } : {}) },
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
