import { useState } from 'react';
import { Archive, MoveRight, X } from 'lucide-react';
import type { BoardFull } from '../../../shared/types';
import { Button } from '../components/ui/Button';
import { Menu, MenuItem } from '../components/ui/Menu';
import { Dialog } from '../components/ui/Dialog';
import { useArchiveItems, useBulkMove } from './mutations';

export function BulkBar({
  boardId,
  full,
  selected,
  onClear,
}: {
  boardId: number;
  full: BoardFull;
  selected: Set<number>;
  onClear: () => void;
}) {
  const archive = useArchiveItems(boardId);
  const move = useBulkMove(boardId);
  const [confirm, setConfirm] = useState(false);
  const count = selected.size;
  if (count === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-pop border border-line bg-surface px-4 text-ink shadow-pop">
        <span className="mr-1 text-sm">{count} selected</span>
        <Menu
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="text-ink hover:bg-sunken"
              icon={<MoveRight size={14} />}
            >
              Move to group
            </Button>
          }
        >
          {full.groups.map((group) => (
            <MenuItem
              key={group.id}
              onSelect={() => {
                move.mutate({ itemIds: [...selected], groupId: group.id });
                onClear();
              }}
            >
              {group.title}
            </MenuItem>
          ))}
        </Menu>
        <Button
          variant="ghost"
          size="sm"
          className="text-ink hover:bg-sunken"
          icon={<Archive size={14} />}
          onClick={() => setConfirm(true)}
        >
          Archive
        </Button>
        <button
          aria-label="Clear selection"
          className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
          onClick={onClear}
        >
          <X size={15} />
        </button>
      </div>

      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Archive ${count} item${count === 1 ? '' : 's'}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                archive.mutate([...selected]);
                onClear();
                setConfirm(false);
              }}
            >
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Archived items are hidden from the board.</p>
      </Dialog>
    </>
  );
}
