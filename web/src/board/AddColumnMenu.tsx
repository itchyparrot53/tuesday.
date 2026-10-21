import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { COLUMN_TYPES, COLUMN_TYPE_META } from '../../../shared/columns';
import type { Column } from '../../../shared/types';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { useAiStatus } from '../hooks/useAiStatus';
import { AiColumnDialog } from '../ai/AiColumnDialog';
import { ColumnSuggestDialog } from './ColumnSuggestDialog';
import { ColumnConfigDialog } from './ColumnConfigDialog';
import type { ColumnType } from '../../../shared/columns';
import { COLUMN_ICONS } from './columnIcons';
import { useCreateColumn } from './mutations';

export function AddColumnMenu({ boardId, columns }: { boardId: number; columns: Column[] }) {
  const create = useCreateColumn(boardId);
  const ai = useAiStatus();
  const [aiOpen, setAiOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [configType, setConfigType] = useState<ColumnType | null>(null);
  const afterColumnId = columns.length ? columns[columns.length - 1].id : null;
  return (
    <>
      <Menu
        trigger={
          <button
            data-testid="add-column"
            aria-label="Add column"
            className="rounded-control p-0.5 text-muted hover:bg-sunken hover:text-ink"
          >
            <Plus size={16} />
          </button>
        }
      >
        {COLUMN_TYPES.filter((type) => type !== 'ai').map((type) => {
          const Icon = COLUMN_ICONS[type];
          return (
            <MenuItem
              key={type}
              onSelect={() => {
                if (
                  ['formula', 'dependency', 'connect', 'mirror', 'time_tracking', 'file'].includes(
                    type,
                  )
                ) {
                  setConfigType(type);
                } else {
                  create.mutate({
                    title: COLUMN_TYPE_META[type].label,
                    type,
                    afterColumnId,
                  });
                }
              }}
            >
              <Icon size={14} className="text-muted" />
              {COLUMN_TYPE_META[type].label}
            </MenuItem>
          );
        })}
        {ai.data?.usable && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => setAiOpen(true)}>
              <Sparkles size={14} className="text-ai" />
              AI column
            </MenuItem>
            <MenuItem data-testid="ai-suggest-columns" onSelect={() => setSuggestOpen(true)}>
              <Sparkles size={14} className="text-ai" />
              Suggest columns
            </MenuItem>
          </>
        )}
      </Menu>
      {configType && (
        <ColumnConfigDialog
          open={Boolean(configType)}
          onOpenChange={(next) => !next && setConfigType(null)}
          boardId={boardId}
          columns={columns}
          type={configType}
        />
      )}
      <AiColumnDialog open={aiOpen} onOpenChange={setAiOpen} boardId={boardId} columns={columns} />
      <ColumnSuggestDialog open={suggestOpen} onOpenChange={setSuggestOpen} boardId={boardId} />
    </>
  );
}
