import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import type { Widget, WidgetData } from '../../../shared/dashboards';
import { api } from '../lib/api';
import { useAiStatus } from '../hooks/useAiStatus';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Textarea } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { NumberWidget } from './widgets/NumberWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { BatteryWidget } from './widgets/BatteryWidget';
import { WorkloadWidget } from './widgets/WorkloadWidget';
import { ItemsWidget } from './widgets/ItemsWidget';
import { NoteWidget } from './widgets/NoteWidget';

interface Draft {
  name: string;
  boardIds: number[];
  widgets: Widget[];
}

function PreviewWidget({ widget, data }: { widget: Widget; data?: WidgetData }) {
  return (
    <div
      className="flex min-h-[120px] flex-col rounded-[12px] border border-line bg-surface p-3"
      style={{ gridColumn: `span ${widget.w}`, gridRow: `span ${widget.h}` }}
    >
      <h3 className="mb-2 t-label text-ink">{widget.title}</h3>
      <div className="min-h-0 flex-1 overflow-hidden">
        {!data && <Spinner size={14} />}
        {data?.kind === 'number' && <NumberWidget data={data} />}
        {data?.kind === 'series' && <ChartWidget widget={widget} data={data} />}
        {data?.kind === 'battery' && <BatteryWidget data={data} />}
        {data?.kind === 'workload' && <WorkloadWidget data={data} />}
        {data?.kind === 'items' && <ItemsWidget data={data} />}
        {data?.kind === 'note' && <NoteWidget data={data} />}
        {data?.kind === 'ai_insight' && <p className="t-meta text-muted">{data.text}</p>}
        {data?.kind === 'risk' && (
          <p className="t-meta text-muted">
            {data.report.signals.length} risk{data.report.signals.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </div>
  );
}

export function DescribeDashboardDialog({
  open,
  onOpenChange,
  workspaceId,
  defaultBoardIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  defaultBoardIds?: number[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const ai = useAiStatus();
  const workspaces = useWorkspaces();
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState<number[]>(defaultBoardIds);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const wasOpen = useRef(false);
  const boards = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards.filter((board) => workspace.id === workspaceId),
  );
  const preview = useQuery({
    queryKey: ['dashboard-preview', draft?.boardIds, draft?.widgets],
    queryFn: () =>
      api<{ data: WidgetData[] }>('POST', '/dashboards/preview', {
        boardIds: draft!.boardIds,
        widgets: draft!.widgets,
      }),
    enabled: Boolean(draft),
  });

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelected(
        defaultBoardIds.length ? defaultBoardIds : boards.slice(0, 3).map((board) => board.id),
      );
    }
    wasOpen.current = open;
  }, [open, boards, defaultBoardIds]);

  async function generate() {
    setLoading(true);
    try {
      const result = await api<{ draft: Draft }>('POST', '/ai/dashboard-draft', {
        workspaceId,
        prompt,
        boardIds: selected,
      });
      setDraft(result.draft);
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function create(blank = false) {
    setCreating(true);
    try {
      const created = await api<{ dashboard: { id: number } }>('POST', '/dashboards', {
        workspaceId,
        name: draft?.name ?? 'New dashboard',
        boardIds: draft?.boardIds?.length
          ? draft.boardIds
          : selected.length
            ? selected
            : boards.map((board) => board.id).slice(0, 1),
      });
      if (draft && !blank) {
        await api('PATCH', `/dashboards/${created.dashboard.id}`, { widgets: draft.widgets });
      }
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      onOpenChange(false);
      navigate(`/dashboards/${created.dashboard.id}`);
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Describe a dashboard"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => void create(true)}>
            Blank dashboard
          </Button>
          <Button
            data-testid="describe-dashboard-create"
            loading={creating}
            disabled={!draft}
            onClick={() => void create()}
          >
            Create dashboard
          </Button>
        </>
      }
    >
      <div
        data-testid="describe-dashboard"
        className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]"
      >
        <div className="space-y-2">
          <Textarea
            aria-label="Describe the dashboard"
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. a launch overview with status, workload and risks"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-control border border-line p-2">
            {boards.map((board) => (
              <label key={board.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={selected.includes(board.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(board.id)
                        ? current.filter((id) => id !== board.id)
                        : [...current, board.id],
                    )
                  }
                />
                {board.name}
              </label>
            ))}
          </div>
          {!ai.data?.usable && (
            <p className="t-meta text-muted">
              AI isn't set up yet. You can still create a blank dashboard.
            </p>
          )}
          <Button
            icon={<Sparkles size={14} />}
            loading={loading}
            disabled={!ai.data?.usable || !prompt.trim()}
            onClick={() => void generate()}
          >
            Generate
          </Button>
        </div>
        <div className="grid min-h-[260px] auto-rows-[minmax(120px,auto)] grid-cols-12 gap-2 rounded-control bg-surface-2 p-2">
          {(draft?.widgets ?? []).map((widget, index) => (
            <PreviewWidget key={widget.id} widget={widget} data={preview.data?.data[index]} />
          ))}
          {!draft && (
            <p className="col-span-12 self-center text-center t-meta text-muted">
              The preview appears here.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
