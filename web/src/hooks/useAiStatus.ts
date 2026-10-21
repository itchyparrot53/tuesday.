import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AiStatus } from '../../../shared/ai';

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => api<AiStatus>('GET', '/ai/status'),
    staleTime: 60_000,
  });
}
