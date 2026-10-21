import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AiColumnDialog } from '../ai/AiColumnDialog';
import { ColumnConfigDialog } from './ColumnConfigDialog';
import { MoreHorizontal } from 'lucide-react';
import type { Column } from '../../../shared/types';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { COLUMN_ICONS } from './columnIcons';
import { LabelEditor } from './cells/LabelEditor';
import { useDeleteColumn, useUpdateColumn } from './mutations';

export function ColumnHeader({
  column,
  boardId,
  columns,
  onHide,
}: {
  column: Column;
  boardId: number;
  columns: Column[];
  onHide: (columnId: number) => void;
}) {
  const Icon = COLUMN_ICONS[column.type];
  const update = useUpdateColumn(boardId);
  const remove = useDeleteColumn(boardId);
  const qc = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [width, setWidth] = useState(column.width);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  useEffect(() => setWidth(column.width), [column.width]);
  useEffect(() => setTitle(column.title), [column.title]);

  const index = columns.findIndex((c) => c.id === column.id);

  function startResize(event: React.MouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let next = startWidth;
    const move = (e: MouseEvent) => {
      next = Math.min(480, Math.max(80, startWidth + e.clientX - startX));
      setWidth(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (next !== startWidth) update.mutate({ columnId: column.id, width: next });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <div
      data-testid="column-header"
      data-column-title={column.title}
      className="relative flex h-9 shrink-0 items-center gap-1.5 border-r border-line bg-surface-2 px-2 t-label text-muted"
      style={{ width }}
    >
      <Icon size={14} className="shrink-0" />
      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            setRenaming(false);
            if (title.trim() && title !== column.title) {
              update.mutate({ columnId: column.id, title: title.trim() });
            } else {
              setTitle(column.title);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setTitle(column.title);
              setRenaming(false);
            }
          }}
          className="h-6 min-w-0 flex-1 rounded-control border border-accent bg-surface px-1 text-sm outline-none"
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={() => setRenaming(true)}
          title={column.title}
        >
          {column.title}
        </span>
      )}
      <Menu
        trigger={
          <button
            aria-label={`Column menu for ${column.title}`}
            className="rounded-control p-0.5 text-muted opacity-0 hover:bg-sunken group-hover:opacity-100"
          >
            <MoreHorizontal size={13} />
          </button>
        }
      >
        <MenuItem onSelect={() => setRenaming(true)}>Rename</MenuItem>
        <MenuItem
          disabled={index <= 0}
          onSelect={() =>
            update.mutate({
              columnId: column.id,
              afterColumnId: index > 1 ? columns[index - 2].id : null,
            })
          }
        >
          Move left
        </MenuItem>
        <MenuItem
          disabled={index < 0 || index >= columns.length - 1}
          onSelect={() =>
            update.mutate({
              columnId: column.id,
              afterColumnId: columns[index + 1].id,
            })
          }
        >
          Move right
        </MenuItem>
        <MenuItem onSelect={() => onHide(column.id)}>Hide in this view</MenuItem>
        {column.type === 'status' && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => setLabelsOpen(true)}>Statuses and done</MenuItem>
          </>
        )}
        {['formula', 'dependency', 'connect', 'mirror', 'time_tracking', 'file'].includes(
          column.type,
        ) && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => setConfigOpen(true)}>Edit settings</MenuItem>
          </>
        )}
        {column.type === 'ai' && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => setAiOpen(true)}>Edit AI settings</MenuItem>
            <MenuItem
              onSelect={async () => {
                await api('POST', `/columns/${column.id}/ai-run`, {});
                await qc.invalidateQueries({ queryKey: ['items', boardId] });
                await qc.invalidateQueries({ queryKey: ['board', boardId] });
              }}
            >
              Run for all items
            </MenuItem>
          </>
        )}
        <MenuSeparator />
        <MenuItem danger onSelect={() => setDeleteOpen(true)}>
          Delete
        </MenuItem>
      </Menu>
      <span
        onMouseDown={startResize}
        className="absolute -right-0.5 top-0 h-full w-0.5 cursor-col-resize hover:bg-accent"
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete column"
        description={`Delete "${column.title}"? Values in this column will be removed.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                remove.mutate(column.id);
                setDeleteOpen(false);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">This cannot be undone.</p>
      </Dialog>

      <Dialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        title={`${column.title} statuses`}
        description="Rename statuses, add new ones, and choose which count as done. Done items leave My work and the Home queue."
      >
        <LabelEditor
          labels={column.settings.labels ?? []}
          allowDone
          doneLabelIds={column.settings.doneLabelIds ?? []}
          onCancel={() => setLabelsOpen(false)}
          onSave={(labels, doneLabelIds) => {
            update.mutate(
              { columnId: column.id, settings: { labels, doneLabelIds } },
              { onSuccess: () => setLabelsOpen(false) },
            );
          }}
        />
      </Dialog>

      <ColumnConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        boardId={boardId}
        columns={columns}
        type={column.type}
        column={column}
      />

      <AiColumnDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        boardId={boardId}
        columns={columns}
        column={column}
      />
    </div>
  );
}
