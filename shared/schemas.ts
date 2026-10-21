import { z } from 'zod';
import { COLOR_THEME_IDS } from './themes';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Invalid email');

export const nameSchema = z.string().trim().min(1).max(80);
export const passwordSchema = z.string().min(8).max(200);

export const setupSchema = z.object({
  orgName: z.string().trim().min(1).max(80),
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  colorTheme: z.enum(COLOR_THEME_IDS).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(500),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  colorTheme: z.enum(COLOR_THEME_IDS).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']).optional(),
  isActive: z.boolean().optional(),
});

export const inviteAccessSchema = z.object({
  boardId: z.number().int().positive(),
  access: z.enum(['view', 'comment', 'edit']),
});

export const inviteCreateSchema = z.object({
  email: emailSchema.optional(),
  role: z.enum(['admin', 'member', 'viewer']),
  send: z.boolean().optional(),
  isGuest: z.boolean().optional(),
  boardAccess: z.array(inviteAccessSchema).optional(),
});

export const inviteBatchItemSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'member', 'viewer']),
  send: z.boolean().optional(),
  isGuest: z.boolean().optional(),
  boardAccess: z.array(inviteAccessSchema).optional(),
});

export const inviteBatchSchema = z.object({
  invites: z.array(inviteBatchItemSchema).min(1).max(20),
});

export const onboardingStarterSchema = z.object({
  useCase: z.enum(['projects', 'marketing', 'product', 'hiring', 'sales', 'events', 'empty']),
});

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  colorTheme: z.enum(COLOR_THEME_IDS).optional(),
  sidebarCollapsed: z.boolean().optional(),
  collapsedWorkspaceIds: z.array(z.number().int().positive()).max(100).optional(),
  homeBoardFilter: z.number().int().positive().nullable().optional(),
  homeDateFilter: z.enum(['all', 'overdue', 'today', 'upcoming']).optional(),
  savedQueueViews: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().trim().min(1).max(40),
        boardFilter: z.number().int().positive().nullable(),
        dateFilter: z.enum(['all', 'overdue', 'today', 'upcoming']),
        favoritesOnly: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  myWorkQueueViews: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().trim().min(1).max(40),
        boardFilter: z.number().int().positive().nullable(),
        dateFilter: z.enum(['all', 'overdue', 'today', 'upcoming']),
        favoritesOnly: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  homeFavoritesOnly: z.boolean().optional(),
  onboardingDismissed: z.boolean().optional(),
  tourDone: z.boolean().optional(),
  appInstalled: z.boolean().optional(),
});

export const notificationPrefsSchema = z
  .object({
    email: z
      .object({
        mention: z.enum(['instant', 'digest', 'off']).optional(),
        assigned: z.enum(['instant', 'digest', 'off']).optional(),
        update_on_item: z.enum(['digest', 'off']).optional(),
        automation: z.enum(['digest', 'off']).optional(),
      })
      .optional(),
    digest: z
      .object({
        enabled: z.boolean().optional(),
        hour: z.number().int().min(0).max(23).optional(),
        weekdaysOnly: z.boolean().optional(),
      })
      .optional(),
    push: z
      .object({
        mention: z.boolean().optional(),
        assigned: z.boolean().optional(),
        update_on_item: z.boolean().optional(),
        automation: z.boolean().optional(),
        ai_budget: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export const profileSchema = z.object({
  name: nameSchema.optional(),
  title: z.string().trim().max(120).optional(),
  preferences: preferencesSchema.optional(),
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: passwordSchema.optional(),
});

export const orgSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.name !== undefined || value.timezone !== undefined, {
    message: 'Nothing to update',
  });

export const workspaceCreateSchema = z.object({
  name: nameSchema,
  description: z.string().max(1000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  isPrivate: z.boolean().optional(),
});

export const workspaceUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: z.string().max(1000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  isPrivate: z.boolean().optional(),
});

export const workspaceMembersSchema = z.object({
  userIds: z.array(z.number().int().positive()).max(1000),
});

export const boardCreateSchema = z.object({
  workspaceId: z.number().int().positive(),
  name: nameSchema,
  description: z.string().max(2000).optional(),
  blank: z.boolean().optional(),
});

export const boardUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: z.string().max(2000).optional(),
  workspaceId: z.number().int().positive().optional(),
});

export const columnCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  type: z.enum([
    'text',
    'long_text',
    'number',
    'status',
    'dropdown',
    'people',
    'date',
    'timeline',
    'checkbox',
    'link',
    'email',
    'phone',
    'rating',
    'ai',
    'formula',
    'dependency',
    'connect',
    'mirror',
    'time_tracking',
    'file',
  ]),
  settings: z.record(z.unknown()).optional(),
  afterColumnId: z.number().int().positive().nullable().optional(),
});

