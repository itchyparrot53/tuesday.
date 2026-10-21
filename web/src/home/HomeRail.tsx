import type { ReactNode } from 'react';
import type { HomeSummary } from '../../../shared/types';
import { ActivityFeed } from './ActivityFeed';
import { BoardCards } from './BoardCards';
import { DoneRhythm } from './DoneRhythm';
import { Mentions } from './Mentions';
import { WeekStrip } from './WeekStrip';

function RailBlock({ children }: { children: ReactNode }) {
  return <div className="border-t border-line pt-5 first:border-t-0 first:pt-0">{children}</div>;
}

export function HomeRail({ summary }: { summary: HomeSummary }) {
  return (
    <aside className="min-w-0 space-y-5" aria-label="Today at a glance">
      <RailBlock>
        <WeekStrip week={summary.week} today={summary.today} />
      </RailBlock>
      <RailBlock>
        <BoardCards boards={summary.boards} />
      </RailBlock>
      <RailBlock>
        <DoneRhythm trend={summary.doneTrend} doneThisWeek={summary.counts.doneThisWeek} />
      </RailBlock>
      <RailBlock>
        <Mentions mentions={summary.mentions} />
      </RailBlock>
      <RailBlock>
        <ActivityFeed activity={summary.activity} limit={5} />
      </RailBlock>
    </aside>
  );
}
