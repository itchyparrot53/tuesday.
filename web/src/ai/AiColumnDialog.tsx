import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { labelStyle, useTheme } from '../lib/labelColors';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input, Textarea } from '../components/ui/Input';
import { LabelEditor } from '../board/cells/LabelEditor';
import { useCreateColumn, useUpdateColumn } from '../board/mutations';
import type { Label } from '../../../shared/columns';
import type { AiModel } from '../../../shared/ai';
import type { Column } from '../../../shared/types';

export function AiColumnDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  column,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: number;
  columns: Column[];
  column?: Column | null;
}) {
  const theme = useTheme();
  const me = useMe();
  const isAdmin = me.data?.user.role === 'owner' || me.data?.user.role === 'admin';
  const create = useCreateColumn(boardId);
  const update = useUpdateColumn(boardId);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState<'text' | 'label'>('text');
  const [autoRun, setAutoRun] = useState(true);
  const [labels, setLabels] = useState<Label[]>([]);
  const [model, setModel] = useState('');
  const [editingLabels, setEditingLabels] = useState(false);

  const models = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: async () => (await api<{ models: AiModel[] }>('GET', '/ai/models')).models,
    enabled: open && isAdmin,
  });

  useEffect(() => {
    if (!open) return;
    setTitle(column?.title ?? 'AI column');
    setPrompt(column?.settings.prompt ?? '');
    setOutput(column?.settings.output ?? 'text');
    setAutoRun(column?.settings.autoRun ?? true);
    setLabels(column?.settings.labels ?? []);
    setModel(column?.settings.model ?? '');
    setEditingLabels(false);
  }, [open, column?.id]);

  function submit() {
    const settings = {
      prompt,
      output,
      autoRun,
      labels: output === 'label' ? labels : [],
      model,
    };
    if (column) {
      update.mutate(
        { columnId: column.id, title, settings },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate({ title, type: 'ai', settings }, { onSuccess: () => onOpenChange(false) });
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={column ? 'Edit AI column' : 'New AI column'}
      description="The prompt fills each cell. Use the chips to insert item data."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!title.trim()} onClick={submit}>
            {column ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="mb-3">
        <label htmlFor="ai-column-title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <Input
          id="ai-column-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="mb-2">
        <label htmlFor="ai-column-prompt" className="mb-1 block text-sm font-medium">
          Prompt
        </label>
        <Textarea
          id="ai-column-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Describe {{name}} in one sentence"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {['{{name}}', '{{updates}}', ...columns.map((entry) => `{{${entry.title}}}`)].map(
          (token) => (
            <button
              key={token}
              className="rounded-full bg-ai-soft px-2 py-0.5 t-meta text-ai hover:bg-ai/10"
              onClick={() =>
                setPrompt((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}${token}`)
              }
            >
              {token}
            </button>
          ),
        )}
      </div>

      <div className="mb-3">
        <span className="mb-1 block text-sm font-medium">Output</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ai-output"
              checked={output === 'text'}
              onChange={() => setOutput('text')}
            />
            Text
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ai-output"
              checked={output === 'label'}
              onChange={() => setOutput('label')}
            />
            Labels
          </label>
        </div>
      </div>

      {output === 'label' && (
        <div className="mb-3 rounded-pop border border-line p-3">
          {editingLabels ? (
            <LabelEditor
              labels={labels}
              onCancel={() => setEditingLabels(false)}
              onSave={(next) => {
                setLabels(next);
                setEditingLabels(false);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {labels.map((label) => (
                <span
                  key={label.id}
                  className="rounded-chip px-1.5 py-0.5 t-meta font-medium"
                  style={{
                    backgroundColor: labelStyle(label.color, theme).tint,
                    color: labelStyle(label.color, theme).text,
                  }}
                >
                  {label.name}
                </span>
              ))}
              <button className="t-meta text-accent" onClick={() => setEditingLabels(true)}>
                Edit labels
              </button>
            </div>
          )}
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
        Auto-run when referenced cells change
      </label>

      {isAdmin && (
        <div>
          <label htmlFor="ai-column-model" className="mb-1 block text-sm font-medium">
            Model
          </label>
          <select
            id="ai-column-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 w-full rounded-[6px] border border-line bg-surface px-2 text-sm"
          >
            <option value="">Fast model (default)</option>
            {models.data?.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · {entry.id}
              </option>
            ))}
          </select>
        </div>
      )}
    </Dialog>
  );
}
