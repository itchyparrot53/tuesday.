import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Copy,
  History,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import type { Automation, AutomationInput } from '../../../../shared/automations';
import { describeAutomation } from '../../../../shared/automations';
import type { BoardFull, User } from '../../../../shared/types';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { relative } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/Menu';
import { Skeleton } from '../../components/ui/Skeleton';
import { UnderlineTabs } from '../../components/ui/Tabs';
import { AutomationSentence } from './parts';
import { RecipeCard, TemplateGallery } from './TemplateGallery';
import { AutomationActivity } from './AutomationActivity';
import { BoardSpecificTemplates } from './BoardSpecificTemplates';
import { buildRecipes } from './recipeCatalog';

type Tab = 'automations' | 'templates' | 'activity';
type Filter = 'all' | 'active' | 'paused';

function AutomationCard({
  automation,
  ctx,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
  onViewRuns,
}: {
  automation: Automation;
  ctx: Parameters<typeof AutomationSentence>[0]['ctx'];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onViewRuns: () => void;
}) {
  return (
    <div
      data-testid="automation-row"
      className={cn(
        'group rounded-pop border bg-surface p-3 transition-colors',
        automation.enabled ? 'border-line hover:border-accent/40' : 'border-line/80 bg-surface-2',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            automation.enabled ? 'bg-accent-soft text-accent-soft-ink' : 'bg-sunken text-muted',
          )}
        >
          <Zap size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <AutomationSentence automation={automation} ctx={ctx} />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 t-meta text-muted">
            <span className="inline-flex items-center gap-1">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  automation.enabled ? 'bg-success' : 'bg-faint',
                )}
              />
              {automation.enabled ? 'Active' : 'Paused'}
            </span>
            <span>·</span>
            <span>
              {automation.runCount} {automation.runCount === 1 ? 'run' : 'runs'}
            </span>
            {automation.lastRunAt && (
              <>
                <span>·</span>
                <span>last {relative(automation.lastRunAt)}</span>
              </>
            )}
          </div>
        </div>
        <button
          data-testid="automation-toggle"
          aria-label={automation.enabled ? 'Disable automation' : 'Enable automation'}
          onClick={onToggle}
          className={cn(
            'mt-1 h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors',
            automation.enabled ? 'bg-accent' : 'bg-line',
          )}
        >
          <span
            className={cn(
              'block h-3 w-3 rounded-full bg-surface transition-transform',
              automation.enabled && 'translate-x-3',
            )}
          />
        </button>
        <Menu
          trigger={
            <button
              aria-label="Automation actions"
              className="mt-0.5 rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
            >
              <MoreHorizontal size={15} />
            </button>
          }
        >
          <MenuItem onSelect={onEdit}>
            <span className="inline-flex items-center gap-2">
              <Zap size={13} /> Edit automation
            </span>
          </MenuItem>
          <MenuItem onSelect={onDuplicate}>
            <span className="inline-flex items-center gap-2">
              <Copy size={13} /> Duplicate
            </span>
          </MenuItem>
          <MenuItem onSelect={onViewRuns}>
            <span className="inline-flex items-center gap-2">
              <History size={13} /> View runs
            </span>
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={onDelete}>
            <span className="inline-flex items-center gap-2">
              <Trash2 size={13} /> Delete
            </span>
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="t-meta text-muted">{label}</p>
      <p className="t-section text-ink">{value}</p>
      {hint && <p className="t-meta text-muted">{hint}</p>}
    </div>
  );
}

