import type { FastifyInstance } from 'fastify';
import type { FavoriteKind } from '../../shared/types';
import { badRequest } from '../lib/errors';
import { parseId } from '../lib/validate';
import { addFavorite, listFavorites, removeFavorite } from '../services/favorites';
import { getHome } from '../services/home';
import { getBoardFull } from '../services/boards';
import { boardAccessMap } from '../services/permissions';

const KINDS: FavoriteKind[] = ['board', 'doc', 'dashboard'];

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/home', async (req) => getHome(app.db, req.user!));

  app.get('/api/me/shared-boards', async (req) => {
    const user = req.user!;
    const access = boardAccessMap(app.db, user);
    const rows = app.db
      .prepare('SELECT board_id FROM board_members WHERE user_id = ?')
      .all(user.id) as { board_id: number }[];
    const boards = [];
    for (const row of rows) {
      if (!access.has(row.board_id)) continue;
      try {
        boards.push(getBoardFull(app.db, user, row.board_id).board);
      } catch {}
    }
    return { boards };
  });

  app.get('/api/me/favorites', async (req) => ({
    favorites: listFavorites(app.db, req.user!),
  }));

  app.put('/api/me/favorites/:kind/:id', async (req) => {
    const { kind, id } = req.params as { kind: string; id: string };
    const target = parseId(id);
    if (!KINDS.includes(kind as FavoriteKind)) throw badRequest('Unknown favourite kind');
    return { favorites: addFavorite(app.db, req.user!, kind as FavoriteKind, target) };
  });

  app.delete('/api/me/favorites/:kind/:id', async (req) => {
    const { kind, id } = req.params as { kind: string; id: string };
    const target = parseId(id);
    if (!KINDS.includes(kind as FavoriteKind)) throw badRequest('Unknown favourite kind');
    return { favorites: removeFavorite(app.db, req.user!, kind as FavoriteKind, target) };
  });
}
