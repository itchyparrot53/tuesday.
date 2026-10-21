import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { api } from '../lib/api';
import type { Automation, AutomationInput } from '../../../shared/automations';
import type { BoardFull } from '../../../shared/types';
import { useUsers } from '../hooks/useUsers';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { Drawer } from '../components/ui/Dialog';
import { useToast } from '../components/ui/Toast';
import { AutomationCenter } from './automations/AutomationCenter';
import { AutomationBuilder, makeAction } from './automations/AutomationBuilder';

function inputFrom(automation: Automation): AutomationInput {
  return {
    name: automation.name,
    enabled: automation.enabled,
    trigger: automation.trigger,
    conditions: automation.conditions,
    actions: automation.actions,
  };
}

export function AutomationsPanel({
  full,
  open,
  onOpenChange,
}: {
  full: BoardFull;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useUsers();
  const workspaces = useWorkspaces();
  const [editing, setEditing] = useState<{ id?: number; input: AutomationInput } | null>(null);

  const automations = useQuery({
    queryKey: ['automations', full.board.id],
    queryFn: async () =>
      (await api<{ automations: Automation[] }>('GET', `/boards/${full.board.id}/automations`))
        .automations,
    enabled: open,
  });

  const people = users.data?.users ?? [];
  const allBoards = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards.map((board) => ({ id: board.id, name: board.name })),
  );
  const boards = allBoards.length
    ? allBoards.some((board) => board.id === full.board.id)
      ? allBoards
      : [{ id: full.board.id, name: full.board.name }, ...allBoards]
    : [{ id: full.board.id, name: full.board.name }];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['automations', full.board.id] });
  }

  async function create(input: AutomationInput) {
    await api('POST', `/boards/${full.board.id}/automations`, input);
    await refresh();
    setEditing(null);
    toast.show('Automation created');
  }

  async function update(input: AutomationInput) {
    if (!editing?.id) return;
    await api('PATCH', `/automations/${editing.id}`, input);
    await refresh();
    setEditing(null);
    toast.show('Automation updated');
  }

  async function toggle(automation: Automation) {
    await api('PATCH', `/automations/${automation.id}`, { enabled: !automation.enabled });
    await refresh();
    toast.show(automation.enabled ? 'Automation paused' : 'Automation resumed');
  }

  async function remove(automation: Automation) {
    if (!window.confirm(`Delete "${automation.name}"?`)) return;
    await api('DELETE', `/automations/${automation.id}`);
    await refresh();
    toast.show('Automation deleted');
  }

  async function duplicate(automation: Automation) {
    await api('POST', `/boards/${full.board.id}/automations`, {
      ...inputFrom(automation),
      name: `${automation.name} copy`.slice(0, 120),
      enabled: false,
    });
    await refresh();
    toast.show('Automation duplicated, paused');
  }

  function newAutomation() {
    setEditing({
      input: {
        name: 'New automation',
        enabled: true,
        trigger: { type: 'item_created' },
        conditions: [],
        actions: [makeAction('notify', full, people)],
      },
    });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(null);
        onOpenChange(next);
      }}
      title={editing ? 'Edit automation' : 'Automations'}
      closeLabel="Close automations"
      width="wide"
      header={
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
            <Zap size={14} />
          </span>
          <div className="min-w-0">
            <p className="t-label text-ink">{editing ? 'Automation editor' : 'Automations'}</p>
            <p className="truncate t-meta text-muted">{full.board.name}</p>
          </div>
        </div>
      }
    >
      {editing ? (
        <AutomationBuilder
          full={full}
          users={people}
          boards={boards}
          initial={editing.input}
          automationId={editing.id}
          onCancel={() => setEditing(null)}
          onSave={editing.id ? update : create}
        />
      ) : (
        <AutomationCenter
          full={full}
          users={people}
          boards={boards}
          automations={automations.data ?? []}
          loading={automations.isLoading}
          onNew={newAutomation}
          onEdit={(automation) => setEditing({ id: automation.id, input: inputFrom(automation) })}
          onUseRecipe={(input) => setEditing({ input })}
          onDuplicate={duplicate}
          onDelete={remove}
          onToggle={toggle}
          onCreate={create}
          onRefresh={() => void refresh()}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Drawer>
  );
}
