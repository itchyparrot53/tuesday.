import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useUsers } from '../hooks/useUsers';
import type { BulkEditFields, BulkQueueRow } from './useQueueActions';

export function BulkEditDialog({
  rows,
  open,
  onOpenChange,
  onApply,
}: {
  rows: BulkQueueRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (fields: BulkEditFields) => void;
}) {
  const users = useUsers();
  const [status, setStatus] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const statusNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      const column = row.board?.columns.find((candidate) => candidate.type === 'status');
      for (const label of column?.settings.labels ?? []) names.add(label.name);
    }
    return [...names].sort();
  }, [rows]);
  const userOptions = useMemo(
    () => [
      { value: '', label: 'No change' },
      ...[...(users.data?.byId ?? new Map()).values()]
        .filter((user) => user.isActive)
        .map((user) => ({ value: String(user.id), label: user.name })),
    ],
    [users.data],
  );

  useEffect(() => {
    if (!open) return;
    setStatus('');
    setDueDate('');
    setAssignee('');
  }, [open]);

  const empty = !status && !dueDate && !assignee;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit selected items"
      description={`Apply fields to ${rows.length} selected ${rows.length === 1 ? 'item' : 'items'}. Blank fields are left unchanged.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="bulk-edit-apply"
            disabled={empty}
            onClick={() => {
              onApply({
                statusName: status || undefined,
                dueDate: dueDate || undefined,
                assigneeId: assignee ? Number(assignee) : undefined,
              });
              onOpenChange(false);
            }}
          >
            Apply changes
          </Button>
        </>
      }
    >
      <div data-testid="bulk-edit-dialog" className="space-y-3">
        <div>
          <span className="t-label mb-1 block text-ink">Status</span>
          <Select
            ariaLabel="Bulk status"
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: 'No change' },
              ...statusNames.map((name) => ({ value: name, label: name })),
            ]}
            size="sm"
          />
        </div>
        <div>
          <label htmlFor="bulk-due-date" className="t-label mb-1 block text-ink">
            Due date
          </label>
          <Input
            id="bulk-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
        <div>
          <span className="t-label mb-1 block text-ink">Assignee</span>
          <Select
            ariaLabel="Bulk assignee"
            value={assignee}
            onChange={setAssignee}
            options={userOptions}
            size="sm"
          />
        </div>
      </div>
    </Dialog>
  );
}
