import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { doneLabelIdsFor, type Label } from '../../../../shared/columns';
import type { CellEditorProps } from './CellEditor';
import { CellDisplay } from './CellDisplay';
import { Popover } from '../../components/ui/Popover';
import { LabelEditor } from './LabelEditor';
import { useSetValue, useUpdateColumn } from '../mutations';
import { labelStyle, useTheme } from '../../lib/labelColors';

export function StatusCell(props: CellEditorProps) {
  const { column, item, users, boardId, statusDone } = props;
  const isDropdown = column.type === 'dropdown';
  const labels: Label[] = (isDropdown ? column.settings.options : column.settings.labels) ?? [];
  const doneIds = isDropdown ? [] : doneLabelIdsFor(column);
  const value = item.values[String(column.id)];
  const setValue = useSetValue(boardId);
  const updateColumn = useUpdateColumn(boardId);
  const [edit, setEdit] = useState(false);
  const theme = useTheme();

  function moveFocus(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    if (!buttons.length) return;
    const index = buttons.indexOf(event.currentTarget);
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  if (isDropdown) {
    const ids = ((value as { optionIds?: string[] } | undefined)?.optionIds ?? []) as string[];
    return (
      <Popover
        className="w-[220px]"
        trigger={
          <button className="flex h-full w-full items-center overflow-hidden text-left">
            {ids.length ? (
              <CellDisplay column={column} value={value} users={users} statusDone={statusDone} />
            ) : (
              <span className="text-sm text-muted">Choose options</span>
            )}
          </button>
        }
      >
        {edit ? (
          <LabelEditor
            labels={labels}
            onCancel={() => setEdit(false)}
            onSave={(next) => {
              updateColumn.mutate({ columnId: column.id, settings: { options: next } });
              setEdit(false);
            }}
          />
        ) : (
          <>
            <div className="space-y-1">
              {labels.map((option) => {
                const checked = ids.includes(option.id);
                return (
                  <button
                    key={option.id}
                    onKeyDown={moveFocus}
                    onClick={() => {
                      const next = checked
                        ? ids.filter((id) => id !== option.id)
                        : [...ids, option.id];
                      setValue.mutate({
                        itemId: item.id,
                        columnId: column.id,
                        value: next.length ? { optionIds: next } : null,
                      });
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-control px-1.5 text-left text-sm hover:bg-sunken"
                  >
                    <span
                      className="rounded-chip px-2 py-0.5 font-medium"
                      style={{
                        backgroundColor: labelStyle(option.color, theme).tint,
                        color: labelStyle(option.color, theme).text,
                      }}
                    >
                      {option.name}
                    </span>
                    {checked && <Check size={14} className="ml-auto text-accent" />}
                  </button>
                );
              })}
              {labels.length === 0 && (
                <p className="px-1 py-1 text-xs text-muted">No options yet</p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                className="text-sm text-muted hover:text-ink"
                onClick={() =>
                  setValue.mutate({ itemId: item.id, columnId: column.id, value: null })
                }
              >
                Clear
              </button>
              <button className="text-sm text-accent" onClick={() => setEdit(true)}>
                Edit options
              </button>
            </div>
          </>
        )}
      </Popover>
    );
  }

  const labelId = (value as { labelId?: string } | undefined)?.labelId;
  return (
    <Popover
      className="w-[220px]"
      trigger={
        <button className="flex h-full w-full items-center overflow-hidden text-left">
          {labelId ? (
            <CellDisplay column={column} value={value} users={users} statusDone={statusDone} />
          ) : (
            <span className="text-sm text-muted">Select status</span>
          )}
        </button>
      }
    >
      {edit ? (
        <LabelEditor
          labels={labels}
          allowDone
          doneLabelIds={column.settings.doneLabelIds ?? []}
          onCancel={() => setEdit(false)}
          onSave={(next, doneLabelIds) => {
            updateColumn.mutate({
              columnId: column.id,
              settings: { labels: next, doneLabelIds },
            });
            setEdit(false);
          }}
        />
      ) : (
        <>
          <div className="space-y-1">
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() =>
                  setValue.mutate({
                    itemId: item.id,
                    columnId: column.id,
                    value: { labelId: label.id },
                  })
                }
                onKeyDown={(event) => {
                  moveFocus(event);
                  if (event.key === 'Enter') {
                    window.setTimeout(
                      () => window.dispatchEvent(new CustomEvent('tuesday:cell-commit')),
                      0,
                    );
                  }
                }}
                className="flex h-8 w-full items-center gap-2 rounded-control px-1.5 text-left text-sm hover:bg-sunken"
              >
                <span
                  className="rounded-chip px-2 py-0.5 font-medium"
                  style={{
                    backgroundColor: labelStyle(label.color, theme).tint,
                    color: labelStyle(label.color, theme).text,
                  }}
                >
                  {label.name}
                </span>
                {doneIds.includes(label.id) && (
                  <span
                    aria-hidden="true"
                    className="ml-auto flex items-center gap-1 t-meta text-muted"
                  >
                    <Check size={11} className="text-success" />
                    Done
                  </span>
                )}
                {labelId === label.id && (
                  <Check
                    size={14}
                    className={doneIds.includes(label.id) ? 'text-accent' : 'ml-auto text-accent'}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              className="text-sm text-muted hover:text-ink"
              onClick={() => setValue.mutate({ itemId: item.id, columnId: column.id, value: null })}
            >
              Clear
            </button>
            <button className="text-sm text-accent" onClick={() => setEdit(true)}>
              Edit labels
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}
