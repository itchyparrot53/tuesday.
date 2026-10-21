import { labelStyle, useTheme } from '../../lib/labelColors';
import type { WidgetData } from '../../../../shared/dashboards';

export function BatteryWidget({ data }: { data: Extract<WidgetData, { kind: 'battery' }> }) {
  const theme = useTheme();
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        {data.segments.map((segment) =>
          segment.count > 0 ? (
            <span
              key={segment.label}
              title={`${segment.label}: ${segment.count}`}
              style={{
                backgroundColor: labelStyle(segment.color, theme).solid,
                width: `${(segment.count / Math.max(1, data.total)) * 100}%`,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 t-meta text-muted">
        {data.segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: labelStyle(segment.color, theme).solid }}
            />
            {segment.label} {segment.count}
          </span>
        ))}
      </div>
    </div>
  );
}