export const columnUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  settings: z.record(z.unknown()).optional(),
  width: z.number().int().optional(),
  afterColumnId: z.number().int().positive().nullable().optional(),
});

export const groupCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  at: z.enum(['top', 'bottom']).optional(),
});

export const groupUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  collapsed: z.boolean().optional(),
  afterGroupId: z.number().int().positive().nullable().optional(),
});

export const filterOpSchema = z.enum([
  'is',
  'is_not',
  'contains',
  'is_empty',
  'is_not_empty',
  'gt',
  'lt',
]);

export const viewSettingsSchema = z.object({
  filters: z
    .array(
      z.object({
        columnId: z.number().int(),
        op: filterOpSchema,
        value: z.union([z.string(), z.number(), z.null()]),
      }),
    )
    .max(50),
  sort: z
    .object({
      columnId: z.union([z.number().int(), z.literal('name')]),
      dir: z.enum(['asc', 'desc']),
    })
    .nullable(),
  search: z.string().max(200),
  personUserId: z.number().int().nullable(),
  hiddenColumnIds: z.array(z.number().int()).max(200),
  kanbanColumnId: z.number().int().positive().nullable().optional(),
  calendarColumnId: z.number().int().positive().nullable().optional(),
  calendarMode: z.enum(['month', 'week']).optional(),
  timelineColumnId: z.number().int().positive().nullable().optional(),
  timelineZoom: z.enum(['week', 'month', 'quarter']).optional(),
  cardColumnIds: z.array(z.number().int()).max(20).optional(),
});

export const viewCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['table', 'kanban', 'calendar', 'timeline']),
  settings: viewSettingsSchema.partial().optional(),
});

export const viewUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  settings: viewSettingsSchema.optional(),
});

export const itemCreateSchema = z.object({
  groupId: z.number().int().positive(),
  name: z.string().trim().min(1).max(500),
  parentId: z.number().int().positive().optional(),
  at: z.enum(['top', 'bottom']).optional(),
  values: z.record(z.unknown()).optional(),
});

export const itemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  groupId: z.number().int().positive().optional(),
  afterItemId: z.number().int().positive().nullable().optional(),
});

export const setValueSchema = z.object({ value: z.unknown().nullable() });

export const bulkItemSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1).max(1000),
  action: z.enum(['archive', 'move']),
  groupId: z.number().int().positive().optional(),
});

export const updateCreateSchema = z.object({
  body: z.string().trim().min(1).max(20000),
  parentId: z.number().int().positive().optional(),
});

export const updateEditSchema = z.object({
  body: z.string().trim().min(1).max(20000),
});

export const notificationsReadSchema = z
  .object({
    ids: z.array(z.number().int().positive()).max(1000).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids && v.ids.length > 0), {
    message: 'Provide ids or all',
  });

const AI_TIERS = ['fast', 'default', 'strong', 'embed'] as const;
const AI_FEATURES = [
  'assistant',
  'summarize',
  'write',
  'generate_board',
  'ai_column',
  'automation',
  'ai_title',
  'title',
  'embedding',
  'nl_filter',
  'formula',
  'column_suggest',
  'risk_insight',
  'dashboard_gen',
  'view_gen',
  'test',
] as const;

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultModel: z.string().trim().min(1).max(200),
  fastModel: z.string().trim().min(1).max(200),
  strongModel: z.string().trim().min(1).max(200),
  embeddingModel: z.string().trim().min(1).max(200),
  orgContext: z.string().max(4000),
  monthlyBudgetUsd: z.number().min(0).max(100000),
  requireConfirmation: z.boolean(),
  memoryEnabled: z.boolean(),
  defaultUserMonthlyUsd: z.number().min(0).max(100000),
  routing: z.record(z.enum(AI_FEATURES), z.enum(AI_TIERS)),
  budgetAlerts: z.boolean(),
});

