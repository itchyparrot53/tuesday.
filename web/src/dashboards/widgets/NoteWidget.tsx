import { Markdown } from '../../components/ui/Markdown';
import type { WidgetData } from '../../../../shared/dashboards';

export function NoteWidget({ data }: { data: Extract<WidgetData, { kind: 'note' }> }) {
  return (
    <div className="h-full overflow-auto t-meta">
      <Markdown>{data.text || 'Double-click Edit to write a note.'}</Markdown>
    </div>
  );
}
