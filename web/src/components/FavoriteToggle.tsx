import { Star } from 'lucide-react';
import type { FavoriteKind } from '../../../shared/types';
import { useFavorites } from '../hooks/useFavorites';

export function FavoriteToggle({
  kind,
  id,
  name,
}: {
  kind: FavoriteKind;
  id: number;
  name: string;
}) {
  const favorites = useFavorites();
  const active = favorites.has(kind, id);
  return (
    <button
      data-testid="favorite-toggle"
      aria-pressed={active}
      aria-label={active ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      title={active ? 'Remove from favourites' : 'Add to favourites'}
      className={`rounded-control p-1.5 hover:bg-sunken ${active ? 'text-accent' : 'text-muted'}`}
      onClick={() => void (active ? favorites.remove(kind, id) : favorites.add(kind, id))}
    >
      <Star size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
