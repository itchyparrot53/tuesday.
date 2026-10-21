import type { WidgetData } from '../../../../shared/dashboards';

export function NumberWidget({ data }: { data: Extract<WidgetData, { kind: 'number' }> }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="t-display leading-none text-ink">{data.value}</p>
      <p className="mt-1 t-meta text-muted">{data.label}</p>
    </div>
  );
}
