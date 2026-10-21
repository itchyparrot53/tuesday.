import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '../../../shared/types';
import { Avatar } from '../components/ui/Avatar';
import { useUsers } from '../hooks/useUsers';

export function Mentions({ mentions }: { mentions: Notification[] }) {
  const users = useUsers();
  return (
    <section data-testid="home-mentions">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="t-label text-muted">Waiting on you</h2>
        <Link to="/inbox" className="t-meta text-accent hover:underline">
          Inbox{mentions.length > 0 ? ` (${mentions.length})` : ''}
        </Link>
      </div>
      <div className="space-y-0.5">
        {mentions.map((mention) => {
          const actor = mention.actorId
            ? [...(users.data?.byId.values() ?? [])].find((user) => user.id === mention.actorId)
            : undefined;
          return (
            <Link
              key={mention.id}
              to={mention.link}
              className="flex items-start gap-2 rounded-control px-1 py-1.5 hover:bg-sunken"
            >
              {actor ? (
                <Avatar name={actor.name} color={actor.color} size={24} />
              ) : (
                <span className="h-6 w-6 shrink-0 rounded-full bg-sunken" />
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm text-ink">{mention.title}</span>
                <span className="mt-1 flex items-center gap-2 t-meta text-muted">
                  <span className="truncate">{actor?.name ?? 'Someone'}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">
                    {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: false })}
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
        {mentions.length === 0 && (
          <p className="t-meta text-muted">Nothing waiting on you right now.</p>
        )}
      </div>
    </section>
  );
}