export const aiBudgetSchema = z.object({
  monthlyUsd: z.number().min(0).max(100000),
});

export const aiConversationCreateSchema = z.object({
  boardId: z.number().int().positive().optional(),
  context: z
    .object({
      boardIds: z.array(z.number().int().positive()).max(5).optional(),
      itemIds: z.array(z.number().int().positive()).max(5).optional(),
      docIds: z.array(z.number().int().positive()).max(5).optional(),
    })
    .optional(),
});

export const aiConversationPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  context: z
    .object({
      boardIds: z.array(z.number().int().positive()).max(5),
      itemIds: z.array(z.number().int().positive()).max(5),
      docIds: z.array(z.number().int().positive()).max(5),
    })
    .optional(),
});

export const aiMessageSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  boardId: z.number().int().positive().optional(),
});

export const aiDecisionSchema = z.object({ approve: z.boolean() });

const DRAFT_COLUMN_TYPES = [
  'text',
  'long_text',
  'number',
  'status',
  'dropdown',
  'people',
  'date',
  'timeline',
  'checkbox',
  'link',
  'email',
  'phone',
  'rating',
] as const;

const draftLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const boardDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500),
    columns: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(60),
          type: z.enum(DRAFT_COLUMN_TYPES),
          labels: z.array(draftLabelSchema).max(12).optional(),
        }),
      )
      .min(1)
      .max(12),
    groups: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(60),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        }),
      )
      .min(1)
      .max(8),
    items: z
      .array(
        z.object({
          group: z.string().trim().min(1).max(60),
          name: z.string().trim().min(1).max(500),
          values: z.record(z.string()).optional(),
        }),
      )
      .max(30),
  })
  .superRefine((draft, ctx) => {
    const titles = new Set(draft.groups.map((group) => group.title));
    draft.items.forEach((item, index) => {
      if (!titles.has(item.group)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'group'],
          message: `Unknown group "${item.group}"`,
        });
      }
    });
  });

export const aiSummarizeSchema = z.object({
  kind: z.enum(['item', 'board', 'doc']),
  id: z.number().int().positive(),
});

export const aiWriteSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  mode: z.enum(['improve', 'shorten', 'fix', 'formal', 'friendly']),
});

export const aiGenerateBoardSchema = z.object({
  workspaceId: z.number().int().positive(),
  prompt: z.string().trim().min(1).max(4000),
});

export const aiCreateBoardSchema = z.object({
  workspaceId: z.number().int().positive(),
  draft: boardDraftSchema,
});

export const aiRunColumnSchema = z.object({
  itemIds: z.array(z.number().int().positive()).max(500).optional(),
});

export const aiGenerateAutomationSchema = z.object({
  boardId: z.number().int().positive(),
  prompt: z.string().trim().min(1).max(4000),
});

const formFieldSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  required: z.boolean(),
  help: z.string().max(500),
});

export const formCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const formUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  groupId: z.number().int().positive().optional(),
  fields: z.array(formFieldSchema).max(100).optional(),
  enabled: z.boolean().optional(),
  submitMessage: z.string().trim().min(1).max(500).optional(),
});

export const publicFormSubmitSchema = z.object({
  values: z.record(z.unknown()),
  website: z.string().max(200).optional(),
});

export const docCreateSchema = z.object({
  workspaceId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(500000).optional(),
});

export const docUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(500000).optional(),
  baseVersion: z.number().int().min(0),
});

export const aiExtractActionsSchema = z.object({
  text: z.string().trim().min(1).max(50000),
  boardId: z.number().int().positive(),
});

const actionDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ownerUserId: z.number().int().nullable(),
  ownerName: z.string().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  notes: z.string().max(1000),
});

export const aiCreateActionsSchema = z.object({
  boardId: z.number().int().positive(),
  groupId: z.number().int().positive(),
  actions: z.array(actionDraftSchema).min(1).max(30),
  saveDoc: z
    .object({
      workspaceId: z.number().int().positive(),
      title: z.string().trim().min(1).max(200),
      text: z.string().max(50000),
    })
    .optional(),
});
