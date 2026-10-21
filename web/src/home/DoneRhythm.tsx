import type { HomeSummary } from '../../../shared/types';

export function DoneRhythm({
  trend,
  doneThisWeek,
}: {
  trend: HomeSummary['doneTrend'];
  doneThisWeek: number;
}) {
  const total = trend.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(1, ...trend.map((day) => day.count));
  return (
    <section
      data-testid="home-rhythm"
      aria-label={`${doneThisWeek} done this week, ${total} in the last 14 days`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="t-label text-muted">Momentum</h2>
        <span className="t-meta text-muted">{total} in 14 days</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="t-title tabular-nums text-ink">{doneThisWeek}</span>
        <span className="pb-1 t-meta text-muted">done this week</span>
      </div>
      {total === 0 ? (
        <p className="mt-3 t-meta text-muted">No completions in the last 14 days yet.</p>
      ) : (
        <>
          <div className="mt-2 flex h-10 items-end gap-1">
            {trend.map((day) => (
              <span
                key={day.date}
                className="flex-1 rounded-full bg-accent"
                style={{
                  height: `${Math.max(3, (day.count / max) * 40)}px`,
                  opacity: day.count ? 1 : 0.22,
                }}
                title={`${day.date}: ${day.count} done`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between t-meta text-muted">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </>
      )}
    </section>
  );
}
