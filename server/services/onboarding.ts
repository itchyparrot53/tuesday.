import type { Db } from '../db/db';
import type { OnboardingState, OnboardingStepId, User } from '../../shared/types';
import { PALETTE } from '../../shared/columns';
import { getOrg } from './settings';
import { createWorkspace, listWorkspacesForUser } from './workspaces';
import { createFromTemplate } from './templates';

export type StarterUseCase =
  'projects' | 'marketing' | 'product' | 'hiring' | 'sales' | 'events' | 'empty';

const STARTERS: Record<Exclude<StarterUseCase, 'empty'>, { template: string; name: string }> = {
  projects: { template: 'builtin:project-tracker', name: 'Project tracker' },
  marketing: { template: 'builtin:content-calendar', name: 'Content calendar' },
  product: { template: 'builtin:bug-tracker', name: 'Bug tracker' },
  hiring: { template: 'builtin:hiring-pipeline', name: 'Hiring pipeline' },
  sales: { template: 'builtin:crm', name: 'CRM' },
  events: { template: 'builtin:event-planning', name: 'Event planning' },
};

export function createStarter(
  db: Db,
  user: User,
  useCase: StarterUseCase,
): { workspaceId: number; boardId: number | null } {
  const workspaces = listWorkspacesForUser(db, user);
  let workspaceId: number;
  if (workspaces.length === 0) {
    const workspace = createWorkspace(db, user, {
      name: getOrg(db).name || 'Tuesday',
      color: PALETTE[3],
    });
    workspaceId = workspace.id;
  } else {
    workspaceId = workspaces[0].id;
  }
  if (useCase === 'empty') return { workspaceId, boardId: null };
  const starter = STARTERS[useCase];
  const existing = db
    .prepare(
      `SELECT id FROM boards
       WHERE workspace_id = ? AND created_by = ? AND name = ? AND archived_at IS NULL
         AND created_at >= ?`,
    )
    .get(
      workspaceId,
      user.id,
      starter.name,
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ) as { id: number } | undefined;
  if (existing) return { workspaceId, boardId: existing.id };
  const board = createFromTemplate(db, user, starter.template, workspaceId, starter.name);
  return { workspaceId, boardId: board.board.id };
}

export function getOnboarding(db: Db, user: User): OnboardingState {
  const isAdminUser = user.role === 'owner' || user.role === 'admin';
  const isMember = user.role === 'member';
  const isViewer = user.role === 'viewer';

  const steps: { id: OnboardingStepId; done: boolean }[] = [];
  if (isAdminUser) {
    steps.push({
      id: 'create_board',
      done: Boolean(
        db
          .prepare('SELECT id FROM boards WHERE created_by = ? AND archived_at IS NULL LIMIT 1')
          .get(user.id),
      ),
    });
  }
  if (isAdminUser || isMember) {
    steps.push({
      id: 'add_item',
      done: Boolean(db.prepare('SELECT id FROM items WHERE created_by = ? LIMIT 1').get(user.id)),
    });
  }
  if (isAdminUser) {
    const invites = (
      db.prepare('SELECT count(*) AS n FROM invites WHERE created_by = ?').get(user.id) as {
        n: number;
      }
    ).n;
    const active = (
      db.prepare('SELECT count(*) AS n FROM users WHERE is_active = 1').get() as { n: number }
    ).n;
    steps.push({ id: 'invite_team', done: invites > 0 || active > 1 });
  }
  if (isMember || isViewer) {
    steps.push({
      id: 'post_update',
      done: Boolean(db.prepare('SELECT id FROM updates WHERE author_id = ? LIMIT 1').get(user.id)),
    });
  }
  steps.push({
    id: 'try_ai',
    done: Boolean(
      db
        .prepare(
          `SELECT m.id FROM ai_messages m
           JOIN ai_conversations c ON c.id = m.conversation_id
           WHERE c.user_id = ? AND m.role = 'user' LIMIT 1`,
        )
        .get(user.id),
    ),
  });
  if (isMember || isViewer) {
    steps.push({ id: 'set_profile', done: user.title.trim() !== '' });
  }
  steps.push({ id: 'install_app', done: user.preferences.appInstalled });
  steps.push({ id: 'take_tour', done: user.preferences.tourDone });

  const created = new Date(user.createdAt).getTime();
  const recent = Number.isFinite(created) && Date.now() - created < 30 * 24 * 60 * 60 * 1000;
  const show = !user.preferences.onboardingDismissed && recent && steps.some((step) => !step.done);
  return { show, steps };
}
