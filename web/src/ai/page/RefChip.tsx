import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { CircleDot, FileText, LayoutDashboard } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';

export type RefKind = 'item' | 'board' | 'doc';

export function RefChip({
  kind,
  id,
  onOpenItem,
}: {
  kind: RefKind;
  id: number;
  onOpenItem?: (itemId: number) => void;
}) {
  const navigate = useNavigate();
  const ref = useQuery({
    queryKey: ['ref', kind, id],
    queryFn: async (): Promise<{ label: string; boardId?: number }> => {
      if (kind === 'item') {
        const data = await api<{ item: { id: number; name: string }; board: { id: number } }>(
          'GET',
          `/items/${id}`,
        );
        return { label: data.item.name, boardId: data.board.id };
      }
      if (kind === 'board') {
        const data = await api<{ board: { id: number; name: string } }>('GET', `/boards/${id}`);
        return { label: data.board.name };
      }
      const data = await api<{ doc: { id: number; title: string } }>('GET', `/docs/${id}`);
      return { label: data.doc.title };
    },
    staleTime: 60_000,
    retry: false,
  });

  const unreadable = ref.isError;
  const label = unreadable ? `#${id}` : (ref.data?.label ?? `#${id}`);
  const Icon = kind === 'item' ? CircleDot : kind === 'board' ? LayoutDashboard : FileText;

  return (
    <button
      type="button"
      data-testid="ai-ref-chip"
      data-kind={kind}
      data-id={id}
      disabled={unreadable}
      aria-label={`${kind} ${label}`}
      className={cn(
        'mx-0.5 inline-flex max-w-[260px] items-center gap-1 rounded-chip border border-line bg-surface-2 px-1.5 py-0.5 align-baseline t-label text-ink',
        unreadable ? 'cursor-not-allowed opacity-50' : 'hover:border-line-strong hover:bg-sunken',
      )}
      onClick={() => {
        if (unreadable) return;
        if (kind === 'item') {
          if (onOpenItem) onOpenItem(id);
          else if (ref.data?.boardId) navigate(`/boards/${ref.data.boardId}?item=${id}`);
        } else if (kind === 'board') navigate(`/boards/${id}`);
        else navigate(`/docs/${id}`);
      }}
      title={unreadable ? `Not available (#${id})` : label}
    >
      <Icon size={11} className={kind === 'item' ? 'text-muted' : 'text-muted'} />
      <span className="truncate">{label}</span>
    </button>
  );
}