export function AutomationCenter({
  full,
  users,
  boards,
  automations,
  loading,
  onNew,
  onEdit,
  onUseRecipe,
  onDuplicate,
  onDelete,
  onToggle,
  onCreate,
  onRefresh,
  onClose,
}: {
  full: BoardFull;
  users: User[];
  boards: { id: number; name: string }[];
  automations: Automation[];
  loading: boolean;
  onNew: () => void;
  onEdit: (automation: Automation) => void;
  onUseRecipe: (input: AutomationInput) => void;
  onDuplicate: (automation: Automation) => void;
  onDelete: (automation: Automation) => void;
  onToggle: (automation: Automation) => void;
  onCreate: (input: AutomationInput) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('automations');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [runTarget, setRunTarget] = useState<number | null>(null);
  const [describe, setDescribe] = useState('');
  const [preview, setPreview] = useState<{ input: AutomationInput; description: string } | null>(
    null,
  );
  const [building, setBuilding] = useState(false);
  const [buildingError, setBuildingError] = useState('');
  const [savingPreview, setSavingPreview] = useState(false);

  const ctx = useMemo(
    () => ({ columns: full.columns, groups: full.groups, users, boards }),
    [boards, full.columns, full.groups, users],
  );
  const recipes = useMemo(() => buildRecipes(full, users), [full, users]);
  const starterRecipes = recipes.slice(0, 3);

  const activeCount = automations.filter((automation) => automation.enabled).length;
  const totalRuns = automations.reduce((sum, automation) => sum + automation.runCount, 0);
  const lastRun = automations
    .map((automation) => automation.lastRunAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const needle = query.trim().toLowerCase();
  const visible = automations.filter((automation) => {
    if (filter === 'active' && !automation.enabled) return false;
    if (filter === 'paused' && automation.enabled) return false;
    if (!needle) return true;
    return (
      automation.name.toLowerCase().includes(needle) ||
      describeAutomation(automation, ctx).toLowerCase().includes(needle)
    );
  });

  async function build() {
    setBuilding(true);
    setBuildingError('');
    try {
      const result = await api<{ input: AutomationInput; description: string }>(
        'POST',
        '/ai/generate-automation',
        { boardId: full.board.id, prompt: describe },
      );
      setPreview({ input: result.input, description: result.description });
    } catch (error) {
      setBuildingError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBuilding(false);
    }
  }

  async function savePreview() {
    if (!preview) return;
    setSavingPreview(true);
    setBuildingError('');
    try {
      await onCreate({ ...preview.input, enabled: true });
      setPreview(null);
      setDescribe('');
      onRefresh();
    } catch (error) {
      setBuildingError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setSavingPreview(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-line bg-accent-soft/45 px-4 pb-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 t-meta font-semibold text-accent-soft-ink">
              <Zap size={12} /> Automation center
            </p>
            <h2 className="mt-1 t-title text-ink">Put busywork on autopilot</h2>
            <p className="mt-1 max-w-[58ch] text-sm leading-6 text-muted">
              Build rules that react to the board, on a schedule, or when a date arrives. Every run
              is logged so you can see exactly what happened.
            </p>
          </div>
          <Button icon={<Plus size={14} />} onClick={onNew}>
            New automation
          </Button>
        </div>
        <div className="mt-4 grid max-w-[520px] grid-cols-3 gap-3">
          <Stat label="Active" value={activeCount} hint={`${automations.length} total`} />
          <Stat label="Runs" value={totalRuns} hint="all time" />
          <Stat
            label="Last activity"
            value={lastRun ? relative(lastRun) : '—'}
            hint={lastRun ? 'most recent run' : 'not run yet'}
          />
        </div>
      </div>

      <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
        <UnderlineTabs
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            { id: 'automations', label: 'Automations', count: automations.length },
            { id: 'templates', label: 'Templates', count: recipes.length },
            { id: 'activity', label: 'Activity' },
          ]}
        />
        {tab === 'automations' && (
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="relative min-w-[180px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <Input
                aria-label="Search automations"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search automations"
                className="h-8 pl-8"
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['all', 'All'],
                  ['active', 'Active'],
                  ['paused', 'Paused'],
                ] as [Filter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={cn(
                    'rounded-chip border px-2.5 py-1 t-meta font-semibold transition-colors',
                    filter === id
                      ? 'border-accent bg-accent-soft text-accent-soft-ink'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 sm:px-6">
        {tab === 'automations' && (
          <div className="space-y-4">
            <div className="rounded-pop border border-line bg-surface p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 t-meta font-semibold text-ai">
                  <Sparkles size={13} /> Describe it
                </span>
                <div className="min-w-[180px] flex-1">
                  <Input
                    data-testid="automation-describe-input"
                    aria-label="Describe an automation"
                    value={describe}
                    onChange={(event) => setDescribe(event.target.value)}
                    placeholder="Notify the assignees when status changes to Done"
                    className="h-8"
                  />
                </div>
                <Button size="sm" loading={building} disabled={!describe.trim()} onClick={build}>
                  Build
                </Button>
              </div>
              {preview && (
                <div className="mt-2 rounded-control border border-line bg-surface-2 p-2.5">
                  <p className="text-sm text-ink">{preview.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" loading={savingPreview} onClick={savePreview}>
                      Save automation
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onUseRecipe(preview.input)}
                    >
                      Open in editor
                    </Button>
                  </div>
                </div>
              )}
              {buildingError && (
                <p role="alert" className="mt-1 text-xs text-danger-text">
                  {buildingError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <h3 className="t-label text-ink">Your automations</h3>
              <span className="t-meta text-muted">
                {visible.length} of {automations.length}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-sheet border border-line bg-surface px-5 py-9 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
                  <Zap size={18} />
                </span>
                <p className="mt-2 t-label text-ink">
                  {automations.length ? 'No automations match' : 'No automations yet'}
                </p>
                <p className="mx-auto mt-1 max-w-[44ch] text-sm text-muted">
                  {automations.length
                    ? 'Try a different search or status filter.'
                    : 'Start with a template below, describe what you want in plain English, or build one by hand.'}
                </p>
                {automations.length > 0 && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((automation) => (
                  <AutomationCard
                    key={automation.id}
                    automation={automation}
                    ctx={ctx}
                    onEdit={() => onEdit(automation)}
                    onDuplicate={() => onDuplicate(automation)}
                    onDelete={() => onDelete(automation)}
                    onToggle={() => onToggle(automation)}
                    onViewRuns={() => {
                      setRunTarget(automation.id);
                      setTab('activity');
                    }}
                  />
                ))}
              </div>
            )}

            <div className="pt-1">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="t-label text-ink">Starter recipes</h3>
                <button
                  onClick={() => setTab('templates')}
                  className="inline-flex items-center gap-1 t-meta font-semibold text-accent hover:text-accent-hover"
                >
                  Browse all templates <ArrowRight size={11} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {starterRecipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    compact
                    onUse={() => onUseRecipe(recipe.input)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'templates' && (
          <div className="space-y-5">
            <BoardSpecificTemplates full={full} users={users} boards={boards} onUse={onUseRecipe} />
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="t-label text-ink">All templates</h3>
                <span className="t-meta text-muted">{recipes.length} curated</span>
              </div>
              <TemplateGallery recipes={recipes} onUse={(recipe) => onUseRecipe(recipe.input)} />
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <AutomationActivity
            key={runTarget ?? 'all'}
            automations={automations}
            initialAutomationId={runTarget}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
