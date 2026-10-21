import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import type { DocVersion } from '../../../shared/types';

export function VersionHistory({
  docId,
  open,
  onClose,
  onRestore,
}: {
  docId: number;
  open: boolean;
  onClose: () => void;
  onRestore: (versionId: number) => void;
}) {
  const versions = useQuery({
    queryKey: ['doc-versions', docId],
    queryFn: async () =>
      (await api<{ versions: DocVersion[] }>('GET', `/docs/${docId}/versions`)).versions,
    enabled: open,
  });
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()} title="Version history">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {versions.isLoading && <Spinner size={14} />}
        {(versions.data ?? []).map((version) => (
          <div key={version.id} className="border-b border-line py-3 last:border-0">
            <p className="t-label text-ink">{version.title}</p>
            <p className="t-meta text-muted">
              {relative(version.createdAt)} · version {version.id}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => onRestore(version.id)}
            >
              Restore this version
            </Button>
          </div>
        ))}
        {versions.data?.length === 0 && (
          <p className="text-sm text-muted">No earlier versions yet.</p>
        )}
      </div>
    </Drawer>
  );
}
