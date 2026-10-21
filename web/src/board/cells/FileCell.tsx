import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, X } from 'lucide-react';
import { api } from '../../lib/api';
import { uploadFile } from '../../lib/upload';
import { Popover } from '../../components/ui/Popover';
import { useSetValue } from '../mutations';
import { useToast } from '../../components/ui/Toast';
import type { CellEditorProps } from './CellEditor';
import type { FileInfo } from '../../../../shared/types';

export function FileCell({ column, item, boardId }: CellEditorProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const setValue = useSetValue(boardId);
  const input = useRef<HTMLInputElement>(null);
  const files = useQuery({
    queryKey: ['files', item.id],
    queryFn: async () => (await api<{ files: FileInfo[] }>('GET', `/items/${item.id}/files`)).files,
  });
  const value = item.values[String(column.id)] as { fileIds?: number[] } | undefined;
  const ids = value?.fileIds ?? [];
  const attached = (files.data ?? []).filter((file) => ids.includes(file.id));

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    try {
      for (const file of Array.from(list)) {
        await uploadFile(item.id, file, { columnId: column.id });
      }
      await qc.invalidateQueries({ queryKey: ['files', item.id] });
      await qc.invalidateQueries({ queryKey: ['items', boardId] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <Popover
      className="w-[280px]"
      trigger={
        <button className="flex h-full w-full items-center gap-1 overflow-hidden text-left text-sm text-muted">
          <Paperclip size={12} />
          {ids.length ? `${ids.length} file${ids.length === 1 ? '' : 's'}` : 'Add files'}
        </button>
      }
    >
      <div className="space-y-1">
        {attached.map((file) => (
          <div key={file.id} className="flex items-center gap-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{file.filename}</span>
            <button
              aria-label={`Remove ${file.filename}`}
              className="text-muted hover:text-danger"
              onClick={() =>
                setValue.mutate({
                  itemId: item.id,
                  columnId: column.id,
                  value: { fileIds: ids.filter((id) => id !== file.id) },
                })
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {attached.length === 0 && <p className="text-xs text-muted">No files.</p>}
      </div>
      <button
        className="mt-2 flex items-center gap-1 text-sm text-accent"
        onClick={() => input.current?.click()}
      >
        <Upload size={12} /> Upload
      </button>
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(event) => void upload(event.target.files)}
      />
    </Popover>
  );
}
