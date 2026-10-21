import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

export function SaveTemplateDialog({
  boardId,
  defaultName,
  open,
  onOpenChange,
}: {
  boardId: number;
  defaultName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Custom');
  const [includeItems, setIncludeItems] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api('POST', '/templates', {
        boardId,
        name,
        description,
        category,
        includeItems,
      });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.show('Template saved', 'success');
      onOpenChange(false);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save as template"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!name.trim()} onClick={save}>
            Save template
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-sm font-medium">Name</label>
      <Input value={name} onChange={(event) => setName(event.target.value)} className="mb-3" />
      <label className="mb-1 block text-sm font-medium">Description</label>
      <Input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="mb-3"
      />
      <label className="mb-1 block text-sm font-medium">Category</label>
      <Input
        value={category}
        onChange={(event) => setCategory(event.target.value)}
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
