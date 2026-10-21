import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import type {
  AutomationDescriptionContext,
  BoardAutomationTemplate,
  BoardAutomationTemplateSet,
} from '../../../../shared/automations';
import type { BoardFull, User } from '../../../../shared/types';
import { api } from '../../lib/api';
import { relative } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { AutomationSentence } from './parts';
import { CategoryBadge } from './TemplateGallery';

function GeneratedCard({
  template,
  ctx,
  onUse,
}: {
  template: BoardAutomationTemplate;
  ctx: AutomationDescriptionContext;
  onUse: () => void;
}) {
  return (
    <button
      data-testid="generated-template-card"
      aria-label={template.title}
      onClick={onUse}
      className="group flex h-full w-full flex-col rounded-sheet border border-accent/25 bg-surface p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-pop"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <CategoryBadge category={template.category} />
        <span className="inline-flex items-center gap-1 t-meta font-semibold text-ai">
          <Sparkles size={11} />
          Board-specific
        </span>
      </div>
      <span className="mt-2.5 flex-1">
        <AutomationSentence automation={template.input} ctx={ctx} />
      </span>
      <span className="mt-2 block text-xs leading-5 text-muted">{template.rationale}</span>
      <span className="mt-2 inline-flex items-center gap-1 t-meta font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        Use template <ArrowRight size={11} />
      </span>
    </button>
  );
}

function GeneratingState({ boardName }: { boardName: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-pop border border-accent/25 bg-accent-soft/45 px-3 py-2.5">
        <Sparkles size={14} className="shrink-0 text-ai" />
        <p className="t-meta text-ink">
          Reading <span className="font-semibold">{boardName}</span> and drafting candidates from
          its columns, groups and items…
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[132px] w-full" />
        ))}
      </div>
    </div>
  );
}

export function BoardSpecificTemplates({
  full,
  users,
  boards,
  onUse,
}: {
  full: BoardFull;
  users: User[];
  boards: { id: number; name: string }[];
  onUse: (input: BoardAutomationTemplate['input']) => void;
}) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const queryKey = ['board-automation-templates', full.board.id] as const;
  const canManage = full.board.myAccess === 'manage';

  const templates = useQuery({
    queryKey,
    queryFn: async () =>
      api<BoardAutomationTemplateSet>('GET', `/boards/${full.board.id}/automation-templates`),
  });

  const ctx = useMemo(
    () => ({ columns: full.columns, groups: full.groups, users, boards }),
    [boards, full.columns, full.groups, users],
  );

  const items = templates.data?.templates ?? [];
  const generatedAt = templates.data?.generatedAt ?? null;
  const generatedLabel = generatedAt
    ? Date.now() - new Date(generatedAt).getTime() < 60_000
      ? 'just now'
      : relative(generatedAt)
    : null;

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const result = await api<BoardAutomationTemplateSet>(
        'POST',
        `/boards/${full.board.id}/automation-templates`,
      );
      qc.setQueryData(queryKey, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate templates');
    } finally {
      setGenerating(false);
    }
  }

  const generateLabel = items.length ? 'Regenerate' : 'Generate 10 templates';

  return (
    <section className="rounded-sheet border border-accent/25 bg-accent-soft/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 t-meta font-semibold text-ai">
            <Sparkles size={13} /> Made for {full.board.name}
          </p>
          <h3 className="mt-1 t-label text-ink">Board-specific templates</h3>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">
            Read this board&apos;s columns, groups, item names and recent activity, then draft ten
            automations for the work it actually holds. Review before saving.
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            {generatedAt && items.length > 0 && (
              <span className="t-meta text-muted">Generated {generatedLabel}</span>
            )}
            <Button
              data-testid="generate-board-templates"
              size="sm"
              variant={items.length ? 'secondary' : 'primary'}
              loading={generating}
              icon={items.length ? <RefreshCw size={13} /> : <Sparkles size={13} />}
              onClick={generate}
            >
              {generateLabel}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-pop border border-danger/30 bg-danger-soft/50 p-3">
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
          {canManage && (
            <Button className="mt-2" size="sm" variant="secondary" onClick={generate}>
              Try again
            </Button>
          )}
        </div>
      )}

      <div className="mt-3">
        {generating ? (
          <GeneratingState boardName={full.board.name} />
        ) : templates.isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-[132px] w-full" />
            <Skeleton className="h-[132px] w-full" />
          </div>
        ) : items.length ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="t-meta font-semibold text-accent-soft-ink">
                {items.length} board-specific {items.length === 1 ? 'template' : 'templates'}
              </p>
              <p className="hidden t-meta text-muted sm:block">Click one to review and save it</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((template, index) => (
                <GeneratedCard
                  key={`${index}-${template.title}`}
                  template={template}
                  ctx={ctx}
                  onUse={() => onUse(template.input)}
                />
              ))}
            </div>
          </div>
        ) : error ? null : canManage ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-pop border border-dashed border-line-strong/40 bg-surface/60 px-3 py-3">
            <p className="text-sm text-muted">
              No board-specific templates yet. Generation uses the AI budget and takes a few
              seconds.
            </p>
            <span className="t-meta text-muted">Uses the Automations AI budget</span>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Ask a board admin to generate board-specific templates for this board.
          </p>
        )}
      </div>
    </section>
  );
}
