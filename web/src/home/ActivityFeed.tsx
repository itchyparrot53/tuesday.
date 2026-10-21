import { Link } from 'react-router';
import type { HomeActivity } from '../../../shared/types';
import { Avatar } from '../components/ui/Avatar';
import { useUsers } from '../hooks/useUsers';
import { relative } from '../lib/format';

export function ActivityFeed({
  activity,
  limit = 4,
}: {
  activity: HomeActivity[];
  limit?: number;
}) {
  const users = useUsers();
  const rows = activity.slice(0, limit);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="t-label text-muted">What changed</h2>
        <span className="t-meta text-muted">Your team</span>
      </div>
      {rows.length === 0 && <p className="t-meta text-muted">No changes from your team yet.</p>}
      <div className="space-y-0.5">
        {rows.map((entry) => {
          const actor = entry.actorId
            ? [...(users.data?.byId.values() ?? [])].find((user) => user.id === entry.actorId)
            : undefined;
          return (
            <div
              key={entry.id}
              data-testid="home-activity-row"
              className="flex items-start gap-2 rounded-control px-1 py-1.5 hover:bg-sunken"
            >
              {actor ? (
                <Avatar name={actor.name} color={actor.color} size={20} />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full bg-sunken" />
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm text-ink">
                  {actor?.name ?? 'Someone'} {entry.summary}
                  {entry.itemName && (
                    <>
                      {' on '}
                      <Link
                        to={`/boards/${entry.boardId}?item=${entry.itemId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {entry.itemName}
                      </Link>
                    </>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-2 t-meta text-muted">
                  <span className="truncate">{entry.boardName}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{relative(entry.createdAt)}</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
