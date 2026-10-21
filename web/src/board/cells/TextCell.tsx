import { useRef, useState } from 'react';
import type { CellEditorProps } from './CellEditor';
import { CellDisplay } from './CellDisplay';
import { Popover } from '../../components/ui/Popover';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Input';
import { useSetValue } from '../mutations';

export function TextCell(props: CellEditorProps) {
  const { column, item, users, boardId, statusDone } = props;
  const value = item.values[String(column.id)] as { text?: string } | undefined;
  const current = value?.text ?? '';
  const setValue = useSetValue(boardId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [longOpen, setLongOpen] = useState(false);
  const finished = useRef(false);

  function start() {
    finished.current = false;
    setDraft(current);
    setEditing(true);
  }

  function commit() {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    if (draft === current) return;
    setValue.mutate({
      itemId: item.id,
      columnId: column.id,
      value: draft.trim() ? { text: draft } : null,
    });
  }

  if (column.type === 'long_text') {
    return (
      <Popover
        open={longOpen}
        onOpenChange={(open) => {
          setLongOpen(open);
          if (open) setDraft(current);
        }}
        className="w-[320px]"
        trigger={
          <button
            aria-label={`Edit ${column.title}`}
            className="flex h-full w-full items-center truncate text-left"
          >
            <CellDisplay
              column={column}
              value={item.values[String(column.id)]}
              users={users}
              statusDone={statusDone}
            />
          </button>
        }
      >
        <Textarea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="mb-2"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLongOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setLongOpen(false);
              if (draft !== current) {
                setValue.mutate({
                  itemId: item.id,
                  columnId: column.id,
                  value: draft.trim() ? { text: draft } : null,
                });
              }
            }}
          >
            Save
          </Button>
        </div>
      </Popover>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            finished.current = true;
            setEditing(false);
          }
        }}
        className="h-8 w-full rounded-control border border-accent bg-surface px-1 text-sm outline-none"
      />
    );
  }

  return (
    <button onClick={start} className="flex h-full w-full items-center overflow-hidden text-left">
      {current ? (
        <span className="truncate text-sm text-ink">{current}</span>
      ) : (
        <span className="text-sm text-transparent">·</span>
      )}
    </button>
  );
}
