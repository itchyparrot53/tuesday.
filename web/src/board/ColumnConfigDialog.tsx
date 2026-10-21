import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input, Textarea } from '../components/ui/Input';
import { useCreateColumn, useUpdateColumn } from './mutations';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import type { Column, BoardFull } from '../../../shared/types';
import type { ColumnType } from '../../../shared/columns';

const TYPES = new Set<ColumnType>([
  'formula',
  'dependency',
  'connect',
  'mirror',
  'time_tracking',
  'file',
]);

export function ColumnConfigDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  type,
  column,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: number;
  columns: Column[];
  type: ColumnType;
  column?: Column | null;
}) {
  const workspaces = useWorkspaces();
  const create = useCreateColumn(boardId);
  const update = useUpdateColumn(boardId);
  const [title, setTitle] = useState('');
  const [expression, setExpression] = useState('');
  const [format, setFormat] = useState<'number' | 'text' | 'date'>('number');
  const [decimals, setDecimals] = useState(0);
  const [autoShift, setAutoShift] = useState(true);
  const [aiFormulaOpen, setAiFormulaOpen] = useState(false);
  const [formulaText, setFormulaText] = useState('');
  const [formulaExplanation, setFormulaExplanation] = useState('');
  const [formulaLoading, setFormulaLoading] = useState(false);
  const toast = useToast();
  const [targetBoardId, setTargetBoardId] = useState<number | null>(null);
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [connectColumnId, setConnectColumnId] = useState<number | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<number | null>(null);
  const [aggregate, setAggregate] = useState<
    'list' | 'sum' | 'avg' | 'min' | 'max' | 'count' | 'earliest' | 'latest'
  >('list');

  const connectColumns = columns.filter((entry) => entry.type === 'connect');
  const connectColumn = connectColumns.find((entry) => entry.id === connectColumnId);
  const targetBoard =
    type === 'mirror' ? connectColumn?.settings.targetBoardId : (targetBoardId ?? undefined);
  const targetBoardQuery = useQuery({
    queryKey: ['board', targetBoard],
    queryFn: () => api<BoardFull>('GET', `/boards/${targetBoard}`),
    enabled: Boolean(targetBoard),
  });

  useEffect(() => {
    if (!open) return;
    setTitle(column?.title ?? type.replace('_', ' '));
    setExpression(column?.settings.expression ?? '');
    setFormat(column?.settings.format ?? 'number');
    setDecimals(column?.settings.decimals ?? 0);
    setAutoShift(column?.settings.autoShift ?? true);
    setTargetBoardId(column?.settings.targetBoardId ?? null);
    setAllowMultiple(column?.settings.allowMultiple ?? true);
    setConnectColumnId(column?.settings.connectColumnId ?? connectColumns[0]?.id ?? null);
    setTargetColumnId(column?.settings.targetColumnId ?? null);
    setAggregate(column?.settings.aggregate ?? 'list');
  }, [open, column?.id, type]);

  const boardOptions = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards.map((board) => ({ id: board.id, name: board.name })),
  );

  function save() {
    const settings: Record<string, unknown> = {};
    if (type === 'formula') {
      settings.expression = expression;
      settings.format = format;
      settings.decimals = decimals;
    }
    if (type === 'dependency') settings.autoShift = autoShift;
    if (type === 'connect') {
      settings.targetBoardId = targetBoardId;
      settings.allowMultiple = allowMultiple;
    }
    if (type === 'mirror') {
      settings.connectColumnId = connectColumnId;
      settings.targetColumnId = targetColumnId;
      settings.aggregate = aggregate;
    }
    if (column) {
      update.mutate(
        { columnId: column.id, title, settings },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate({ title, type, settings }, { onSuccess: () => onOpenChange(false) });
    }
  }

  const busy = create.isPending || update.isPending;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${column ? 'Edit' : 'New'} ${type.replace('_', ' ')} column`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!title.trim()} onClick={save}>
            {column ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <label htmlFor="column-title" className="t-label mb-1 block text-ink">
        Title
      </label>
      <Input
        id="column-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="mb-3"
        autoFocus
      />

      {type === 'formula' && (
        <>
          <div className="mb-2">
            <button
              data-testid="ai-formula-open"
              type="button"
              className="inline-flex items-center gap-1 t-meta text-accent"
              onClick={() => setAiFormulaOpen((open) => !open)}
            >
              <Sparkles size={12} /> Describe it
            </button>
            {aiFormulaOpen && (
              <div className="mt-2 space-y-2 rounded-control border border-line p-2">
                <Textarea
                  aria-label="Describe the formula"
                  rows={2}
                  value={formulaText}
                  onChange={(event) => setFormulaText(event.target.value)}
                  placeholder="e.g. twice the hours column"
                />
                <Button
                  size="sm"
                  loading={formulaLoading}
                  disabled={!formulaText.trim()}
                  onClick={async () => {
                    setFormulaLoading(true);
                    try {
                      const result = await api<{ formula: string; explanation: string }>(
                        'POST',
                        `/boards/${boardId}/ai-formula`,
                        { description: formulaText },
                      );
                      setExpression(result.formula);
                      setFormulaExplanation(result.explanation);
                    } catch (error) {
                      toast.show((error as Error).message, 'error');
                    } finally {
                      setFormulaLoading(false);
                    }
                  }}
                >
                  Write formula
                </Button>
                {formulaExplanation && <p className="t-meta text-muted">{formulaExplanation}</p>}
              </div>
            )}
          </div>
          <label htmlFor="column-expression" className="t-label mb-1 block text-ink">
            Expression
          </label>
          <Textarea
            id="column-expression"
            rows={4}
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="{Hours} * 2"
            className="mb-2 font-mono text-sm"
          />
          <div className="mb-3 flex gap-1">
            {columns.slice(0, 8).map((entry) => (
              <button
                key={entry.id}
                className="rounded-full bg-sunken px-2 py-0.5 t-meta text-muted"
                onClick={() => setExpression((value) => `${value}{${entry.title}}`)}
              >
                {entry.title}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Formula format"
              value={format}
              onChange={(event) => setFormat(event.target.value as 'number')}
              className="h-8 rounded-control border border-line bg-surface px-2 text-sm"
            >
              <option value="number">Number</option>
              <option value="text">Text</option>
              <option value="date">Date</option>
            </select>
            <Input
              aria-label="Decimal places"
              type="number"
              min={0}
              max={4}
              value={decimals}
              onChange={(event) => setDecimals(Number(event.target.value))}
            />
          </div>
        </>
      )}

      {type === 'dependency' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoShift}
            onChange={(event) => setAutoShift(event.target.checked)}
          />
          Auto-shift dependents when this item's dates move
        </label>
      )}

      {type === 'connect' && (
        <>
          <label className="t-label mb-1 block text-ink">Target board</label>
          <select
            aria-label="Target board"
            value={targetBoardId ?? ''}
            onChange={(event) => setTargetBoardId(Number(event.target.value))}
            className="mb-3 h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
          >
            <option value="">Choose…</option>
            {boardOptions.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(event) => setAllowMultiple(event.target.checked)}
            />
            Allow multiple linked items
          </label>
        </>
      )}

      {type === 'mirror' && (
        <>
          <label className="t-label mb-1 block text-ink">Connect column</label>
          <select
            aria-label="Connect column"
            value={connectColumnId ?? ''}
            onChange={(event) => setConnectColumnId(Number(event.target.value))}
            className="mb-3 h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
          >
            <option value="">Choose…</option>
            {connectColumns.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
          <label className="t-label mb-1 block text-ink">Target column</label>
          <select
            aria-label="Target column"
            value={targetColumnId ?? ''}
            onChange={(event) => setTargetColumnId(Number(event.target.value))}
            className="mb-3 h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
          >
            <option value="">Choose…</option>
            {(targetBoardQuery.data?.columns ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
          <label className="t-label mb-1 block text-ink">Aggregate</label>
          <select
            aria-label="Aggregate"
            value={aggregate}
            onChange={(event) => setAggregate(event.target.value as 'list')}
            className="h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
          >
            <option value="list">List</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
            <option value="count">Count</option>
            <option value="earliest">Earliest</option>
            <option value="latest">Latest</option>
          </select>
        </>
      )}
    </Dialog>
  );
}

export { TYPES };
