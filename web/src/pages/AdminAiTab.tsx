import { Fragment, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Search, Sparkles, TriangleAlert } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Popover } from '../components/ui/Popover';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { SettingsSection } from '../components/settings/SettingsSection';
import type { KnowledgeStatus } from '../../../shared/ai';
import {
  DEFAULT_ROUTING,
  FEATURE_LABELS,
  type AiBudget,
  type AiDailyUsage,
  type AiFeature,
  type AiModel,
  type AiSettings,
  type AiStatus,
  type AiTier,
  type AiUsageReport,
} from '../../../shared/ai';
import { useUsers } from '../hooks/useUsers';

export function AdminAiTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const status = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => api<AiStatus>('GET', '/ai/status'),
  });
  const settings = useQuery({
    queryKey: ['ai', 'settings'],
    queryFn: () => api<AiSettings>('GET', '/ai/settings'),
  });
  const models = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: async () => (await api<{ models: AiModel[] }>('GET', '/ai/models')).models,
  });
  const usage = useQuery({
    queryKey: ['ai', 'usage'],
    queryFn: () => api<AiUsageReport>('GET', '/ai/usage'),
  });
  const daily = useQuery({
    queryKey: ['ai', 'usage', 'daily'],
    queryFn: () => api<AiDailyUsage>('GET', '/ai/usage/daily'),
  });
  const budgets = useQuery({
    queryKey: ['ai', 'budgets'],
    queryFn: () => api<{ budgets: AiBudget[] }>('GET', '/ai/budgets'),
  });
  const users = useUsers();
  const knowledge = useQuery({
    queryKey: ['knowledge', 'status'],
    queryFn: () => api<KnowledgeStatus>('GET', '/knowledge/status'),
  });

  const [draft, setDraft] = useState<AiSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testReply, setTestReply] = useState('');
  const [testError, setTestError] = useState('');

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  if (settings.isLoading || !draft) {
    return (
      <div className="flex h-24 items-center justify-center text-muted">
        <Spinner size={16} />
      </div>
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api('PUT', '/ai/settings', draft);
      await qc.invalidateQueries({ queryKey: ['ai', 'settings'] });
      await qc.invalidateQueries({ queryKey: ['ai', 'status'] });
      toast.show('AI settings saved', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestReply('');
    setTestError('');
    try {
      const result = await api<{ reply: string }>('POST', '/ai/test');
      setTestReply(result.reply);
      await qc.invalidateQueries({ queryKey: ['ai', 'usage'] });
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setTesting(false);
    }
  }

  const budget = draft.monthlyBudgetUsd;
  const monthCost = usage.data?.monthCostUsd ?? 0;
  const percent = budget > 0 ? Math.min(100, (monthCost / budget) * 100) : 0;

  return (
    <div>
      <SettingsSection
        title="Connection"
        description="OpenRouter powers every AI feature in this workspace."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {status.data?.configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-chip bg-success-soft px-2 py-1 t-meta font-semibold text-success">
              <CheckCircle2 size={14} /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-chip bg-warning-soft px-2 py-1 t-meta font-semibold text-warning">
              <TriangleAlert size={14} /> Not set up
            </span>
          )}
          {!status.data?.configured && (
            <span className="t-meta text-muted">
              Add OPENROUTER_API_KEY to the server environment and restart.
            </span>
          )}
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Enable AI features
        </label>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" loading={testing} onClick={test}>
            Test connection
          </Button>
          {testReply && <span className="t-meta text-success">{testReply}</span>}
          {testError && <span className="t-meta text-danger">{testError}</span>}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Models & routing"
        description="Each feature picks its model by tier. Fast is cheapest; strong is for hard work."
        actions={
          <Button loading={saving} onClick={save}>
            Save routing
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ModelSelect
            label="Default model"
            models={(models.data ?? []).filter((model) => model.supportsTools)}
            value={draft.defaultModel}
            onChange={(id) => setDraft({ ...draft, defaultModel: id })}
          />
          <ModelSelect
            label="Fast model"
            models={models.data ?? []}
            value={draft.fastModel}
            onChange={(id) => setDraft({ ...draft, fastModel: id })}
          />
          <ModelSelect
            label="Strong model"
            models={(models.data ?? []).filter((model) => model.supportsTools)}
            value={draft.strongModel}
            onChange={(id) => setDraft({ ...draft, strongModel: id })}
          />
          <label className="block">
            <span className="t-label mb-1 block text-ink">Embedding model</span>
            <Input
              value={draft.embeddingModel}
              onChange={(event) => setDraft({ ...draft, embeddingModel: event.target.value })}
            />
          </label>
        </div>
        <div data-testid="ai-routing" className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="t-label py-1 text-muted">Feature</th>
                <th className="t-label py-1 text-muted">Tier</th>
                <th className="t-label py-1 pl-4 text-muted">Feature</th>
                <th className="t-label py-1 text-muted">Tier</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(
                { length: Math.ceil((Object.keys(DEFAULT_ROUTING) as AiFeature[]).length / 2) },
                (_, rowIndex) => {
                  const features = Object.keys(DEFAULT_ROUTING) as AiFeature[];
                  const pair = [features[rowIndex * 2], features[rowIndex * 2 + 1]].filter(
                    Boolean,
                  ) as AiFeature[];
                  return (
                    <tr key={rowIndex} className="border-b border-line last:border-b-0">
                      {pair.map((feature) => (
                        <Fragment key={feature}>
                          <td className="py-1 pr-2 text-ink">{FEATURE_LABELS[feature]}</td>
                          <td className="py-1 pr-4">
                            <Select
                              ariaLabel={`Tier for ${FEATURE_LABELS[feature]}`}
                              value={draft.routing[feature] ?? 'default'}
                              onChange={(value) =>
                                setDraft({
                                  ...draft,
                                  routing: { ...draft.routing, [feature]: value as AiTier },
                                })
                              }
                              options={[
                                { value: 'fast', label: 'Fast' },
                                { value: 'default', label: 'Default' },
                                { value: 'strong', label: 'Strong' },
                                { value: 'embed', label: 'Embed' },
                              ]}
                              size="sm"
                              className="w-[120px]"
                            />
                          </td>
                        </Fragment>
                      ))}
                      {pair.length === 1 && (
                        <>
                          <td />
                          <td />
                        </>
                      )}
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Organisation context"
        description="Shared with every AI request: what the company does, teams and terminology."
      >
        <Textarea
          aria-label="Organisation context"
          value={draft.orgContext}
          maxLength={4000}
          rows={4}
          onChange={(e) => setDraft({ ...draft, orgContext: e.target.value })}
        />
        <p className="mt-1 text-right t-meta text-muted">{draft.orgContext.length}/4000</p>
      </SettingsSection>

      <SettingsSection
        title="Controls"
        description="Budget and confirmation settings for everyone in the org."
        actions={
          <Button loading={saving} onClick={save}>
            Save changes
          </Button>
        }
      >
        <label htmlFor="ai-budget" className="t-label mb-1 block text-ink">
          Monthly budget (USD, 0 = no limit)
        </label>
        <Input
          id="ai-budget"
          type="number"
          min={0}
          max={100000}
          value={draft.monthlyBudgetUsd}
          onChange={(e) => setDraft({ ...draft, monthlyBudgetUsd: Number(e.target.value) || 0 })}
          className="mb-3 max-w-[220px]"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.requireConfirmation}
            onChange={(e) => setDraft({ ...draft, requireConfirmation: e.target.checked })}
          />
          Ask before AI changes data
        </label>
      </SettingsSection>

      <SettingsSection
        title="Budgets"
        description="Org budget, a default per-person limit and per-feature caps. 0 means no limit."
      >
        <div data-testid="ai-budgets" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="t-label mb-1 block text-ink">Default per-person limit (USD)</span>
              <Input
                type="number"
                min={0}
                value={draft.defaultUserMonthlyUsd}
                onChange={(event) =>
                  setDraft({ ...draft, defaultUserMonthlyUsd: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={draft.budgetAlerts}
                onChange={(event) => setDraft({ ...draft, budgetAlerts: event.target.checked })}
              />
              Email admins at 80% and 100%
            </label>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="t-label text-muted">Per-feature caps</h3>
              <button
                type="button"
                data-testid="ai-show-advanced"
                className="t-meta text-accent hover:underline"
                onClick={() => setShowAdvanced((value) => !value)}
              >
                {showAdvanced ? 'Hide advanced' : 'Show advanced'}
              </button>
            </div>
            {showAdvanced && (
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(DEFAULT_ROUTING) as AiFeature[]).map((feature) => {
                  const cap = budgets.data?.budgets.find(
                    (budget) => budget.scope === 'feature' && budget.key === feature,
                  );
                  return (
                    <label
                      key={feature}
                      data-testid="ai-budget-row"
                      className="flex items-center gap-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {FEATURE_LABELS[feature]}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={cap?.monthlyUsd ?? ''}
                        aria-label={`Cap for ${FEATURE_LABELS[feature]}`}
                        className="w-28"
                        onBlur={async (event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          if (value > 0) {
                            await api('PUT', `/ai/budgets/feature/${feature}`, {
                              monthlyUsd: value,
                            });
                          } else {
                            await api('DELETE', `/ai/budgets/feature/${feature}`);
                          }
                          await qc.invalidateQueries({ queryKey: ['ai', 'budgets'] });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <h3 className="t-label mb-1 text-muted">Per-person overrides</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {(users.data?.users ?? []).map((user) => {
                const override = budgets.data?.budgets.find(
                  (budget) => budget.scope === 'user' && budget.key === String(user.id),
                );
                return (
                  <label key={user.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{user.name}</span>
                    <Input
                      type="number"
                      min={0}
                      defaultValue={override?.monthlyUsd ?? ''}
                      aria-label={`Limit for ${user.name}`}
                      className="w-28"
                      onBlur={async (event) => {
                        const value = Number(event.target.value);
                        if (!Number.isFinite(value)) return;
                        if (value > 0) {
                          await api('PUT', `/ai/budgets/user/${user.id}`, { monthlyUsd: value });
                        } else {
                          await api('DELETE', `/ai/budgets/user/${user.id}`);
                        }
                        await qc.invalidateQueries({ queryKey: ['ai', 'budgets'] });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <Button loading={saving} onClick={save}>
            Save budget settings
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Organisation memory"
        description="Search items, updates and docs by keyword, and by meaning when memory is on."
        actions={
          <Button loading={saving} onClick={save}>
            Save memory setting
          </Button>
        }
      >
        <div data-testid="ai-memory" className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.memoryEnabled}
              onChange={(event) => setDraft({ ...draft, memoryEnabled: event.target.checked })}
              className="mt-0.5"
            />
            <span>
              Organisation memory
              <span className="mt-0.5 block text-muted">
                When on, Tuesday sends the text of items, updates and docs to {draft.embeddingModel}{' '}
                through OpenRouter to build search. Turn off to stop sending; existing data stays
                local.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3 t-meta text-muted">
            <span>{knowledge.data?.chunks ?? 0} chunks</span>
            <span>{knowledge.data?.embedded ?? 0} embedded</span>
            <span>{knowledge.data?.pending ?? 0} pending</span>
            <Button
              size="sm"
              variant="secondary"
              data-testid="ai-memory-rebuild"
              onClick={async () => {
                await api('POST', '/knowledge/rebuild');
                toast.show('Memory rebuild queued', 'success');
                await qc.invalidateQueries({ queryKey: ['knowledge', 'status'] });
              }}
            >
              Rebuild index
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Usage" description="Spend and calls across all AI features.">
        <div data-testid="ai-usage">
          <p className="t-meta mb-2 text-ink">
            This month: ${monthCost.toFixed(2)} of{' '}
            {budget > 0 ? `$${budget.toFixed(2)}` : 'no limit'}
            {usage.data?.blockedThisMonth ? ` · ${usage.data.blockedThisMonth} blocked` : ''}
          </p>
          <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-sunken">
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <div data-testid="ai-usage-chart" className="mb-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily.data?.days ?? []}>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => money(Number(value ?? 0))}
                  labelFormatter={(value) => String(value)}
                />
                <Line type="monotone" dataKey="costUsd" stroke="var(--accent)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="t-label mb-1 text-muted">By person</h3>
              {usage.data?.byUser.map((row) => (
                <div
                  key={`${row.userId}-${row.name}`}
                  className="flex justify-between gap-2 text-sm"
                >
                  <span className="truncate">{row.name}</span>
                  <span className="t-meta tabular-nums text-muted">
                    {money(row.costUsd)}
                    {row.limitUsd ? ` / ${money(row.limitUsd)}` : ''} · {row.calls}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="t-label mb-1 text-muted">By feature</h3>
              {usage.data?.byFeature.map((row) => (
                <div key={row.feature} className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{row.label}</span>
                  <span className="t-meta tabular-nums text-muted">
                    {money(row.costUsd)}
                    {row.capUsd ? ` / ${money(row.capUsd)}` : ''} · {row.calls}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="t-label mb-1 text-muted">By model</h3>
              {usage.data?.byModel.map((row) => (
                <div key={row.model} className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{row.model}</span>
                  <span className="t-meta tabular-nums text-muted">
                    {money(row.costUsd)} · {row.calls}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <a
            href="/api/ai/usage.csv"
            className="mt-3 inline-flex h-8 items-center rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-sunken"
          >
            Export CSV
          </a>
        </div>
      </SettingsSection>
    </div>
  );
}

function money(value: number): string {
  return value > 0 && value < 0.01 ? '< $0.01' : `$${value.toFixed(2)}`;
}

function ModelSelect({
  label,
  models,
  value,
  onChange,
}: {
  label: string;
  models: AiModel[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = models.find((model) => model.id === value);
  const filtered = models.filter(
    (model) =>
      model.name.toLowerCase().includes(search.toLowerCase()) ||
      model.id.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div>
      <span className="t-label mb-1 block text-ink">{label}</span>
      <Popover
        className="w-[420px] max-w-[80vw]"
        trigger={
          <button className="flex h-9 w-full items-center justify-between gap-2 rounded-control border border-line bg-surface px-2.5 text-left text-sm">
            <span className="min-w-0 truncate">
              {selected ? `${selected.name} · ${selected.id}` : value || 'Choose a model'}
            </span>
            <ChevronDown size={14} className="shrink-0 text-muted" />
          </button>
        }
      >
        <div className="relative mb-1">
          <Search size={13} className="absolute left-2 top-2 text-muted" />
          <input
            aria-label="Search models"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models"
            className="h-8 w-full rounded-control border border-line pl-7 pr-2 text-sm outline-none"
          />
        </div>
        <div className="max-h-[300px] overflow-auto">
          {filtered.map((model) => (
            <button
              key={model.id}
              onClick={() => onChange(model.id)}
              className={cn(
                'flex w-full flex-col rounded-control px-2 py-1.5 text-left hover:bg-sunken',
                model.id === value && 'bg-accent-soft',
              )}
            >
              <span className="flex items-center gap-1 text-sm text-ink">
                {model.name}
                {model.supportsTools && <Sparkles size={11} className="text-ai" />}
              </span>
              <span className="t-meta text-muted">
                {model.id} · ${model.promptPricePerM.toFixed(2)} / $
                {model.completionPricePerM.toFixed(2)} per 1M
              </span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-2 py-2 t-meta text-muted">No models</p>}
        </div>
      </Popover>
    </div>
  );
}
