import { Link } from 'react-router';
import type { HomeBoardCard } from '../../../shared/types';
import { labelStyle, useTheme } from '../lib/labelColors';
import { FavoriteToggle } from '../components/FavoriteToggle';

export function BoardCards({ boards }: { boards: HomeBoardCard[] }) {
  const theme = useTheme();
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="t-label text-muted">Your boards</h2>
        <span className="t-meta text-muted">{boards.length}</span>
      </div>
      <div className="space-y-0.5">
        {boards.map((board) => (
          <div
            key={board.id}
            data-testid="home-board-card"
            className="group flex items-center gap-2 rounded-control px-1 py-1.5 hover:bg-sunken"
          >
            <FavoriteToggle kind="board" id={board.id} name={board.name} />
            <Link to={`/boards/${board.id}`} className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {board.name}
                </span>
                {board.overdue > 0 && (
                  <span className="shrink-0 t-meta font-semibold text-danger-text">
                    {board.overdue} late
                  </span>
                )}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span className="flex h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                  {board.segments.map((segment) => (
                    <span
                      key={segment.label}
                      className="h-full"
                      style={{
                        width: `${board.total ? (segment.count / board.total) * 100 : 0}%`,
                        backgroundColor: labelStyle(segment.color, theme).solid,
                      }}
                      title={`${segment.label}: ${segment.count}`}
                    />
                  ))}
                </span>
                <span className="shrink-0 t-meta text-muted">{board.total}</span>
              </span>
            </Link>
          </div>
        ))}
        {boards.length === 0 && <p className="t-meta text-muted">No boards yet.</p>}
      </div>
    </section>
  );
}
