import { Link } from 'react-router';
import type { HomeSummary } from '../../../shared/types';

export function SummaryLine({ summary }: { summary: HomeSummary }) {
  const { counts } = summary;
  const due = counts.dueToday + counts.overdue;
  const sentence =
    due === 0
      ? "You're all clear today."
      : counts.overdue === 0
        ? `You have ${counts.dueToday} ${counts.dueToday === 1 ? 'thing' : 'things'} due today.`
        : `You have ${counts.dueToday} ${counts.dueToday === 1 ? 'thing' : 'things'} due today and ${counts.overdue} overdue.`;
  const chips = [
    { filter: 'overdue', label: 'Overdue', count: counts.overdue, danger: counts.overdue > 0 },
    { filter: 'today', label: 'Due today', count: counts.dueToday, danger: false },
    { filter: 'open', label: 'Open', count: counts.open, danger: false },
    { filter: 'done', label: 'Done this week', count: counts.doneThisWeek, danger: false },
  ];
  return (
    <div data-testid="home-summary" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-sm text-muted">{sentence}</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Link
            key={chip.filter}
            data-testid="home-chip"
            data-filter={chip.filter}
            to={`/my-work?bucket=${chip.filter}`}
            className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 t-meta font-semibold transition-colors ${
              chip.danger
                ? 'bg-danger-soft text-danger-text hover:bg-danger-soft/70'
                : 'bg-sunken text-muted hover:text-ink'
            }`}
          >
            {chip.label}
            <span className="tabular-nums">{chip.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
