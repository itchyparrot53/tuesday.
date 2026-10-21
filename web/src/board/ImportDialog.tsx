import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Input';
import type { BoardFull, ImportMapping, ImportPreview } from '../../../shared/types';

type TargetChoice = string;

function encodeTarget(mapping: ImportMapping): TargetChoice {
  if (mapping.target === 'name' || mapping.target === 'group' || mapping.target === 'skip') {
    return mapping.target;
  }
  if ('columnId' in mapping.target) return `col:${mapping.target.columnId}`;
  return `new:${mapping.target.newColumn.type}`;
}

function decodeTarget(header: string, choice: TargetChoice): ImportMapping['target'] {
  if (choice === 'name' || choice === 'group' || choice === 'skip') return choice;
  if (choice.startsWith('col:')) return { columnId: Number(choice.slice(4)) };
  return {
    newColumn: {
      title: header || 'Imported column',
      type: choice.slice(4) as 'text',
    },
  };
}

export function ImportDialog({
  full,
  open,
  onOpenChange,
}: {
  full: BoardFull;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, TargetChoice>>({});
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: { row: number; message: string }[];
    automationsSkipped?: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const data = await api<ImportPreview>('POST', `/boards/${full.board.id}/import/preview`, {
        csv,
      });
      setPreview(data);
      setChoices(
        Object.fromEntries(
          data.suggested.map((mapping) => [mapping.header, encodeTarget(mapping)]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!preview) return;
    setLoading(true);
    setError('');
    try {
      const mapping = preview.headers.map((header) => ({
        header,
        target: decodeTarget(header, choices[header] ?? 'skip'),
      }));
      const data = await api<{
        created: number;
        skipped: number;
        errors: { row: number; message: string }[];
        automationsSkipped?: boolean;
      }>('POST', `/boards/${full.board.id}/import`, { csv, mapping });
      setResult(data);
      await qc.invalidateQueries({ queryKey: ['items', full.board.id] });
      await qc.invalidateQueries({ queryKey: ['board', full.board.id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import from CSV"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!preview && (
            <Button loading={loading} disabled={!csv.trim()} onClick={loadPreview}>
              Preview
            </Button>
          )}
          {preview && !result && (
            <Button data-testid="import-confirm" loading={loading} onClick={runImport}>
              Import {preview.rowCount} rows
            </Button>
          )}
        </>
      }
    >
      <div data-testid="import-dialog">
        <ol className="mb-4 flex items-center gap-3 t-meta text-muted">
          {['Upload', 'Map', 'Done'].map((step, index) => {
            const stepNumber = result ? 3 : preview ? 2 : 1;
            const active = index + 1 === stepNumber;
            return (
              <li
                key={step}
                className={cn(
                  'inline-flex items-center gap-1.5',
                  active && 'font-semibold text-ink',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border border-line t-meta',
                    active && 'border-accent bg-accent text-accent-ink',
                  )}
                >
                  {index + 1}
                </span>
                {step}
                {index < 2 && <span className="ml-3 h-px w-6 bg-line" />}
              </li>
            );
          })}
        </ol>
        {!preview && (
          <div>
            <label className="mb-1 block text-sm font-medium">CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              className="mb-3 block text-sm"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
            <label className="mb-1 block text-sm font-medium">Or paste CSV</label>
            <Textarea
              rows={8}
              aria-label="Or paste CSV"
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder="Item,Status,Owner"
            />
          </div>
        )}

        {preview && !result && (
          <div>
            <p className="mb-2 text-sm text-muted">
              {preview.rowCount} rows. Map each column, then import.
            </p>
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full text-left t-meta">
                <thead>
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header} className="border-b border-line p-1 align-top">
                        <Select
                          ariaLabel={`Map ${header}`}
                          value={choices[header] ?? 'skip'}
                          onChange={(value) =>
                            setChoices((current) => ({ ...current, [header]: value }))
                          }
                          options={[
                            { value: 'skip', label: 'Skip' },
                            { value: 'name', label: 'Item name' },
                            { value: 'group', label: 'Group' },
                            ...full.columns.map((column) => ({
                              value: `col:${column.id}`,
                              label: column.title,
                            })),
                            { value: 'new:text', label: 'New text column' },
                            { value: 'new:number', label: 'New number column' },
                            { value: 'new:date', label: 'New date column' },
                          ]}
                          size="sm"
                          className="mb-1"
                        />
                        <span className="t-meta font-medium">{header}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border-b border-line p-1 text-muted">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="text-sm">
            <p className="font-medium text-ink">
              Imported {result.created} items{result.skipped ? `, skipped ${result.skipped}` : ''}.
            </p>
            {result.automationsSkipped && (
              <p className="mt-1 text-xs text-muted">Automations were not run for this import.</p>
            )}
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-[200px] space-y-0.5 overflow-auto text-xs text-danger">
                {result.errors.slice(0, 50).map((entry, index) => (
                  <li key={index}>
                    Row {entry.row}: {entry.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
