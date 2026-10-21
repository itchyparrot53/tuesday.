import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { labelStyle, useTheme } from '../../lib/labelColors';
import type { AiCellValue } from '../../../../shared/columns';
import type { CellEditorProps } from './CellEditor';

export function AiCell({ column, item, boardId }: CellEditorProps) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const value = item.values[String(column.id)] as AiCellValue | undefined;
  const label = value?.labelId
    ? column.settings.labels?.find((entry) => entry.id === value.labelId)
    : undefined;

  async function run() {
    setRunning(true);
    try {
      await api('POST', `/columns/${column.id}/ai-run`, { itemIds: [item.id] });
      await qc.invalidateQueries({ queryKey: ['items', boardId] });
      await qc.invalidateQueries({ queryKey: ['board', boardId] });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="group flex h-full w-full items-center gap-1 overflow-hidden">
      {value?.state === 'pending' || running ? (
        <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-muted">
          <Spinner size={12} />
          <span className="truncate">{value?.text ?? ''}</span>
        </span>
      ) : value?.state === 'error' ? (
        <span
          className="flex min-w-0 flex-1 items-center gap-1 text-danger"
          title={value.error ?? 'AI failed'}
        >
          <AlertTriangle size={13} />
          <span className="truncate text-sm">{value.error ?? 'AI failed'}</span>
        </span>
      ) : label ? (
        <span
          className="truncate rounded-chip px-1.5 py-0.5 t-meta font-medium"
          style={{
            backgroundColor: labelStyle(label.color, theme).tint,
            color: labelStyle(label.color, theme).text,
          }}
          title={value?.text}
        >
          {label.name}
        </span>
      ) : value?.text ? (
        <span className="min-w-0 flex-1 truncate text-sm text-ink" title={value.text}>
          {value.text}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <button
        aria-label={`Run AI for ${item.name}`}
        title="Run AI for this item"
        className="shrink-0 rounded-control p-0.5 text-ai opacity-0 hover:bg-ai-soft group-hover:opacity-100"
        onClick={run}
      >
        <Sparkles size={12} />
      </button>
    </div>
  );
}
