import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import type { BoardFull } from '../../../shared/types';

export function DuplicateBoardDialog({
  boardId,
  defaultName,
  workspaceId,
  open,
  onOpenChange,
}: {
  boardId: number;
  defaultName: string;
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const [name, setName] = useState(`${defaultName} (copy)`);
  const [targetWorkspace, setTargetWorkspace] = useState(workspaceId);
  const [includeItems, setIncludeItems] = useState(true);
  const [saving, setSaving] = useState(false);

  async function duplicate() {
    setSaving(true);
    try {
      const full = await api<BoardFull>('POST', `/boards/${boardId}/duplicate`, {
        name,
        workspaceId: targetWorkspace,
        includeItems,
      });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      onOpenChange(false);
      navigate(`/boards/${full.board.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Duplicate board"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!name.trim()} onClick={duplicate}>
            Duplicate
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-sm font-medium">Name</label>
      <Input
        aria-label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="mb-3"
      />
      <label className="mb-1 block text-sm font-medium">Workspace</label>
      <Select
        ariaLabel="Workspace"
        value={String(targetWorkspace)}
        onChange={(value) => setTargetWorkspace(Number(value))}
        options={(workspaces.data ?? []).map((workspace) => ({
          value: String(workspace.id),
          label: workspace.name,
        }))}
        className="mb-3"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeItems}
          onChange={(event) => setIncludeItems(event.target.checked)}
        />
        Include items
      </label>
    </Dialog>
  );
}
