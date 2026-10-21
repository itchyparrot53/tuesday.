import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Favorite, FavoriteKind } from '../../../shared/types';

export function useFavorites() {
  const qc = useQueryClient();
  const favorites = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => (await api<{ favorites: Favorite[] }>('GET', '/me/favorites')).favorites,
  });

  async function add(kind: FavoriteKind, id: number) {
    await api('PUT', `/me/favorites/${kind}/${id}`);
    await qc.invalidateQueries({ queryKey: ['favorites'] });
    await qc.invalidateQueries({ queryKey: ['home'] });
  }

  async function remove(kind: FavoriteKind, id: number) {
    await api('DELETE', `/me/favorites/${kind}/${id}`);
    await qc.invalidateQueries({ queryKey: ['favorites'] });
    await qc.invalidateQueries({ queryKey: ['home'] });
  }

  function has(kind: FavoriteKind, id: number): boolean {
    return Boolean(
      favorites.data?.some((favorite) => favorite.kind === kind && favorite.id === id),
    );
  }

  return { ...favorites, add, remove, has };
}
