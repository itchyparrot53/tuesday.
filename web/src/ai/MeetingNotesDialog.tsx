import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useUsers } from '../hooks/useUsers';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input, Textarea } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import type { ActionDraft, BoardFull } from '../../../shared/types';

interface Row extends ActionDraft {
  include: boolean;
}

export function MeetingNotesDialog({
  open,
  onOpenChange,
  initialBoardId,
  initialText = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBoardId?: number;
  initialText?: string;
}) {
  const workspaces = useWorkspaces();
  const users = useUsers();
  const boards = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards.map((board) => ({ ...board, workspaceId: workspace.id })),
  );
  const [boardId, setBoardId] = useState<number | null>(initialBoardId ?? null);
  const [text, setText] = useState(initialText);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [saveDoc, setSaveDoc] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const board = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api<BoardFull>('GET', `/boards/${boardId}`),
    enabled: Boolean(boardId),
  });

  async function find() {
    if (!boardId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api<{ actions: ActionDraft[] }>('POST', '/ai/extract-actions', {
        boardId,
        text,
      });
      setRows(result.actions.map((action) => ({ ...action, include: true })));
      setGroupId(board.data?.groups[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!boardId || !groupId || !rows) return;
    setCreating(true);
    setError('');
    try {
      const workspaceId = boards.find((entry) => entry.id === boardId)?.workspaceId;
      await api('POST', '/ai/create-actions', {
        boardId,
        groupId,
        actions: rows
          .filter((row) => row.include)
          .map(({ include: _include, ...action }) => action),
        ...(saveDoc && workspaceId
          ? {
              saveDoc: {
                workspaceId,
                title: `Meeting notes ${new Date().toISOString().slice(0, 10)}`,
                text,
              },
            }
          : {}),
      });
      onOpenChange(false);
      setRows(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      (current ?? []).map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Meeting notes → items"
      wide
      footer={
        rows ? (
          <>
            <Button variant="secondary" onClick={() => setRows(null)}>
              Back
            </Button>
            <Button loading={creating} onClick={create}>
              Create {rows.filter((row) => row.include).length} items
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={loading} disabled={!text.trim() || !boardId} onClick={find}>
              Find action items
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <div>
          <label className="mb-1 block text-sm font-medium">Board</label>
          <select
            aria-label="Board"
            value={boardId ?? ''}
            onChange={(event) => setBoardId(Number(event.target.value))}
            className="mb-3 h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
          >
            <option value="">Choose a board…</option>
            {boards.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <label className="mb-1 block text-sm font-medium">Notes or transcript</label>
          <Textarea
            data-testid="meeting-notes-input"
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste meeting notes or a transcript…"
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveDoc}
              onChange={(event) => setSaveDoc(event.target.checked)}
            />
            Save notes as a workspace doc
          </label>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <label className="t-meta font-medium">Create in group</label>
            <select
              value={groupId ?? ''}
              onChange={(event) => setGroupId(Number(event.target.value))}
              className="h-8 rounded-control border border-line bg-surface px-2 text-sm"
            >
              {(board.data?.groups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={index}
                data-testid="meeting-action-row"
                className="rounded-control border border-line p-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => update(index, { include: event.target.checked })}
                  />
                  <Input
                    value={row.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    className="h-7 t-meta"
                  />
                </div>
                <div className="mt-1 flex gap-1">
                  <select
                    value={row.ownerUserId ?? ''}
                    onChange={(event) =>
                      update(index, {
                        ownerUserId: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    className="h-7 rounded-control border border-line bg-surface px-1 t-meta"
                  >
                    <option value="">No owner</option>
                    {(users.data?.users ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="date"
                    value={row.dueDate ?? ''}
                    onChange={(event) => update(index, { dueDate: event.target.value || null })}
                    className="h-7 w-32 t-meta"
                  />
                  <Input
                    value={row.notes}
                    onChange={(event) => update(index, { notes: event.target.value })}
                    className="h-7 min-w-0 flex-1 t-meta"
                  />
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner size={12} /> No action items found.
              </p>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Dialog>
  );
}
