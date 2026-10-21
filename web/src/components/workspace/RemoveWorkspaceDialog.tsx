import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import type { Workspace } from '../../../../shared/types';

export function RemoveWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
  onRemoved,
}: {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [removing, setRemoving] = useState(false);

  if (!workspace) return null;

  const boardCount = workspace.boards.length;
  const dashboardCount = workspace.dashboards?.length ?? 0;
  const docCount = workspace.docs?.length ?? 0;
  const contents = [
    `${boardCount} ${boardCount === 1 ? 'board' : 'boards'}`,
    dashboardCount ? `${dashboardCount} ${dashboardCount === 1 ? 'dashboard' : 'dashboards'}` : '',
    docCount ? `${docCount} ${docCount === 1 ? 'doc' : 'docs'}` : '',
  ].filter(Boolean);

  async function remove() {
    if (!workspace || confirm.trim() !== workspace.name) return;
    setRemoving(true);
    try {
      await api('DELETE', `/workspaces/${workspace.id}`);
      await qc.invalidateQueries();
      toast.show('Workspace moved to Trash', 'success');
      setConfirm('');
      onOpenChange(false);
      onRemoved?.();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirm('');
        onOpenChange(next);
      }}
      title="Remove workspace"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={removing}
            disabled={confirm.trim() !== workspace.name}
            onClick={() => void remove()}
          >
            Remove workspace
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        This removes <span className="font-medium text-ink">{workspace.name}</span> and everything
        in it from Tuesday. {contents.join(', ')} will no longer be accessible to anyone.
      </p>
      <p className="mt-2 text-sm text-muted">You can restore it from Trash for 30 days.</p>
      <label htmlFor="remove-workspace-confirm" className="t-label mb-1 mt-4 block text-ink">
        Type the workspace name to confirm
      </label>
      <Input
        id="remove-workspace-confirm"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        placeholder={workspace.name}
        autoFocus
      />
    </Dialog>
  );
}
