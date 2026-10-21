import { useState } from 'react';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { newLabelId, PALETTE, type Label } from '../../../../shared/columns';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { labelStyle, useTheme } from '../../lib/labelColors';

export function LabelEditor({
  labels,
  doneLabelIds = [],
  allowDone = false,
  onSave,
  onCancel,
}: {
  labels: Label[];
  doneLabelIds?: string[];
  allowDone?: boolean;
  onSave: (labels: Label[], doneLabelIds: string[]) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<Label[]>(labels.map((l) => ({ ...l })));
  const [done, setDone] = useState<string[]>(() =>
    doneLabelIds.filter((id) => labels.some((label) => label.id === id)),
  );
  const [colorFor, setColorFor] = useState<string | null>(null);

  function toggleDone(id: string) {
    setDone((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  function update(id: string, patch: Partial<Label>) {
    setDraft((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  return (
    <div>
      <div className="max-h-[260px] space-y-1.5 overflow-auto">
        {draft.map((label) => (
          <div key={label.id}>
            <div className="flex items-center gap-1.5">
              <span aria-hidden title="Drag to reorder" className="cursor-grab text-faint">
                <GripVertical size={13} />
              </span>
              <button
                aria-label={`Colour of ${label.name}`}
                className="h-5 w-5 shrink-0 rounded-full"
                style={{ backgroundColor: labelStyle(label.color, theme).solid }}
                onClick={() => setColorFor(colorFor === label.id ? null : label.id)}
              />
              <Input
                aria-label={`Name of ${label.name}`}
                value={label.name}
                onChange={(e) => update(label.id, { name: e.target.value })}
                className="h-7 text-sm"
              />
              <button
                aria-label={`Delete ${label.name}`}
                className="shrink-0 rounded-control p-1 text-muted hover:text-danger"
                onClick={() => {
                  setDraft((prev) => prev.filter((l) => l.id !== label.id));
                  setDone((prev) => prev.filter((id) => id !== label.id));
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {allowDone && (
              <label className="ml-6 mt-1 flex cursor-pointer items-center gap-1.5 t-meta text-muted">
                <input
                  type="checkbox"
                  checked={done.includes(label.id)}
                  onChange={() => toggleDone(label.id)}
                />
                Counts as done
              </label>
            )}
            {colorFor === label.id && (
              <ColorPicker
                className="mt-1.5 pl-6"
                value={label.color}
                onChange={(color) => update(label.id, { color })}
              />
            )}
          </div>
        ))}
      </div>
      <button
        className="mt-2 flex items-center gap-1 text-sm text-accent"
        onClick={() =>
          setDraft((prev) => [
            ...prev,
            {
              id: newLabelId(),
              name: `Option ${prev.length + 1}`,
              color: PALETTE[prev.length % PALETTE.length],
            },
          ])
        }
      >
        <Plus size={12} /> Add label
      </button>
      {allowDone && (
        <p className="mt-2 t-meta text-muted">
          Statuses named Done, Complete or Completed are always counted as done. Tick any others
          that should close the item.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={draft.some((l) => !l.name.trim())}
          onClick={() =>
            onSave(
              draft.map((l) => ({ ...l, name: l.name.trim() })),
              done,
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
