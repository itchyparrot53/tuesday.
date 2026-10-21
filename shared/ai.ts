import type { ColumnType } from './columns';

export type AiTier = 'fast' | 'default' | 'strong' | 'embed';

export interface AiSettings {
  enabled: boolean;
  defaultModel: string;
  fastModel: string;
  strongModel: string;
  embeddingModel: string;
  orgContext: string;
  monthlyBudgetUsd: number;
  requireConfirmation: boolean;
  memoryEnabled: boolean;
  defaultUserMonthlyUsd: number;
  routing: Record<AiFeature, AiTier>;
  budgetAlerts: boolean;
}

export interface AiStatus {
  enabled: boolean;
  configured: boolean;
  usable: boolean;
  defaultModel: string;
  fastModel: string;
  requireConfirmation: boolean;
}

export interface AiModel {
  id: string;
  name: string;
  contextLength: number;
  promptPricePerM: number;
  completionPricePerM: number;
  supportsTools: boolean;
}

export interface AiUsageReport {
  monthCostUsd: number;
  monthBudgetUsd: number;
  last30Days: { costUsd: number; calls: number };
  byUser: {
    userId: number;
    name: string;
    costUsd: number;
    calls: number;
    limitUsd: number | null;
  }[];
  byFeature: {
    feature: AiFeature;
    label: string;
    costUsd: number;
    calls: number;
    capUsd: number | null;
  }[];
  byModel: { model: string; costUsd: number; calls: number }[];
  blockedThisMonth: number;
}

export interface AiBudget {
  scope: 'user' | 'feature';
  key: string;
  monthlyUsd: number;
}

export interface AiDailyUsage {
  days: { date: string; costUsd: number; calls: number }[];
}

export interface MyAiUsage {
  monthCostUsd: number;
  limitUsd: number | null;
  calls: number;
}

export type AiFeature =
  | 'assistant'
  | 'summarize'
  | 'write'
  | 'generate_board'
  | 'ai_column'
  | 'automation'
  | 'ai_title'
  | 'embedding'
  | 'nl_filter'
  | 'formula'
  | 'column_suggest'
  | 'risk_insight'
  | 'dashboard_gen'
  | 'view_gen'
  | 'test';

export const DEFAULT_ROUTING: Record<AiFeature, AiTier> = {
  assistant: 'default',
  summarize: 'default',
  write: 'fast',
  generate_board: 'default',
  ai_column: 'fast',
  automation: 'fast',
  test: 'fast',
  ai_title: 'fast',
  embedding: 'embed',
  nl_filter: 'fast',
  formula: 'fast',
  column_suggest: 'fast',
  risk_insight: 'default',
  dashboard_gen: 'default',
  view_gen: 'fast',
};

export const FEATURE_LABELS: Record<AiFeature, string> = {
  assistant: 'Assistant chat',
  summarize: 'Summaries',
  write: 'Writing help',
  generate_board: 'Board generation',
  ai_column: 'AI columns',
  automation: 'Automations',
  test: 'Connection test',
  ai_title: 'Chat titles',
  embedding: 'Organisation memory',
  nl_filter: 'Plain-language filters',
  formula: 'Formula help',
  column_suggest: 'Column suggestions',
  risk_insight: 'Risk explanations',
  dashboard_gen: 'Dashboard generation',
  view_gen: 'View generation',
};

export interface AiContext {
  boardIds: number[];
  itemIds: number[];
  docIds: number[];
}

export interface AiConversation {
  id: number;
  title: string;
  boardId: number | null;
  pinned: boolean;
  context: AiContext;
  titleSource: 'auto' | 'user' | 'ai';
  createdAt: string;
  updatedAt: string;
  preview: string;
}

export interface AiUiMessage {
  id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls: AiToolCallView[];
  status: 'complete' | 'pending_approval' | 'declined';
  createdAt: string;
}

export interface AiToolCallView {
  id: string;
  name: string;
  description: string;
  mutates: boolean;
}

export type AiStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string; description: string }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; summary: string }
  | { type: 'approval_required'; calls: AiToolCallView[] }
  | { type: 'done'; messageId: number | null }
  | { type: 'error'; code: string; message: string };

export interface KnowledgeHit {
  chunkId: number;
  sourceKind: 'item' | 'update' | 'doc';
  sourceId: number;
  itemId: number | null;
  boardId: number | null;
  docId: number | null;
  title: string;
  snippet: string;
  score: number;
}

export interface KnowledgeStatus {
  enabled: boolean;
  model: string;
  chunks: number;
  embedded: number;
  pending: number;
  lastIndexedAt: string | null;
}

export interface BoardDraft {
  name: string;
  description: string;
  columns: {
    title: string;
    type: Exclude<ColumnType, 'ai'>;
    labels?: { name: string; color?: string }[];
  }[];
  groups: { title: string; color?: string }[];
  items: { group: string; name: string; values?: Record<string, string> }[];
}

export type WriteMode = 'improve' | 'shorten' | 'fix' | 'formal' | 'friendly';
