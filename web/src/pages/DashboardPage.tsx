import { rememberRecent } from '../lib/recent';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, MoreHorizontal, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { WidgetCard } from '../dashboards/WidgetCard';
import { WidgetEditor } from '../dashboards/WidgetEditor';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import { Skeleton } from '../components/ui/Skeleton';
import { Menu, MenuItem } from '../components/ui/Menu';
import { undoStack } from '../lib/undo';
import { useToast } from '../components/ui/Toast';
import type { BoardFull } from '../../../shared/types';
import type { Dashboard, Widget } from '../../../shared/dashboards';
import { FavoriteToggle } from '../components/FavoriteToggle';

export function DashboardPage() {
  const { id } = useParams();
  const dashboardId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const dashboard = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => api<{ dashboard: Dashboard }>('GET', `/dashboards/${dashboardId}`),
  });
  const boards = useQueries({
    queries: (dashboard.data?.dashboard.boardIds ?? []).map((boardId) => ({
      queryKey: ['board', boardId],
      queryFn: () => api<BoardFull>('GET', `/boards/${boardId}`),
      staleTime: 30_000,
    })),
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Widget | null>(null);

  const initialData = dashboard.data?.dashboard;
  useEffect(() => {
    if (initialData)
      rememberRecent({ kind: 'dashboard', id: initialData.id, name: initialData.name });
  }, [initialData?.id]);

  if (dashboard.isError) {
    return (
      <div className="p-7">
        <QueryError onRetry={() => void dashboard.refetch()} />
      </div>
    );
  }

  if (dashboard.isLoading || !initialData) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-6 grid grid-cols-12 gap-4">
          {[0, 1, 2].map((block) => (
            <Skeleton key={block} className="col-span-4 h-32" />
          ))}
        </div>
      </div>
    );
  }
  const data = initialData;
  const boardList = data.boardIds.map((boardId, index) => ({
    id: boardId,
    name: boards[index]?.data?.board.name ?? `Board ${boardId}`,
  }));
  const columnTitles = [
    ...new Set(
      boards.flatMap((query) => (query.data?.columns ?? []).map((column) => column.title)),
    ),
  ];

  async function save(widgets: Widget[]) {
    try {
      await api('PATCH', `/dashboards/${dashboardId}`, { widgets });
      await qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      await qc.invalidateQueries({ queryKey: ['widget', dashboardId] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  function replace(widget: Widget) {
    void save(data.widgets.map((entry) => (entry.id === widget.id ? widget : entry)));
  }

  const widths: Widget['w'][] = [3, 4, 6, 8, 12];

  return (
    <div className="h-full overflow-y-auto bg-canvas px-7 py-7 max-md:px-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <LayoutDashboard size={20} className="text-accent" />
            {data.name}
          </span>
        }
        actions={
          <>
            <FavoriteToggle kind="dashboard" id={data.id} name={data.name} />
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              Add widget
            </Button>
            <Menu
              trigger={
                <button
                  aria-label="Dashboard menu"
                  className="rounded-control p-1.5 text-muted hover:bg-sunken"
                >
                  <MoreHorizontal size={16} />
                </button>
              }
            >
              <MenuItem
                danger
                onSelect={async () => {
                  if (!window.confirm(`Delete "${data.name}"?`)) return;
                  await api('DELETE', `/dashboards/${dashboardId}`);
                  undoStack.push({
                    label: 'Dashboard archived',
                    undo: async () => {
                      await api('POST', '/trash/restore', { kind: 'dashboard', id: dashboardId });
                      await qc.invalidateQueries({ queryKey: ['workspaces'] });
                      navigate(`/dashboards/${dashboardId}`);
                    },
                  });
                  await qc.invalidateQueries({ queryKey: ['workspaces'] });
                  navigate('/');
                }}
              >
                Delete dashboard
              </MenuItem>
            </Menu>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap gap-2">
          {boardList.map((board) => (
            <span
              key={board.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 t-meta text-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {board.name}
            </span>
          ))}
        </div>
      </PageHeader>

      <div
        className="grid grid-cols-12 gap-4"
        style={{ gridAutoRows: '120px', gridAutoFlow: 'dense' }}
      >
        {data.widgets.map((widget, index) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            dashboardId={dashboardId}
            onEdit={() => {
              setEditing(widget);
              setEditorOpen(true);
            }}
            onDuplicate={() =>
              void save([
                ...data.widgets.slice(0, index + 1),
                { ...widget, id: crypto.randomUUID().slice(0, 8), title: `${widget.title} (copy)` },
                ...data.widgets.slice(index + 1),
              ])
            }
            onResize={(dimension, direction) => {
              if (dimension === 'w') {
                const current = widths.indexOf(widget.w);
                const next = widths[Math.min(widths.length - 1, Math.max(0, current + direction))];
                replace({ ...widget, w: next });
              } else {
                const next = Math.min(4, Math.max(1, widget.h + direction)) as Widget['h'];
                replace({ ...widget, h: next });
              }
            }}
            onMove={(direction) => {
              const target = index + direction;
              if (target < 0 || target >= data.widgets.length) return;
              const next = [...data.widgets];
              [next[index], next[target]] = [next[target], next[index]];
              void save(next);
            }}
            onDelete={() => void save(data.widgets.filter((entry) => entry.id !== widget.id))}
          />
        ))}
      </div>

      {data.widgets.length === 0 && (
        <EmptyState
          icon={<LayoutDashboard size={20} />}
          title="No widgets yet"
          description="Add a widget to see numbers, charts and notes from your boards."
          action={
            <Button
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              Add widget
            </Button>
          }
        />
      )}

      <WidgetEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
        boards={boardList}
        columnTitles={columnTitles}
        onSave={(widget) => {
          if (editing) replace(widget);
          else void save([...data.widgets, widget]);
        }}
      />
    </div>
  );
}
