import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardFull } from '../../../shared/types';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useFavorites } from '../hooks/useFavorites';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

export function QuickAddDialog({
  open,
  onOpenChange,
  initialName = '',
  initialText = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialText?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const me = useMe();
  const workspaces = useWorkspaces();
  const favorites = useFavorites();
  const [boardId, setBoardId] = useState(0);
  const [groupId, setGroupId] = useState(0);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [assign, setAssign] = useState(true);
  const [saving, setSaving] = useState(false);

  const boards = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards.map((board) => ({
      ...board,
      workspaceName: workspace.name,
      favorite: favorites.has('board', board.id),
    })),
  );
  const ordered = [
    ...boards.filter((board) => board.favorite),
    ...boards.filter((board) => !board.favorite),
  ];

  const board = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api<BoardFull>('GET', `/boards/${boardId}`),
    enabled: boardId > 0,
  });
  const dateColumn = board.data?.columns.find((column) => column.type === 'date');
  const peopleColumn = board.data?.columns.find((column) => column.type === 'people');

  useEffect(() => {
    if (open && initialName) setName(initialName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setName('');
      setDue('');
      setBoardId(0);
      setGroupId(0);
    }
  }, [open]);

  useEffect(() => {
    if (board.data && !board.data.groups.some((group) => group.id === groupId)) {
      setGroupId(board.data.groups[0]?.id ?? 0);
    }
  }, [board.data, groupId]);

  async function submit() {
    if (!boardId || !groupId || !name.trim()) return;
    setSaving(true);
    try {
      const values: Record<string, unknown> = {};
      if (dateColumn && due) values[String(dateColumn.id)] = { date: due };
      if (peopleColumn && assign && me.data)
        values[String(peopleColumn.id)] = { userIds: [me.data.user.id] };
      const result = await api<{ item: { id: number } }>('POST', `/boards/${boardId}/items`, {
        groupId,
        name: name.trim(),
        values,
      });
      if (initialText.trim()) {
        await api('POST', `/items/${result.item.id}/updates`, { body: initialText.trim() });
      }
      await qc.invalidateQueries({ queryKey: ['home'] });
      await qc.invalidateQueries({ queryKey: ['items', boardId] });
      onOpenChange(false);
      toast.show(
        initialText ? `Saved to ${board.data?.board.name ?? 'board'}` : 'Item created',
        'success',
        {
          label: 'Open',
          onClick: () => navigate(`/boards/${boardId}?item=${result.item.id}`),
        },
      );
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New item"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!boardId || !groupId || !name.trim()}
            loading={saving}
          >
            Create item
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="t-label mb-1 block text-ink">Board</span>
          <select
            aria-label="Board"
            value={boardId}
            onChange={(event) => setBoardId(Number(event.target.value))}
            className="h-9 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink outline-none focus:border-accent"
          >
            <option value={0}>Choose a board…</option>
            {ordered.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.favorite ? '★ ' : ''}
                {entry.name} · {entry.workspaceName}
              </option>
            ))}
          </select>
        </label>
        {board.data && (
          <label className="block">
            <span className="t-label mb-1 block text-ink">Group</span>
            <select
              aria-label="Group"
              value={groupId}
              onChange={(event) => setGroupId(Number(event.target.value))}
              className="h-9 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink outline-none focus:border-accent"
            >
              {board.data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="t-label mb-1 block text-ink">Name</span>
          <Input
            aria-label="Item name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What needs doing?"
          />
        </label>
        {dateColumn && (
          <label className="block">
            <span className="t-label mb-1 block text-ink">Due date</span>
            <Input
              type="date"
              aria-label="Due date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </label>
        )}
        {peopleColumn && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={assign}
              onChange={(event) => setAssign(event.target.checked)}
              className="accent-[var(--accent)]"
            />
            Assign to me
          </label>
        )}
      </div>
    </Dialog>
  );
}
