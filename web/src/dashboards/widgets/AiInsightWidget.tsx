import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { postNdjson } from '../../lib/ndjson';
import { useAiStatus } from '../../hooks/useAiStatus';
import { Markdown } from '../../components/ui/Markdown';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import type { WidgetData } from '../../../../shared/dashboards';

export function AiInsightWidget({
  dashboardId,
  widgetId,
  data,
}: {
  dashboardId: number;
  widgetId: string;
  data: Extract<WidgetData, { kind: 'ai_insight' }>;
}) {
  const ai = useAiStatus();
  const qc = useQueryClient();
  const [text, setText] = useState(data.text ?? '');
  const [generatedAt, setGeneratedAt] = useState(data.generatedAt);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setStreaming(true);
    setText('');
    setError('');
    try {
      await postNdjson(`/dashboards/${dashboardId}/widgets/${widgetId}/insight`, {}, (event) => {
        if (event.type === 'text') setText((current) => current + event.delta);
        if (event.type === 'error') setError(event.message);
      });
      setGeneratedAt(new Date().toISOString());
      await qc.invalidateQueries({ queryKey: ['widget', dashboardId, widgetId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setStreaming(false);
    }
  }

  if (!ai.data?.usable) {
    return <p className="t-meta text-muted">AI is not set up.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto t-meta">
        {text ? <Markdown>{text}</Markdown> : <p className="text-muted">No insight yet.</p>}
        {streaming && (
          <p className="mt-1 flex items-center gap-1 t-meta text-muted">
            <Spinner size={11} /> Generating…
          </p>
        )}
        {error && <p className="t-meta text-danger">{error}</p>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="t-meta text-muted">
          {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}` : ''}
        </span>
        <Button
          size="sm"
          variant="secondary"
          icon={<Sparkles size={12} />}
          loading={streaming}
          onClick={generate}
        >
          {text ? 'Refresh' : 'Generate insight'}
        </Button>
      </div>
    </div>
  );
}
