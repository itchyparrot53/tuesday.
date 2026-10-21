import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { QueryError } from '../components/ui/QueryError';
import { Spinner } from '../components/ui/Spinner';
import { NumberWidget } from './widgets/NumberWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { BatteryWidget } from './widgets/BatteryWidget';
import { WorkloadWidget } from './widgets/WorkloadWidget';
import { ItemsWidget } from './widgets/ItemsWidget';
import { NoteWidget } from './widgets/NoteWidget';
import { AiInsightWidget } from './widgets/AiInsightWidget';
import { RiskWidget } from './widgets/RiskWidget';
import type { Widget, WidgetData } from '../../../shared/dashboards';

export function WidgetCard({
  widget,
  dashboardId,
  onEdit,
  onDuplicate,
  onResize,
  onMove,
  onDelete,
}: {
  widget: Widget;
  dashboardId: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onResize: (dimension: 'w' | 'h', direction: 1 | -1) => void;
  onMove: (direction: 1 | -1) => void;
  onDelete: () => void;
}) {
  const query = useQuery({
    queryKey: ['widget', dashboardId, widget.id],
    queryFn: async () =>
      (await api<{ data: WidgetData }>('GET', `/dashboards/${dashboardId}/widgets/${widget.id}`))
        .data,
  });

  return (
    <section
      data-testid="dashboard-widget"
      data-widget-type={widget.type}
      className="flex min-h-[120px] min-w-0 flex-col rounded-[12px] border border-line bg-surface p-3"
      style={{ gridColumn: `span ${widget.w}`, gridRow: `span ${widget.h}` }}
    >
      <div className="mb-2 flex items-center gap-1">
        <h3 className="min-w-0 flex-1 truncate t-label text-ink">{widget.title}</h3>
        <Menu
          trigger={
            <button
              aria-label={`Widget menu for `}
              title={`Widget menu for `}
              className="rounded-control p-1 text-muted hover:bg-sunken"
            >
              <MoreHorizontal size={14} />
            </button>
          }
        >
          <MenuItem onSelect={onEdit}>Edit</MenuItem>
          <MenuItem onSelect={onDuplicate}>Duplicate</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => onResize('w', 1)}>Wider</MenuItem>
          <MenuItem onSelect={() => onResize('w', -1)}>Narrower</MenuItem>
          <MenuItem onSelect={() => onResize('h', 1)}>Taller</MenuItem>
          <MenuItem onSelect={() => onResize('h', -1)}>Shorter</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => onMove(-1)}>Move earlier</MenuItem>
          <MenuItem onSelect={() => onMove(1)}>Move later</MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={onDelete}>
            Delete
          </MenuItem>
        </Menu>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {query.isLoading && (
          <div className="text-muted">
            <Spinner size={14} />
          </div>
        )}
        {query.isError && <QueryError onRetry={() => void query.refetch()} />}
        {query.data?.kind === 'number' && <NumberWidget data={query.data} />}
        {query.data?.kind === 'series' && <ChartWidget widget={widget} data={query.data} />}
        {query.data?.kind === 'battery' && <BatteryWidget data={query.data} />}
        {query.data?.kind === 'workload' && <WorkloadWidget data={query.data} />}
        {query.data?.kind === 'items' && <ItemsWidget data={query.data} />}
        {query.data?.kind === 'note' && <NoteWidget data={query.data} />}
        {query.data?.kind === 'risk' && <RiskWidget data={query.data} />}
        {query.data?.kind === 'ai_insight' && (
          <AiInsightWidget dashboardId={dashboardId} widgetId={widget.id} data={query.data} />
        )}
      </div>
    </section>
  );
}
