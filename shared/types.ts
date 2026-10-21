import type { CellValue, ColumnSettings, ColumnType } from './columns';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

import type { ColorThemeId } from './themes';

export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'comfortable' | 'compact';
export type QueueDateFilter = 'all' | 'overdue' | 'today' | 'upcoming';
export interface SavedQueueView {
  id: string;
  name: string;
  boardFilter: number | null;
  dateFilter: QueueDateFilter;
  favoritesOnly: boolean;
}
export interface Preferences {
  theme: ThemePreference;
  density: DensityPreference;
  colorTheme: ColorThemeId;
  sidebarCollapsed: boolean;
  collapsedWorkspaceIds: number[];
  homeBoardFilter: number | null;
  homeDateFilter: QueueDateFilter;
  savedQueueViews: SavedQueueView[];
  myWorkQueueViews: SavedQueueView[];
  homeFavoritesOnly: boolean;
  onboardingDismissed: boolean;
  tourDone: boolean;
  appInstalled: boolean;
}
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  density: 'comfortable',
  colorTheme: 'tuesday',
  sidebarCollapsed: false,
  collapsedWorkspaceIds: [],
  homeBoardFilter: null,
  homeDateFilter: 'all',
  savedQueueViews: [],
  myWorkQueueViews: [],
  homeFavoritesOnly: false,
  onboardingDismissed: false,
  tourDone: false,
  appInstalled: false,
};

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  title: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  preferences: Preferences;
  isGuest: boolean;
  sso: boolean;
}

export interface Org {
  name: string;
  timezone: string;
}

