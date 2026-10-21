import type { Db } from '../db/db';
import type { Config } from '../config';
import {
  DEFAULT_ROUTING,
  FEATURE_LABELS,
  type AiFeature,
  type AiModel,
  type AiSettings,
  type AiStatus,
  type AiTier,
  type AiUsageReport,
} from '../../shared/ai';
import { AppError } from '../lib/errors';
import { getSetting, setSetting } from '../services/settings';
import { assertBudget, checkAlerts } from './budgets';
import { metrics } from '../services/metrics';
import {
  OpenRouterClient,
  OpenRouterError,
  type ChatRequest,
  type ChatResult,
  type StreamChunk,
} from './openrouter';

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export class AiGateway {
  private modelCache: { at: number; models: AiModel[] } | null = null;

  constructor(
    private db: Db,
    private config: Config,
    public client: OpenRouterClient,
  ) {}

  settings(): AiSettings {
    const defaults: AiSettings = {
      enabled: true,
      defaultModel: this.config.defaultModel,
      fastModel: this.config.fastModel,
      orgContext: '',
      monthlyBudgetUsd: 0,
      requireConfirmation: true,
      strongModel: this.config.defaultModel,
      embeddingModel: 'openai/text-embedding-3-small',
      memoryEnabled: false,
      defaultUserMonthlyUsd: 0,
      routing: { ...DEFAULT_ROUTING },
      budgetAlerts: true,
    };
    const stored = getSetting<Partial<AiSettings>>(this.db, 'ai', {});
    return {
      ...defaults,
      ...stored,
      routing: { ...DEFAULT_ROUTING, ...(stored.routing ?? {}) },
    };
  }

  modelFor(feature: AiFeature): { model: string; tier: AiTier } {
    const settings = this.settings();
    const tier = settings.routing[feature] ?? DEFAULT_ROUTING[feature] ?? 'default';
    const model =
      tier === 'fast'
        ? settings.fastModel
        : tier === 'strong'
          ? settings.strongModel
          : tier === 'embed'
            ? settings.embeddingModel
            : settings.defaultModel;
    return { model, tier };
  }

  saveSettings(settings: AiSettings): AiSettings {
    setSetting(this.db, 'ai', settings);
    return this.settings();
  }

  status(): AiStatus {
    const settings = this.settings();
    return {
      enabled: settings.enabled,
      configured: this.client.configured,
      usable: settings.enabled && this.client.configured,
      defaultModel: settings.defaultModel,
      fastModel: settings.fastModel,
      requireConfirmation: settings.requireConfirmation,
    };
  }

  assertUsable(userId: number | null = null, feature: AiFeature | null = null): void {
    const settings = this.settings();
    if (!settings.enabled || !this.client.configured) {
      throw new AppError(503, 'ai_unavailable', 'AI is not configured');
    }
    if (feature) {
      try {
        assertBudget(this.db, settings, userId, feature);
      } catch (error) {
        if (error instanceof AppError) {
          const route = this.modelFor(feature);
          this.record(userId, feature, route.model, null, route.tier, 'blocked');
        }
        throw error;
      }
    }
  }

  monthCostUsd(): number {
    const row = this.db
      .prepare('SELECT sum(cost_usd) AS cost FROM ai_usage WHERE created_at >= ?')
      .get(monthStart()) as { cost: number | null };
    return row.cost ?? 0;
  }

  record(
    userId: number | null,
    feature: AiFeature,
    model: string,
    usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null,
    tier: AiTier = this.modelFor(feature).tier,
    status: 'ok' | 'blocked' | 'error' = 'ok',
  ): void {
    this.db
      .prepare(
        `INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, cost_usd, created_at, tier, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        feature,
        model,
        usage?.prompt_tokens ?? 0,
        usage?.completion_tokens ?? 0,
        usage?.cost ?? 0,
        new Date().toISOString(),
        tier,
        status,
      );
    metrics.ai(feature, status);
  }

  async chat(userId: number | null, feature: AiFeature, req: ChatRequest): Promise<ChatResult> {
    this.assertUsable(userId, feature);
    const route = this.modelFor(feature);
    const settings = this.settings();
    try {
      const result = await this.client.chat({ ...req, model: req.model || route.model });
      this.record(userId, feature, result.model, result.usage, route.tier);
      checkAlerts(this.db, settings, feature, userId);
      return result;
    } catch (err) {
      if (err instanceof OpenRouterError) {
        throw new AppError(502, 'ai_upstream_error', err.message);
      }
      throw err;
    }
  }

  async *stream(
    userId: number | null,
    feature: AiFeature,
    req: ChatRequest,
  ): AsyncGenerator<StreamChunk> {
    this.assertUsable(userId, feature);
    const route = this.modelFor(feature);
    const settings = this.settings();
    try {
      for await (const chunk of this.client.stream({ ...req, model: req.model || route.model })) {
        if (chunk.type === 'final') {
          this.record(userId, feature, chunk.result.model, chunk.result.usage, route.tier);
          checkAlerts(this.db, settings, feature, userId);
        }
        yield chunk;
      }
    } catch (err) {
      if (err instanceof OpenRouterError) {
        throw new AppError(502, 'ai_upstream_error', err.message);
      }
      throw err;
    }
  }

  usageReport(): AiUsageReport {
    const settings = this.settings();
    const monthCost = this.monthCostUsd();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const last30 = this.db
      .prepare(
        'SELECT coalesce(sum(cost_usd), 0) AS cost, count(*) AS calls FROM ai_usage WHERE created_at >= ?',
      )
      .get(since) as { cost: number; calls: number };
    const byUserRows = this.db
      .prepare(
        `SELECT coalesce(u.id, 0) AS user_id, coalesce(u.name, 'System') AS name,
                sum(a.cost_usd) AS cost, count(*) AS calls
         FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.created_at >= ? GROUP BY a.user_id ORDER BY cost DESC`,
      )
      .all(since) as { user_id: number; name: string; cost: number; calls: number }[];
    const byFeatureRows = this.db
      .prepare(
        `SELECT feature, sum(cost_usd) AS cost, count(*) AS calls
         FROM ai_usage WHERE created_at >= ? GROUP BY feature ORDER BY cost DESC`,
      )
      .all(since) as { feature: AiFeature; cost: number; calls: number }[];
    const budgetRows = this.db.prepare('SELECT * FROM ai_budgets').all() as {
      scope: 'user' | 'feature';
      key: string;
      monthly_usd: number;
    }[];
    const userBudgets = new Map(
      budgetRows
        .filter((row) => row.scope === 'user')
        .map((row) => [Number(row.key), row.monthly_usd]),
    );
    const featureBudgets = new Map(
      budgetRows.filter((row) => row.scope === 'feature').map((row) => [row.key, row.monthly_usd]),
    );
    const byModelRows = this.db
      .prepare(
        `SELECT model, sum(cost_usd) AS cost, count(*) AS calls FROM ai_usage
         WHERE created_at >= ? GROUP BY model ORDER BY cost DESC`,
      )
      .all(since) as { model: string; cost: number; calls: number }[];
    const blocked = this.db
      .prepare("SELECT count(*) AS n FROM ai_usage WHERE status = 'blocked' AND created_at >= ?")
      .get(monthStart()) as { n: number };
    return {
      monthCostUsd: monthCost,
      monthBudgetUsd: settings.monthlyBudgetUsd,
      last30Days: { costUsd: last30.cost, calls: last30.calls },
      byUser: byUserRows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        costUsd: row.cost,
        calls: row.calls,
        limitUsd:
          userBudgets.get(row.user_id) ??
          (settings.defaultUserMonthlyUsd > 0 ? settings.defaultUserMonthlyUsd : null),
      })),
      byFeature: byFeatureRows.map((row) => ({
        feature: row.feature,
        label: FEATURE_LABELS[row.feature] ?? row.feature,
        costUsd: row.cost,
        calls: row.calls,
        capUsd: featureBudgets.get(row.feature) ?? null,
      })),
      byModel: byModelRows.map((row) => ({
        model: row.model,
        costUsd: row.cost,
        calls: row.calls,
      })),
      blockedThisMonth: blocked.n,
    };
  }

  async embed(userId: number | null, inputs: string[]): Promise<number[][]> {
    this.assertUsable(userId, 'embedding');
    const settings = this.settings();
    const route = this.modelFor('embedding');
    const out: number[][] = [];
    for (let start = 0; start < inputs.length; start += 64) {
      const batch = inputs.slice(start, start + 64);
      try {
        const result = await this.client.embed(settings.embeddingModel || route.model, batch);
        out.push(...result.embeddings);
        this.record(userId, 'embedding', route.model, result.usage, route.tier);
      } catch (error) {
        if (error instanceof OpenRouterError) {
          throw new AppError(502, 'ai_upstream_error', error.message);
        }
        throw error;
      }
    }
    checkAlerts(this.db, settings, 'embedding', userId);
    return out;
  }

  async models(): Promise<AiModel[]> {
    if (!this.client.configured) return [];
    if (this.modelCache && Date.now() - this.modelCache.at < 60 * 60 * 1000) {
      return this.modelCache.models;
    }
    const models = await this.client.listModels();
    this.modelCache = { at: Date.now(), models };
    return models;
  }
}
