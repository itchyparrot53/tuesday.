import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ClipboardList, Copy, GripVertical, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Dialog, Drawer } from '../components/ui/Dialog';
import { Input, Textarea } from '../components/ui/Input';
import { QueryError } from '../components/ui/QueryError';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import type { BoardFull, FormDef, FormField } from '../../../shared/types';

export function FormBuilder({
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
  const forms = useQuery({
    queryKey: ['forms', full.board.id],
    queryFn: async () =>
      (await api<{ forms: FormDef[] }>('GET', `/boards/${full.board.id}/forms`)).forms,
    enabled: open,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('New form');
  const [editing, setEditing] = useState<FormDef | null>(null);

  if (!open) return null;

  async function create() {
    try {
      const result = await api<{ form: FormDef }>('POST', `/boards/${full.board.id}/forms`, {
        title,
      });
      await qc.invalidateQueries({ queryKey: ['forms', full.board.id] });
      setCreateOpen(false);
      setEditing(result.form);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit form' : 'Forms'}
      closeLabel="Close forms"
      header={
        editing ? undefined : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ClipboardList size={16} className="text-accent" />
            <span className="t-section text-ink">Forms</span>
          </div>
        )
      }
    >
      {editing ? (
        <FormEditor
          form={editing}
          full={full}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['forms', full.board.id] });
          }}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            New form
          </Button>
          <div className="mt-3 space-y-2">
            {forms.isLoading && <Spinner size={14} />}
            {forms.isError && <QueryError onRetry={() => void forms.refetch()} />}
            {(forms.data ?? []).map((form) => (
              <div key={form.id} className="rounded-pop border border-line p-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{form.title}</p>
                  <label className="flex items-center gap-1 t-meta text-muted">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={async (event) => {
                        await api('PATCH', `/forms/${form.id}`, { enabled: event.target.checked });
                        await qc.invalidateQueries({ queryKey: ['forms', full.board.id] });
                      }}
                    />
                    Enabled
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a
                    href={form.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-control border border-line px-2 py-0.5 t-meta text-accent"
                  >
                    Open form
                  </a>
                  <button
                    className="flex items-center gap-1 rounded-control border border-line px-2 py-0.5 t-meta text-ink"
                    onClick={() => {
                      navigator.clipboard.writeText(form.url);
                      toast.show('Form link copied', 'success');
                    }}
                  >
                    <Copy size={11} /> Copy link
                  </button>
                  <button
                    className="rounded-control border border-line px-2 py-0.5 t-meta text-ink"
                    onClick={() => setEditing(form)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-control border border-line px-2 py-0.5 t-meta text-danger"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${form.title}"?`)) return;
                      await api('DELETE', `/forms/${form.id}`);
                      await qc.invalidateQueries({ queryKey: ['forms', full.board.id] });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {forms.data?.length === 0 && (
              <p className="py-4 text-center text-sm text-muted">No forms yet.</p>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New form"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!title.trim()} onClick={create}>
              Create form
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-sm font-medium">Title</label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      </Dialog>
    </Drawer>
  );
}

function FormEditor({
  form,
  full,
  onClose,
  onSaved,
}: {
  form: FormDef;
  full: BoardFull;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description);
  const [groupId, setGroupId] = useState(form.groupId || full.groups[0]?.id || 0);
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [enabled, setEnabled] = useState(form.enabled);
  const [submitMessage, setSubmitMessage] = useState(form.submitMessage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFields(form.fields);
  }, [form.id]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api('PATCH', `/forms/${form.id}`, {
        title,
        description,
        groupId,
        fields,
        enabled,
        submitMessage,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button className="t-meta text-muted hover:text-ink" onClick={onClose}>
            ← Back to forms
          </button>
          <Button size="sm" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block t-meta font-medium">Title</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block t-meta font-medium">Description</label>
              <Textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block t-meta font-medium">Group</label>
              <select
                value={groupId}
                onChange={(event) => setGroupId(Number(event.target.value))}
                className="h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
              >
                {full.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 t-meta font-medium">Fields</p>
              <div className="space-y-1">
                {fields.map((field, index) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-1 rounded-control border border-line p-1.5"
                  >
                    <span aria-hidden title="Drag to reorder" className="cursor-grab text-faint">
                      <GripVertical size={13} />
                    </span>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => setFields((current) => current.filter((_, i) => i !== index))}
                    />
                    <span className="min-w-0 flex-1 truncate t-meta">{field.label}</span>
                    <label className="flex items-center gap-1 t-meta text-muted">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setFields((current) =>
                            current.map((entry, i) =>
                              i === index ? { ...entry, required: event.target.checked } : entry,
                            ),
                          )
                        }
                      />
                      required
                    </label>
                    <button className="text-muted hover:text-ink" onClick={() => move(index, -1)}>
                      <ArrowUp size={11} />
                    </button>
                    <button className="text-muted hover:text-ink" onClick={() => move(index, 1)}>
                      <ArrowDown size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Accepting responses
            </label>
            <div>
              <label className="mb-1 block t-meta font-medium">Confirmation message</label>
              <Input
                value={submitMessage}
                onChange={(event) => setSubmitMessage(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <a
                href={form.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-control border border-line px-2 py-1 t-meta text-accent"
              >
                Open form
              </a>
              <button
                className="rounded-control border border-line px-2 py-1 t-meta"
                onClick={() => navigator.clipboard.writeText(form.url)}
              >
                Copy link
              </button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
          <aside className="rounded-pop border border-line bg-surface-2 p-4">
            <p className="t-section text-ink">{title || 'Untitled form'}</p>
            <p className="mt-1 text-sm text-muted">
              {description || 'Add a description to help people fill this in.'}
            </p>
            <div className="mt-4 space-y-3">
              {fields.map((field) => (
                <div key={field.key}>
                  <p className="t-label text-ink">
                    {field.label}
                    {field.required && <span className="text-danger"> *</span>}
                  </p>
                  <div className="mt-1 h-9 rounded-control border border-line bg-surface" />
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-sm text-muted">Add a field to see the preview.</p>
              )}
            </div>
            <Button className="mt-4" size="sm" disabled>
              Send
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
