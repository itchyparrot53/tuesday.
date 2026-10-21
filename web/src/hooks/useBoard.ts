import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BoardFull, Item } from '../../../shared/types';

export function useBoard(boardId: number) {
  const full = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api<BoardFull>('GET', `/boards/${boardId}`),
    enabled: Number.isFinite(boardId) && boardId > 0,
  });
  const items = useQuery({
    queryKey: ['items', boardId],
    queryFn: async () => {
      const data = await api<{ items: Item[] }>('GET', `/boards/${boardId}/items`);
      return data.items;
    },
    enabled: Number.isFinite(boardId) && boardId > 0,
  });
  return {
    full: full.data,
    items: items.data,
    isLoading: full.isLoading || items.isLoading,
    isError: full.isError || items.isError,
    refetch: () => Promise.all([full.refetch(), items.refetch()]),
  };
}
