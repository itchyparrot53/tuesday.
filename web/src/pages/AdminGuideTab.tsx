import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Database,
  GitBranch,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import type { GoLiveReport, Invite } from '../../../shared/types';
import { api } from '../lib/api';
import { useAiStatus } from '../hooks/useAiStatus';
import { useMe } from '../hooks/useMe';
import { useUsers } from '../hooks/useUsers';
import { useWorkspaces } from '../hooks/useWorkspaces';

type StepState = 'done' | 'todo' | 'attention' | 'optional';

const STATE_STYLE: Record<StepState, string> = {
  done: 'bg-success-soft text-success',
  todo: 'bg-accent-soft text-accent-soft-ink',
  attention: 'bg-warning-soft text-warning',
  optional: 'bg-sunken text-muted',
};

const STATE_LABEL: Record<StepState, string> = {
  done: 'Done',
  todo: 'To do',
  attention: 'Needs attention',
  optional: 'Recommended',
};

function StatusPill({ state }: { state: StepState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-chip px-2 py-0.5 t-meta font-semibold ${STATE_STYLE[state]}`}
    >
      {state === 'done' ? <CheckCircle2 size={11} /> : <Circle size={11} />}
      {STATE_LABEL[state]}
    </span>
  );
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  to: string;
  state: StepState;
  required: boolean;
  icon: typeof Users;
}

function StepCard({ step, index }: { step: SetupStep; index: number }) {
  const Icon = step.icon;
  return (
    <article
      data-testid="admin-guide-step"
      data-step={step.id}
      data-state={step.state}
      className="flex flex-col rounded-sheet border border-line bg-surface p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            step.state === 'done'
              ? 'bg-success-soft text-success'
              : 'bg-accent-soft text-accent-soft-ink'
          }`}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <p className="t-label text-ink">
              {index + 1}. {step.title}
            </p>
            <StatusPill state={step.state} />
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted">{step.description}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1 pl-9">
        {step.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-1.5 text-xs leading-5 text-muted">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
            {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex justify-end pt-2">
        <Link
          to={step.to}
          className="inline-flex items-center gap-1 t-meta font-semibold text-accent hover:text-accent-hover"
        >
          {step.cta} <ArrowRight size={11} />
        </Link>
      </div>
    </article>
  );
}

function UsageCard({
  icon: Icon,
  title,
  body,
  to,
  cta,
}: {
  icon: typeof Users;
  title: string;
  body: string;
  to: string;
  cta: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-pop border border-line bg-surface p-3.5 transition-colors hover:border-accent/40"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken text-muted group-hover:bg-accent-soft group-hover:text-accent-soft-ink">
        <Icon size={14} />
      </span>
      <p className="mt-2 t-label text-ink">{title}</p>
      <p className="mt-1 flex-1 text-xs leading-5 text-muted">{body}</p>
      <span className="mt-2 inline-flex items-center gap-1 t-meta font-semibold text-accent">
        {cta} <ArrowRight size={11} />
      </span>
    </Link>
  );
}

export function AdminGuideTab() {
  const me = useMe();
  const users = useUsers();
  const workspaces = useWorkspaces();
  const ai = useAiStatus();
  const invites = useQuery({
    queryKey: ['invites'],
    queryFn: async () => (await api<{ invites: Invite[] }>('GET', '/invites')).invites,
  });
  const goLive = useQuery({
    queryKey: ['admin', 'go-live'],
    queryFn: () => api<GoLiveReport>('GET', '/admin/go-live'),
  });

  const people = users.data?.users ?? [];
  const activeMembers = people.filter((user) => user.isActive && !user.isGuest).length;
  const pendingInvites = invites.data?.length ?? 0;
  const boards = (workspaces.data ?? []).flatMap((workspace) => workspace.boards);
  const docs = (workspaces.data ?? []).flatMap((workspace) => workspace.docs);
  const firstBoard = boards[0];
  const firstDoc = docs[0];
  const checks = goLive.data?.checks ?? [];
  const check = (id: string) => checks.find((entry) => entry.id === id);

  const email = check('smtp');
  const backups = check('backups');
  const failedChecks = checks.filter((entry) => entry.status === 'fail').length;
  const warnedChecks = checks.filter((entry) => entry.status === 'warn').length;

  const steps: SetupStep[] = [
    {
      id: 'organisation',
      title: 'Set up your organisation',
      description: `${me.data?.org.name ?? 'Your organisation'} — name, timezone and your own profile.`,
      bullets: [
        'Use the real timezone so due dates and schedules line up.',
        'Add your name, title and photo so teammates know who you are.',
      ],
      cta: 'Open organisation settings',
      to: '/admin?tab=members',
      state: me.data?.org.name ? 'done' : 'todo',
      required: false,
      icon: ShieldCheck,
    },
    {
      id: 'team',
      title: 'Invite your team',
      description:
        activeMembers > 1
          ? `${activeMembers} active members${pendingInvites ? `, ${pendingInvites} invites pending` : ''}.`
          : pendingInvites
            ? `${pendingInvites} invite${pendingInvites === 1 ? '' : 's'} waiting to be accepted.`
            : 'Nobody else can see the work until you invite them.',
      bullets: [
        'Use Admin → Invites to email one person or create a link.',
        'Pick the smallest role that lets them do their job.',
      ],
      cta: 'Open invites',
      to: '/admin?tab=invites',
      state: activeMembers > 1 || pendingInvites > 0 ? 'done' : 'todo',
      required: true,
      icon: UserPlus,
    },
    {
      id: 'board',
      title: 'Create your first board',
      description:
        boards.length > 0
          ? `${boards.length} board${boards.length === 1 ? '' : 's'} across ${workspaces.data?.length ?? 0} workspace${(workspaces.data?.length ?? 0) === 1 ? '' : 's'}.`
          : 'Start from a template, a blank board or a short description.',
      bullets: [
        'From Home, choose New → Board and pick a starter that fits the work.',
        'Add groups for stages, then add typed columns for owner, status and dates.',
      ],
      cta: firstBoard ? 'Open your first board' : 'Go to Home',
      to: firstBoard ? `/boards/${firstBoard.id}` : '/',
      state: boards.length > 0 ? 'done' : 'todo',
      required: true,
      icon: LayoutDashboard,
    },
    {
      id: 'email',
      title: 'Connect email',
      description: email?.detail ?? 'Configure SMTP so invites, resets and notifications can send.',
      bullets: [
        'Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM.',
        'Send a test, then publish SPF, DKIM and DMARC for the sender domain.',
      ],
      cta: 'Open email settings',
      to: '/admin?tab=email',
      state: email?.status === 'pass' ? 'done' : email?.status === 'warn' ? 'attention' : 'todo',
      required: true,
      icon: Mail,
    },
    {
      id: 'ai',
      title: 'Turn on AI — optional',
      description: ai.data?.configured
        ? 'AI is configured. Set a budget and routing before people rely on it.'
        : 'No AI key is configured. Tuesday works fully without it.',
      bullets: [
        'Add an OpenRouter key in .env, then set model routing and a monthly budget.',
        'Keep AI off until you know which features you want people using.',
      ],
      cta: 'Open AI settings',
      to: '/admin?tab=ai',
      state: ai.data?.configured ? 'done' : 'optional',
      required: false,
      icon: Sparkles,
    },
    {
      id: 'backups',
      title: 'Protect your data',
      description:
        backups?.detail ?? 'Create a local backup and, ideally, an encrypted off-site copy.',
      bullets: [
        'Take a backup now, then configure S3-compatible off-site storage.',
        'Keep a copy outside the Docker host; a volume is not a backup.',
      ],
      cta: 'Open data settings',
      to: '/admin?tab=data',
      state:
        backups?.status === 'pass' ? 'done' : backups?.status === 'warn' ? 'attention' : 'optional',
      required: false,
      icon: Database,
    },
    {
      id: 'restore',
      title: 'Run a restore drill',
      description: goLive.data?.restoreDrillDone
        ? 'A restore has been verified.'
        : 'A backup you have never restored is only a hope.',
      bullets: [
        'Restore a backup into a throwaway instance.',
        'Confirm a board and item return, then tick Restore drill done in Go-live.',
      ],
      cta: 'Open go-live checklist',
      to: '/admin?tab=go-live',
      state: goLive.data?.restoreDrillDone ? 'done' : 'optional',
      required: false,
      icon: Database,
    },
    {
      id: 'go-live',
      title: 'Go live',
      description:
        failedChecks > 0
          ? `${failedChecks} go-live check${failedChecks === 1 ? '' : 's'} need attention${warnedChecks ? `, ${warnedChecks} warning${warnedChecks === 1 ? '' : 's'}` : ''}.`
          : warnedChecks > 0
            ? `No failures; ${warnedChecks} warning${warnedChecks === 1 ? '' : 's'} to review.`
            : 'HTTPS, secure cookies, email, backups and launch settings look ready.',
      bullets: [
        'Use a public HTTPS URL and set COOKIE_SECURE=true.',
        'Work through Admin → Go-live until every required check passes.',
      ],
      cta: 'Open go-live checklist',
      to: '/admin?tab=go-live',
      state:
        failedChecks > 0
          ? 'todo'
          : warnedChecks > 0
            ? 'attention'
            : checks.length
              ? 'done'
              : 'todo',
      required: true,
      icon: ShieldCheck,
    },
  ];

  const required = steps.filter((step) => step.required);
  const doneRequired = required.filter((step) => step.state === 'done').length;
  const progress = required.length ? Math.round((doneRequired / required.length) * 100) : 0;

  return (
    <div data-testid="admin-guide">
      <section className="rounded-sheet border border-accent/25 bg-accent-soft/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 t-meta font-semibold text-accent-soft-ink">
              <BookOpen size={13} /> Admin guide
            </p>
            <h2 className="mt-1 t-title text-ink">Set Tuesday up with confidence</h2>
            <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">
              Work down this checklist once. The status is read from your real workspace, so it
              updates as you invite people, create boards and finish the go-live checks.
            </p>
          </div>
          <div className="min-w-[160px]">
            <p className="t-meta font-semibold text-ink">
              {doneRequired} of {required.length} required
            </p>
            <div className="mt-1 h-1.5 w-full rounded-full bg-surface/80">
              <div
                className="h-1.5 rounded-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 t-meta text-muted">
              {progress === 100 ? 'Core setup complete' : 'Finish the required steps first'}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 mb-2 flex items-end justify-between gap-2">
        <div>
          <h2 className="t-section text-ink">Setup checklist</h2>
          <p className="mt-0.5 t-meta text-muted">
            Required items are marked To do or Done; optional items are safe to defer.
          </p>
        </div>
        <span className="t-meta text-muted">{steps.length} steps</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {steps.map((step, index) => (
          <StepCard key={step.id} step={step} index={index} />
        ))}
      </div>

      <div className="mt-7 mb-2">
        <h2 className="t-section text-ink">Using Tuesday</h2>
        <p className="mt-0.5 t-meta text-muted">
          The daily paths an admin should know. Each one is one click away.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <UsageCard
          icon={LayoutDashboard}
          title="Start on Home"
          body="Home is a ranked focus queue: overdue first, then today, then the next three days. Use J/K to move, X to complete and / to search."
          to="/"
          cta="Open Home"
        />
        <UsageCard
          icon={LayoutDashboard}
          title="Run a board"
          body="Switch between table, kanban, calendar and timeline. Filter, save a view, bulk-edit selected items and undo mistakes."
          to={firstBoard ? `/boards/${firstBoard.id}` : '/'}
          cta={firstBoard ? 'Open a board' : 'Create a board'}
        />
        <UsageCard
          icon={Zap}
          title="Automate the repetitive work"
          body="Open Automate on a board. Start from a template, describe a rule, or chain actions on a created subitem — including copying the CSM and tagging them in an overdue note."
          to={firstBoard ? `/boards/${firstBoard.id}` : '/'}
          cta="Open Automate"
        />
        <UsageCard
          icon={GitBranch}
          title="Connect boards with Workflows"
          body="Workflows are org-level. Start on one board, then create and copy data into another board, assign the owner and post the first note."
          to="/workflows"
          cta="Open Workflows"
        />
        <UsageCard
          icon={Sparkles}
          title="Ask Tuesday AI"
          body="Use the AI page with attached board or item context. Admins can cap spend, route models and turn memory off or on."
          to="/ai"
          cta="Open AI"
        />
        <UsageCard
          icon={BookOpen}
          title="Write the plan down"
          body="Docs hold decisions and meeting notes next to the work. Version history is automatic."
          to={firstDoc ? `/docs/${firstDoc.id}` : '/'}
          cta={firstDoc ? 'Open a doc' : 'Browse docs'}
        />
        <UsageCard
          icon={Users}
          title="Keep access tidy"
          body="Invite people with the smallest role they need. Use private boards and guests for sensitive work, and review the audit log when something changes."
          to="/admin?tab=members"
          cta="Manage people"
        />
      </div>

      <section className="mt-6 rounded-sheet border border-line bg-surface p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
            <ShieldCheck size={16} />
          </span>
          <div>
            <h2 className="t-label text-ink">A calm weekly routine</h2>
            <ul className="mt-1 space-y-1 text-sm leading-6 text-muted">
              <li>
                Check{' '}
                <Link className="text-accent" to="/admin?tab=go-live">
                  Go-live
                </Link>{' '}
                for failures and warnings.
              </li>
              <li>
                Make or verify a{' '}
                <Link className="text-accent" to="/admin?tab=data">
                  backup
                </Link>
                , and keep an encrypted copy off the host.
              </li>
              <li>
                Review{' '}
                <Link className="text-accent" to="/admin?tab=audit">
                  audit
                </Link>{' '}
                and{' '}
                <Link className="text-accent" to="/admin?tab=ai">
                  AI usage
                </Link>{' '}
                for surprises.
              </li>
              <li>Archive finished boards and remove access for people who no longer need it.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
