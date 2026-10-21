import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Workspace } from '../../../shared/types';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const data = await api<{ workspaces: Workspace[] }>('GET', '/workspaces');
      return data.workspaces;
    },
  });
}
