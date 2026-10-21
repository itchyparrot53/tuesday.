import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '../../../shared/types';

export interface UsersResult {
  users: User[];
  byId: Map<number, User>;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<UsersResult> => {
      const data = await api<{ users: User[] }>('GET', '/users');
      return { users: data.users, byId: new Map(data.users.map((u) => [u.id, u])) };
    },
  });
}