export interface Invite {
  id: number;
  token: string;
  url: string;
  email: string | null;
  role: Exclude<Role, 'owner'>;
  isGuest: boolean;
  boardAccess: { boardId: number; access: 'view' | 'comment' | 'edit' }[];
  emailedAt: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface BoardSummary {
  id: number;
  workspaceId: number;
  name: string;
  isPrivate?: boolean;
  position: number;
  updatedAt?: string;
}

export interface DocSummary {
  id: number;
  workspaceId: number;
  title: string;
  updatedAt: string;
}

export interface Workspace {
  id: number;
  name: string;
  description: string;
  color: string;
  isPrivate: boolean;
  position: number;
  createdBy: number;
  memberIds: number[];
  boards: BoardSummary[];
  docs: DocSummary[];
  dashboards: { id: number; name: string; updatedAt?: string }[];
}

export interface Board {
  id: number;
  workspaceId: number;
  name: string;
  description: string;
  isPrivate: boolean;
  myAccess: Exclude<BoardAccess, 'none'>;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: number;
  boardId: number;
  title: string;
  type: ColumnType;
  settings: ColumnSettings;
  position: number;
  width: number;
}

export interface Group {
  id: number;
  boardId: number;
  title: string;
  color: string;
  position: number;
  collapsed: boolean;
}

export type ViewType = 'table' | 'kanban' | 'calendar' | 'timeline';

export type FilterOp = 'is' | 'is_not' | 'contains' | 'is_empty' | 'is_not_empty' | 'gt' | 'lt';

export interface Filter {
  columnId: number;
  op: FilterOp;
  value: string | number | null;
}

export interface ViewSettings {
  filters: Filter[];
  sort: { columnId: number | 'name'; dir: 'asc' | 'desc' } | null;
  search: string;
  personUserId: number | null;
  hiddenColumnIds: number[];
  kanbanColumnId?: number | null;
  calendarColumnId?: number | null;
  calendarMode?: 'month' | 'week';
  timelineColumnId?: number | null;
  timelineZoom?: 'week' | 'month' | 'quarter';
  cardColumnIds?: number[];
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  filters: [],
  sort: null,
  search: '',
  personUserId: null,
  hiddenColumnIds: [],
};

export interface View {
  id: number;
  boardId: number;
  name: string;
  type: ViewType;
  settings: ViewSettings;
  position: number;
}

export interface BoardFull {
  board: Board;
  columns: Column[];
  groups: Group[];
  views: View[];
}

export interface Item {
  id: number;
  boardId: number;
  groupId: number;
  parentId: number | null;
  name: string;
  position: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  values: Record<string, CellValue>;
  updateCount: number;
}

export interface Update {
  id: number;
  itemId: number;
  authorId: number | null;
  authorKind: 'user' | 'ai';
  parentId: number | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export type ActivityAction =
  | 'board_created'
  | 'item_created'
  | 'item_renamed'
  | 'item_moved'
  | 'item_archived'
  | 'value_changed'
  | 'group_created'
  | 'group_deleted'
  | 'column_created'
  | 'column_deleted'
  | 'update_posted'
  | 'item_restored'
  | 'file_added'
  | 'file_deleted'
  | 'automation_ran'
  | 'workflow_ran';

export interface Activity {
  id: number;
  boardId: number;
  itemId: number | null;
  actorId: number | null;
  actorKind: 'user' | 'ai' | 'system';
  action: ActivityAction;
  data: Record<string, unknown>;
  createdAt: string;
}

export type NotificationKind =
  'mention' | 'assigned' | 'update_on_item' | 'ai_done' | 'automation' | 'ai_budget';

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  actorId: number | null;
  readAt: string | null;
  createdAt: string;
}

export type MyWorkBucket = 'overdue' | 'today' | 'this_week' | 'next_week' | 'later' | 'no_date';

export interface MyWorkEntry {
  item: Item;
  board: { id: number; name: string; workspaceId: number };
  groupTitle: string;
  dueDate: string | null;
  statusColumnId: number | null;
  bucket: MyWorkBucket;
  isDone: boolean;
}

export type FavoriteKind = 'board' | 'doc' | 'dashboard';

export interface Favorite {
  kind: FavoriteKind;
  id: number;
  name: string;
  workspaceId: number;
  position: number;
}

export interface HomeActivity extends Activity {
  boardName: string;
  itemName: string | null;
  actorName: string | null;
  summary: string;
}

export interface HomeBoardCard {
  id: number;
  name: string;
  workspaceName: string;
  favorite: boolean;
  total: number;
  overdue: number;
  segments: { label: string; color: string; count: number }[];
}

export type OnboardingStepId =
  | 'create_board'
  | 'add_item'
  | 'invite_team'
  | 'try_ai'
  | 'take_tour'
  | 'post_update'
  | 'set_profile'
  | 'install_app';

export interface OnboardingState {
  show: boolean;
  steps: { id: OnboardingStepId; done: boolean }[];
}

export interface HomeSummary {
  today: string;
  counts: { open: number; dueToday: number; overdue: number; doneThisWeek: number };
  myDay: { overdue: MyWorkEntry[]; today: MyWorkEntry[]; upcoming: MyWorkEntry[] };
  week: { date: string; count: number }[];
  doneTrend: { date: string; count: number }[];
  mentions: Notification[];
  boards: HomeBoardCard[];
  activity: HomeActivity[];
  onboarding: OnboardingState;
}

export interface InviteInfo {
  email: string | null;
  role: 'admin' | 'member' | 'viewer';
  orgName: string;
  invitedBy: { name: string; color: string } | null;
  memberCount: number;
  members: { name: string; color: string }[];
  boardNames: string[];
}

export interface SearchResult {
  items: { id: number; name: string; boardId: number; boardName: string }[];
  boards: { id: number; name: string; workspaceId: number }[];
  docs: { id: number; title: string; workspaceId: number }[];
}

export type StreamEvent =
  | { type: 'board.changed'; boardId: number }
  | { type: 'workspaces.changed' }
  | { type: 'notification'; notification: Notification }
  | { type: 'users.changed' }
  | { type: 'doc.changed'; docId: number; version: number }
  | { type: 'dashboard.changed'; dashboardId: number }
  | { type: 'timer.changed'; userId: number }
  | { type: 'ai.conversations.changed' }
  | { type: 'favorites.changed' }
  | { type: 'boards.access.changed' }
  | { type: 'knowledge.changed' };

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface FileInfo {
  id: number;
  itemId: number;
  columnId: number | null;
  updateId: number | null;
  filename: string;
  mime: string;
  size: number;
  uploadedBy: number;
  createdAt: string;
  url: string;
  isImage: boolean;
}

export interface FormField {
  key: 'name' | `col:${number}`;
  label: string;
  required: boolean;
  help: string;
}

export interface FormDef {
  id: number;
  boardId: number;
  token: string;
  title: string;
  description: string;
  groupId: number;
  fields: FormField[];
  enabled: boolean;
  submitMessage: string;
  createdBy: number;
  url: string;
}

export interface PublicForm {
  title: string;
  description: string;
  submitMessage: string;
  fields: (FormField & {
    type: import('./columns').ColumnType | 'name';
    options?: { id: string; name: string; color: string }[];
    max?: number;
    includeTime?: boolean;
  })[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  builtin: boolean;
  includesItems: boolean;
  columns: string[];
  createdBy: number | null;
}

export interface ImportPreview {
  headers: string[];
  rows: string[][];
  rowCount: number;
  suggested: ImportMapping[];
}

export type ImportTarget =
  | 'name'
  | 'group'
  | 'skip'
  | { columnId: number }
  | { newColumn: { title: string; type: import('./columns').ColumnType } };

export interface ImportMapping {
  header: string;
  target: ImportTarget;
}

export interface Doc extends DocSummary {
  content: string;
  version: number;
  createdBy: number;
  updatedBy: number;
  createdAt: string;
}

export interface DocVersion {
  id: number;
  docId: number;
  title: string;
  userId: number;
  createdAt: string;
  content?: string;
}

export interface ActionDraft {
  name: string;
  ownerUserId: number | null;
  ownerName: string | null;
  dueDate: string | null;
  notes: string;
}

export type TrashKind = 'item' | 'board' | 'doc' | 'dashboard' | 'workspace';

export interface TrashEntry {
  kind: TrashKind;
  id: number;
  name: string;
  location: string;
  archivedAt: string;
  archivedBy: number | null;
}

export interface ApiToken {
  id: number;
  name: string;
  prefix: string;
  scope: 'read' | 'write';
  lastUsedAt: string | null;
  createdAt: string;
}

export type WebhookEvent =
  'item.created' | 'item.updated' | 'item.moved' | 'item.archived' | 'update.posted';

export interface Webhook {
  id: number;
  workspaceId: number | null;
  boardId: number | null;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus: number | null;
  failureCount: number;
  createdAt: string;
}

export interface WebhookDelivery {
  id: number;
  webhookId: number;
  event: string;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  durationMs: number;
  createdAt: string;
}

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

export type BoardAccess = 'none' | 'view' | 'comment' | 'edit' | 'manage';

export interface BoardMember {
  userId: number;
  name: string;
  color: string;
  email: string;
  isGuest: boolean;
  access: Exclude<BoardAccess, 'none'>;
  source: 'member' | 'workspace' | 'admin' | 'creator';
}

export type EmailPref = 'instant' | 'digest' | 'off';

export interface NotificationPrefs {
  email: {
    mention: EmailPref;
    assigned: EmailPref;
    update_on_item: Exclude<EmailPref, 'instant'>;
    automation: Exclude<EmailPref, 'instant'>;
  };
  digest: { enabled: boolean; hour: number; weekdaysOnly: boolean };
  push: {
    mention: boolean;
    assigned: boolean;
    update_on_item: boolean;
    automation: boolean;
    ai_budget: boolean;
  };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: { mention: 'instant', assigned: 'instant', update_on_item: 'digest', automation: 'off' },
  digest: { enabled: true, hour: 8, weekdaysOnly: true },
  push: {
    mention: true,
    assigned: true,
    update_on_item: false,
    automation: false,
    ai_budget: true,
  },
};

export interface EmailStatus {
  mode: 'smtp' | 'fake' | 'off';
  host: string | null;
  port: number | null;
  from: string | null;
  lastSentAt: string | null;
  lastError: string | null;
}

export type EmailDnsStatus = 'found' | 'missing' | 'external';

export interface EmailDnsRow {
  status: EmailDnsStatus;
  value: string | null;
  fix: string;
  error?: string;
}

export type GoLiveStatus = 'pass' | 'warn' | 'fail';

export interface GoLiveCheck {
  id: string;
  label: string;
  status: GoLiveStatus;
  detail: string;
  href: string;
}

export interface GoLiveReport {
  checks: GoLiveCheck[];
  restoreDrillDone: boolean;
  checkedAt: string;
}

export interface EmailDnsReport {
  domain: string | null;
  spf: EmailDnsRow & { purelymail: boolean };
  dmarc: EmailDnsRow & { policy: string | null };
  mx: EmailDnsRow;
  dkim: EmailDnsRow;
  error?: string;
}

export interface EmailLogEntry {
  id: number;
  to: string;
  kind: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface AuditEntry {
  id: number;
  actorId: number | null;
  actorLabel: string;
  action: string;
  targetKind: string | null;
  targetId: number | null;
  targetLabel: string;
  ip: string;
  userAgent: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AuthState {
  needsSetup: boolean;
  orgName: string | null;
  sso: { enabled: boolean; label: string; only: boolean };
  mail: boolean;
}

export interface RiskSignal {
  kind: 'overdue' | 'stuck' | 'unassigned_due_soon' | 'overloaded';
  boardId: number;
  boardName: string;
  itemId: number | null;
  itemName: string | null;
  userId: number | null;
  userName: string | null;
  detail: string;
  severity: 1 | 2 | 3;
}

export interface RiskReport {
  generatedAt: string;
  signals: RiskSignal[];
  counts: Record<RiskSignal['kind'], number>;
}
