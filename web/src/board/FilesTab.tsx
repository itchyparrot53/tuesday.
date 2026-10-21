import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { uploadFile } from '../lib/upload';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import type { FileInfo } from '../../../shared/types';

function sizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesTab({ itemId }: { itemId: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const files = useQuery({
    queryKey: ['files', itemId],
    queryFn: async () => (await api<{ files: FileInfo[] }>('GET', `/items/${itemId}/files`)).files,
  });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await uploadFile(itemId, file, { onProgress: setProgress });
      }
      await qc.invalidateQueries({ queryKey: ['files', itemId] });
      await qc.invalidateQueries({ queryKey: ['items'] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setUploading(false);
      setProgress(0);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(file: FileInfo) {
    try {
      await api('DELETE', `/files/${file.id}`);
      await qc.invalidateQueries({ queryKey: ['files', itemId] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <div>
      <div
        data-testid="files-dropzone"
        className="flex cursor-pointer flex-col items-center justify-center rounded-pop border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center hover:border-accent"
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void upload(event.dataTransfer.files);
        }}
      >
        <Paperclip size={20} className="mb-2 text-muted" />
        <p className="text-sm text-ink">Drop files here or click to upload</p>
        <p className="mt-1 t-meta text-muted">Images, PDFs and documents up to 25 MB.</p>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
        />
        {uploading && (
          <div className="mt-3 w-full max-w-[260px]">
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 t-meta text-muted">Uploading {progress}%</p>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {files.isLoading && (
          <div className="text-muted">
            <Spinner size={14} />
          </div>
        )}
        {(files.data ?? []).map((file) => (
          <div
            key={file.id}
            data-testid="file-row"
            className="flex items-center gap-2 rounded-control border border-line p-2"
          >
            {file.isImage ? (
              <img
                src={file.url}
                alt={file.filename}
                className="h-24 w-24 rounded-control object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-control bg-sunken text-muted">
                <Paperclip size={18} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{file.filename}</p>
              <p className="t-meta text-muted">{sizeLabel(file.size)}</p>
            </div>
            <a
              href={`${file.url}?download=1`}
              className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
              aria-label={`Download ${file.filename}`}
            >
              <Download size={14} />
            </a>
            <button
              aria-label={`Delete ${file.filename}`}
              className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-danger"
              onClick={() => void remove(file)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {files.data?.length === 0 && (
          <p className="text-center text-xs text-muted">No files yet.</p>
        )}
      </div>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => input.current?.click()}>
        Upload file
      </Button>
    </div>
  );
}
