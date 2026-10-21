import { labelStyle, useTheme } from '../../lib/labelColors';
import type { WidgetData } from '../../../../shared/dashboards';

export function WorkloadWidget({ data }: { data: Extract<WidgetData, { kind: 'workload' }> }) {
  const theme = useTheme();
  const max = Math.max(data.capacity ?? 0, ...data.rows.map((row) => row.value), 1);
  return (
    <div className="relative space-y-1.5 overflow-hidden pt-1">
      {data.rows.map((row) => (
        <div key={row.userId} className="flex items-center gap-2 t-meta">
          <span className="w-20 truncate text-muted">{row.name}</span>
          <div className="h-2.5 flex-1 rounded-full bg-sunken">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.value / max) * 100}%`,
                backgroundColor: labelStyle(row.color, theme).solid,
              }}
            />
          </div>
          <span className="w-5 text-right text-muted">{row.value}</span>
        </div>
      ))}
      {data.capacity ? (
        <div
          className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-danger"
          style={{ left: `calc(80px + 8px + ${(data.capacity / max) * 100}% * (1 - 28px / 100%))` }}
        />
      ) : null}
    </div>
  );
}
