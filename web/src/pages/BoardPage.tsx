import { rememberRecent } from '../lib/recent';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useBoard } from '../hooks/useBoard';
import { useUsers } from '../hooks/useUsers';
import { BoardHeader } from '../board/BoardHeader';
import { BoardToolbar } from '../board/BoardToolbar';
import { TableView } from '../board/TableView';
import { KanbanView } from '../board/views/KanbanView';
import { CalendarView } from '../board/views/CalendarView';
import { TimelineView } from '../board/views/TimelineView';
import { ItemPanel, type ItemPanelTab } from '../board/ItemPanel';
import { BulkBar } from '../board/BulkBar';
import { applyView } from '../board/filters';
import { Skeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '../../../shared/types';

export function BoardPage() {
  const { id } = useParams();
  const boardId = Number(id);
  const { full, items, isLoading, isError, refetch } = useBoard(boardId);
  const users = useUsers();
  const [params, setParams] = useSearchParams();

  const viewId = params.get('view');
  const view = full?.views.find((v) => String(v.id) === viewId) ?? full?.views[0];

  const [settings, setSettings] = useState<ViewSettings>(view?.settings ?? DEFAULT_VIEW_SETTINGS);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [aiFilterActive, setAiFilterActive] = useState(false);

  useEffect(() => {
    if (view) setSettings(view.settings);
  }, [view?.id]);

  useEffect(() => {
    setSelected(new Set());
  }, [boardId, view?.id]);

  if (isLoading || users.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line p-4">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <div className="border-b border-line p-3">
          <Skeleton className="h-8 w-full max-w-xl" />
        </div>
        <div className="space-y-6 p-4">
          {[0, 1, 2].map((group) => (
            <div key={group}>
              <Skeleton className="mb-2 h-6 w-40" />
              <div className="space-y-2">
                {[0, 1, 2, 3].map((row) => (
                  <Skeleton key={row} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-7">
        <QueryError onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!full || !items) {
    return (
      <div className="p-7">
        <QueryError onRetry={() => void refetch()} message="This board could not be found." />
      </div>
    );
  }

  const byId = users.data?.byId ?? new Map();
  const userName = (userId: number) => byId.get(userId)?.name ?? '';
  const itemNames = new Map(items.map((entry) => [entry.id, entry.name]));
  const visibleItems = applyView(items, full.columns, settings, {
    userName,
    itemName: (itemId) => itemNames.get(itemId) ?? `#${itemId}`,
  });
  const openItemId = Number(params.get('item') ?? 0);
  const panelParam = params.get('panel');
  const panelTab: ItemPanelTab =
    panelParam === 'info' || panelParam === 'files' || panelParam === 'activity'
      ? panelParam
      : 'updates';

  function toggleSelect(itemId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function selectGroup(groupId: number, value: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of items!.filter((i) => i.groupId === groupId)) {
        if (value) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function openItem(itemId: number, tab: ItemPanelTab = 'updates') {
    const next = new URLSearchParams(params);
    next.set('item', String(itemId));
    if (tab === 'updates') next.delete('panel');
    else next.set('panel', tab);
    setParams(next);
  }

  function closeItem() {
    const next = new URLSearchParams(params);
    next.delete('item');
    next.delete('panel');
    setParams(next);
  }

  function setPanelTab(tab: ItemPanelTab) {
    const next = new URLSearchParams(params);
    if (tab === 'updates') next.delete('panel');
    else next.set('panel', tab);
    setParams(next, { replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <BoardHeader full={full} />
      {view && (
        <BoardToolbar
          key={view.id}
          boardId={boardId}
          full={full}
          view={view}
          settings={settings}
          onChange={setSettings}
          users={byId}
          aiFilterActive={aiFilterActive}
          onAiFilterChange={setAiFilterActive}
        />
      )}
      <div className="min-h-0 flex-1">
        {view?.type === 'kanban' && (
          <KanbanView
            full={full}
            items={visibleItems}
            users={byId}
            boardId={boardId}
            view={view}
            onOpen={openItem}
          />
        )}
        {view?.type === 'calendar' && (
          <CalendarView
            full={full}
            items={visibleItems}
            users={byId}
            boardId={boardId}
            view={view}
            settings={settings}
            onChange={setSettings}
            onOpen={openItem}
          />
        )}
        {view?.type === 'timeline' && (
          <TimelineView
            full={full}
            items={visibleItems}
            users={byId}
            boardId={boardId}
            view={view}
            settings={settings}
            onOpen={openItem}
          />
        )}
        {(view?.type === 'table' || !view) && (
          <TableView
            full={full}
            items={visibleItems}
            users={byId}
            boardId={boardId}
            hiddenColumnIds={settings.hiddenColumnIds}
            selected={selected}
            onToggleSelect={toggleSelect}
            onSelectGroup={selectGroup}
            onHideColumn={(columnId) =>
              setSettings({
                ...settings,
                hiddenColumnIds: [...settings.hiddenColumnIds, columnId],
              })
            }
            onOpen={openItem}
          />
        )}
      </div>
      {openItemId > 0 && (
        <ItemPanel
          itemId={openItemId}
          full={full}
          users={byId}
          initialTab={panelTab}
          onTabChange={setPanelTab}
          onClose={closeItem}
        />
      )}
      {(view?.type === 'table' || !view) && (
        <BulkBar
          boardId={boardId}
          full={full}
          selected={selected}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
