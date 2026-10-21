import { useState } from 'react';
import { Link } from 'react-router';
import type { WidgetData } from '../../../../shared/dashboards';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

export function RiskWidget({ data }: { data: Extract<WidgetData, { kind: 'risk' }> }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const report = data.report;
  const pills = [
    { label: 'Overdue', count: report.counts.overdue, tone: 'danger' as const },
    { label: 'Stuck', count: report.counts.stuck, tone: 'warning' as const },
    { label: 'Unassigned', count: report.counts.unassigned_due_soon, tone: 'neutral' as const },
    { label: 'Overloaded', count: report.counts.overloaded, tone: 'danger' as const },
  ];
  return (
    <div data-testid="risk-widget" className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap gap-1">
        {pills.map((pill) => (
          <Badge key={pill.label} tone={pill.tone}>
            {pill.label} {pill.count}
          </Badge>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {report.signals.slice(0, 5).map((signal, index) => (
          <div
            key={`${signal.kind}-${signal.itemId ?? signal.userId}-${index}`}
            data-testid="risk-row"
            className="flex items-start gap-2 text-sm"
          >
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                signal.severity === 3
                  ? 'bg-danger'
                  : signal.severity === 2
                    ? 'bg-warning'
                    : 'bg-faint'
              }`}
            />
            <span className="min-w-0 flex-1">
              {signal.itemId ? (
                <Link
                  to={`/boards/${signal.boardId}?item=${signal.itemId}`}
                  className="text-ink hover:underline"
                >
                  {signal.itemName}
                </Link>
              ) : (
                <span className="text-ink">{signal.userName}</span>
              )}
              <span className="block t-meta text-muted">{signal.detail}</span>
            </span>
          </div>
        ))}
        {report.signals.length === 0 && <p className="t-meta text-muted">Nothing at risk.</p>}
      </div>
      {text ? (
        <p className="mt-2 rounded-control bg-ai-soft p-2 t-meta text-ink">{text}</p>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          data-testid="risk-explain"
          className="mt-2 self-start"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const result = await api<{ text: string }>('POST', '/risks/explain', {});
              setText(result.text);
            } finally {
              setLoading(false);
            }
          }}
        >
          Explain
        </Button>
      )}
    </div>
  );
}
