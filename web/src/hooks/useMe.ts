import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Org, User } from '../../../shared/types';

export interface Me {
  user: User;
  org: Org;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api<Me>('GET', '/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 0,
  });
}
