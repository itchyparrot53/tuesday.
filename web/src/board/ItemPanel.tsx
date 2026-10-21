import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, MoreHorizontal, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useAiStatus } from '../hooks/useAiStatus';
import { SummaryDialog } from '../ai/SummaryDialog';
import { openAi } from '../ai/openAi';
import { relative } from '../lib/format';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Dialog, Drawer } from '../components/ui/Dialog';
import { UnderlineTabs } from '../components/ui/Tabs';
import { Menu, MenuItem } from '../components/ui/Menu';
import { Spinner } from '../components/ui/Spinner';
import { CellEditor } from './cells/CellEditor';
import { CellDisplay } from './cells/CellDisplay';
import { UpdatesThread } from './UpdatesThread';
import { FilesTab } from './FilesTab';
import { useArchiveItems, useCreateItem, useUpdateItem } from './mutations';
import type { Activity, BoardFull, Item, Update, User } from '../../../shared/types';

interface ItemDetail {
  item: Item;
  board: { id: number; name: string };
  subitems: Item[];
  updates: Update[];
}

export type ItemPanelTab = 'updates' | 'info' | 'files' | 'activity';

export function ItemPanel({
  itemId,
  full,
  users,
  initialTab = 'updates',
  onTabChange,
  onClose,
}: {
  itemId: number;
  full: BoardFull;
  users: Map<number, User>;
  initialTab?: ItemPanelTab;
  onTabChange?: (tab: ItemPanelTab) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => api<ItemDetail>('GET', `/items/${itemId}`),
  });
  const activity = useQuery({
    queryKey: ['activity', 'item', itemId],
    queryFn: async () =>
      (await api<{ activity: Activity[] }>('GET', `/items/${itemId}/activity`)).activity,
  });
  const links = useQuery({
    queryKey: ['item-links', itemId],
    queryFn: async () =>
      (
        await api<{
          linkedFrom: {
            itemId: number;
            name: string;
            boardId: number;
            boardName: string;
            columnTitle: string;
          }[];
        }>('GET', `/items/${itemId}/links`)
      ).linkedFrom,
  });
  const updateItem = useUpdateItem(full.board.id);
  const createItem = useCreateItem(full.board.id);
  const archive = useArchiveItems(full.board.id);
  const [tab, setTab] = useState<ItemPanelTab>(initialTab);
  const [name, setName] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const ai = useAiStatus();

  useEffect(() => {
    if (detail.data) setName(detail.data.item.name);
  }, [detail.data?.item.name, itemId]);

  useEffect(() => {
    setTab(initialTab);
  }, [itemId, initialTab]);

  if (detail.isLoading || !detail.data) {
    return (
      <Drawer
        open
        onOpenChange={(open) => !open && onClose()}
        title="Item"
        header={<span className="t-section text-ink">Item</span>}
      >
        <div className="flex h-full items-center justify-center">
          <Spinner size={20} />
        </div>
      </Drawer>
    );
  }

  const { item, subitems, updates } = detail.data;
  const group = full.groups.find((g) => g.id === item.groupId);
  const statusColumn = full.columns.find((column) => column.type === 'status');
  const statusDone = full.columns
    .filter((column) => column.type === 'status')
    .some((column) => {
      const value = item.values[String(column.id)] as { labelId?: string } | undefined;
      return (
        column.settings.labels?.find((l) => l.id === value?.labelId)?.name.toLowerCase() === 'done'
      );
    });

  function saveName() {
    if (!name.trim() || name === item.name) {
      setName(item.name);
      return;
    }
    updateItem.mutate({ itemId, name: name.trim() });
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={item.name}
      closeLabel="Close item panel"
      header={
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate t-meta text-muted">
              {full.board.name} › {group?.title ?? 'Group'}
            </p>
            <input
              aria-label="Item name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setName(item.name);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="t-title w-full border-b border-transparent bg-transparent text-ink outline-none focus:border-accent"
            />
          </div>
          {ai.data?.usable && (
            <Button
              data-testid="ask-ai-here"
              variant="ghost"
              size="sm"
              aria-label="Ask AI about this"
              icon={<Sparkles size={14} className="text-ai" />}
              onClick={() => openAi(navigate, { itemId })}
            />
          )}
          <Menu
            trigger={
              <button
                className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
                aria-label="Item menu"
                title="Item menu"
              >
                <MoreHorizontal size={16} />
              </button>
            }
          >
            <MenuItem danger onSelect={() => setArchiveOpen(true)}>
              <Archive size={14} /> Archive item
            </MenuItem>
          </Menu>
        </div>
      }
    >
      <div data-testid="item-panel" className="flex h-full flex-col">
        <UnderlineTabs
          className="px-5"
          value={tab}
          onChange={(id) => {
            const next = id as ItemPanelTab;
            setTab(next);
            onTabChange?.(next);
          }}
          tabs={[
            { id: 'updates', label: 'Updates', testId: 'item-tab-updates' },
            { id: 'info', label: 'Info', testId: 'item-tab-info' },
            { id: 'files', label: 'Files', testId: 'item-tab-files' },
            { id: 'activity', label: 'Activity', testId: 'item-tab-activity' },
          ]}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          {tab === 'updates' && (
            <div>
              {ai.data?.usable && (
                <div className="mb-3 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Sparkles size={14} className="text-ai" />}
                    onClick={() => setSummaryOpen(true)}
                  >
                    Summarize
                  </Button>
                </div>
              )}
              <UpdatesThread itemId={itemId} boardId={full.board.id} updates={updates} />
            </div>
          )}

          {tab === 'info' && (
            <div>
              <div className="space-y-2.5">
                {full.columns.map((column) => (
                  <div
                    key={column.id}
                    className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3"
                  >
                    <span className="t-label truncate text-muted">{column.title}</span>
                    <div
                      className={cn(
                        'board-cell flex min-h-9 min-w-0 items-center overflow-hidden rounded-control border border-line px-2',
                        column.type === 'status' && 'overflow-hidden p-0',
                      )}
                    >
                      <CellEditor
                        column={column}
                        item={item}
                        users={users}
                        boardId={full.board.id}
                        statusDone={statusDone}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-line pt-5">
                <h3 className="t-section mb-3 text-ink">Subitems</h3>
                <div className="space-y-1">
                  {subitems.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 rounded-control border border-line px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{sub.name}</span>
                      {statusColumn && (
                        <CellDisplay
                          column={statusColumn}
                          value={sub.values[String(statusColumn.id)]}
                          users={users}
                          statusDone={false}
                        />
                      )}
                    </div>
                  ))}
                  {subitems.length === 0 && <p className="text-sm text-muted">No subitems yet.</p>}
                </div>
                {addingSub ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && subName.trim()) {
                          createItem.mutate(
                            {
                              groupId: item.groupId,
                              name: subName.trim(),
                              parentId: item.id,
                              at: 'bottom',
                            },
                            {
                              onSuccess: () => {
                                setSubName('');
                                setAddingSub(false);
                                qc.invalidateQueries({ queryKey: ['item', itemId] });
                              },
                            },
                          );
                        }
                        if (e.key === 'Escape') setAddingSub(false);
                      }}
                      placeholder="Subitem name"
                      className="h-8 flex-1 rounded-control border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent"
                    />
                    <Button size="sm" variant="secondary" onClick={() => setAddingSub(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    className="mt-2 text-sm text-muted hover:text-ink"
                    onClick={() => setAddingSub(true)}
                  >
                    + Add subitem
                  </button>
                )}
              </div>

              <div className="mt-6 border-t border-line pt-5">
                <h3 className="t-section mb-3 text-ink">Linked from</h3>
                {links.data?.length ? (
                  <div className="space-y-1">
                    {links.data.map((link) => (
                      <Link
                        key={`${link.boardId}-${link.itemId}-${link.columnTitle}`}
                        to={`/boards/${link.boardId}?item=${link.itemId}`}
                        className="flex items-center gap-2 rounded-control border border-line px-2 py-1.5 text-sm text-ink hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate">{link.name}</span>
                        <span className="t-meta shrink-0 text-muted">
                          {link.boardName} · {link.columnTitle}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No other items link here yet.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'files' && <FilesTab itemId={itemId} />}

          {tab === 'activity' && (
            <div className="space-y-2">
              {activity.isLoading && <Spinner size={16} />}
              {activity.data?.length === 0 && (
                <p className="text-sm text-muted">No activity yet.</p>
              )}
              {activity.data?.map((entry) => {
                const actor =
                  entry.actorKind === 'ai'
                    ? 'Tuesday AI'
                    : entry.actorKind === 'system'
                      ? 'Tuesday'
                      : (users.get(entry.actorId ?? -1)?.name ?? 'Someone');
                return (
                  <div key={entry.id} className="flex items-start gap-2 text-sm text-ink">
                    {entry.actorKind === 'ai' ? (
                      <Sparkles size={13} className="mt-0.5 text-ai" />
                    ) : (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted" />
                    )}
                    <span>
                      <strong>{actor}</strong> {describe(entry)} ·{' '}
                      <span className="t-meta text-muted">{relative(entry.createdAt)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        kind="item"
        id={itemId}
        boardId={full.board.id}
      />

      <Dialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive item"
        description={`Archive "${item.name}"?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                archive.mutate([itemId]);
                setArchiveOpen(false);
                onClose();
              }}
            >
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          The item and its subitems will be hidden from the board.
        </p>
      </Dialog>
    </Drawer>
  );
}

function describe(entry: Activity): string {
  switch (entry.action) {
    case 'item_created':
      return 'created this item';
    case 'item_renamed':
      return `changed the name from "${String(entry.data.from ?? '')}" to "${String(entry.data.to ?? '')}"`;
    case 'value_changed':
      return `changed ${String(entry.data.columnTitle ?? 'a field')} from "${String(entry.data.from ?? '')}" to "${String(entry.data.to ?? '')}"`;
    case 'item_moved':
      return `moved this item from ${String(entry.data.from ?? 'a group')} to ${String(entry.data.to ?? 'a group')}`;
    case 'item_archived':
      return 'archived this item';
    case 'update_posted':
      return 'posted an update';
    case 'board_created':
      return 'created this board';
    default:
      return String(entry.action).replace(/_/g, ' ');
  }
}
