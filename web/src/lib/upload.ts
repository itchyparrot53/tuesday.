import type { FileInfo } from '../../../shared/types';

export function uploadFile(
  itemId: number,
  file: File,
  options: { columnId?: number; updateId?: number; onProgress?: (percent: number) => void } = {},
): Promise<FileInfo> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (options.columnId) form.append('columnId', String(options.columnId));
    if (options.updateId) form.append('updateId', String(options.updateId));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/items/${itemId}/files`);
    xhr.setRequestHeader('X-Requested-With', 'tuesday');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.file as FileInfo);
        else reject(new Error(data?.error?.message ?? 'Upload failed'));
      } catch {
        reject(new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
