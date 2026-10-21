import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Widget, WidgetData } from '../../../../shared/dashboards';
import { LABEL_SOLIDS, labelStyle, useTheme } from '../../lib/labelColors';

const FALLBACK = LABEL_SOLIDS;

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  boxShadow: 'var(--shadow-pop)',
  color: 'var(--ink)',
  fontSize: 12,
};

export function ChartWidget({
  widget,
  data,
}: {
  widget: Widget;
  data: Extract<WidgetData, { kind: 'series' }>;
}) {
  const theme = useTheme();
  const fallback = FALLBACK.map((hex) => labelStyle(hex, theme).solid);
  const series = data.series.map((entry, index) => ({
    ...entry,
    color: entry.color ?? fallback[index % fallback.length],
  }));
  const kind = widget.config.chartKind ?? 'bar';
  if (kind === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={series} dataKey="value" nameKey="label" outerRadius="80%" label>
            {series.map((entry) => (
              <Cell key={entry.label} fill={entry.color ?? 'var(--accent)'} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--ink)' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (kind === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            stroke="var(--line)"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            stroke="var(--line)"
            width={28}
          />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--ink)' }} />
          <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={series}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted)' }} stroke="var(--line)" />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: 'var(--muted)' }}
          stroke="var(--line)"
          width={28}
        />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--ink)' }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {series.map((entry) => (
            <Cell key={entry.label} fill={entry.color ?? 'var(--accent)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
