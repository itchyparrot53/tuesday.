import { Link } from 'react-router';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/cn';

const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function WeekStrip({
  week,
  today,
}: {
  week: { date: string; count: number }[];
  today: string;
}) {
  const max = Math.max(1, ...week.map((day) => day.count));
  return (
    <section data-testid="home-week">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="t-label text-muted">This week</h2>
        <Link to="/my-work" className="t-meta text-accent hover:underline">
          Open
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {week.map((day) => {
          const date = parseISO(day.date);
          const isToday = day.date === today;
          return (
            <Link
              key={day.date}
              to="/my-work"
              aria-label={`${format(date, 'EEEE d MMMM')}, ${day.count} due`}
              title={`${format(date, 'EEEE d MMMM')} · ${day.count} due`}
              className="group flex flex-col items-center gap-1 rounded-control py-1 hover:bg-sunken"
            >
              <span className={cn('t-meta', isToday ? 'font-semibold text-accent' : 'text-muted')}>
                {INITIALS[date.getDay()]}
              </span>
              <span
                className={cn(
                  't-meta tabular-nums',
                  isToday ? 'font-semibold text-ink' : 'text-muted',
                )}
              >
                {date.getDate()}
              </span>
              <span className="flex h-7 w-full items-end justify-center">
                <span
                  className={cn(
                    'w-3.5 rounded-full',
                    isToday
                      ? 'bg-accent'
                      : day.count > 0
                        ? 'bg-line-strong group-hover:bg-muted'
                        : 'bg-sunken group-hover:bg-line',
                  )}
                  style={{ height: `${Math.max(4, Math.round((day.count / max) * 28))}px` }}
                />
              </span>
              <span
                className={cn(
                  't-meta tabular-nums',
                  isToday ? 'font-semibold text-accent' : 'text-muted',
                )}
              >
                {day.count}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
