import { useState } from 'react';
import type { CellEditorProps } from './CellEditor';
import { CellDisplay } from './CellDisplay';
import { Popover } from '../../components/ui/Popover';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useSetValue } from '../mutations';

export function LinkCell(props: CellEditorProps) {
  const { column, item, boardId, users, statusDone } = props;
  const value = item.values[String(column.id)] as { url?: string; label?: string } | undefined;
  const setValue = useSetValue(boardId);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUrl(value?.url ?? '');
          setLabel(value?.label ?? '');
        }
      }}
      className="w-[320px]"
      trigger={
        <button className="flex h-full w-full items-center overflow-hidden text-left">
          {value?.url ? (
            <CellDisplay column={column} value={value} users={users} statusDone={statusDone} />
          ) : (
            <span className="text-sm text-muted">Link</span>
          )}
        </button>
      }
    >
      <label className="mb-1 block text-sm font-medium">URL</label>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://"
        className="mb-2"
        autoFocus
      />
      <label className="mb-1 block text-sm font-medium">Label (optional)</label>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mb-3" />
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
          disabled={!url.startsWith('http://') && !url.startsWith('https://')}
          onClick={() => {
            setValue.mutate({
              itemId: item.id,
              columnId: column.id,
              value: { url, ...(label ? { label } : {}) },
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
