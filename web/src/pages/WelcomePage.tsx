import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  Megaphone,
  Plus,
  Users,
  Wrench,
} from 'lucide-react';
import type { Invite } from '../../../shared/types';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { AuthShell } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Stepper } from '../components/ui/Stepper';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

const USECASES = [
  { id: 'projects', label: 'Projects', icon: Briefcase },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'product', label: 'Product & engineering', icon: Wrench },
  { id: 'hiring', label: 'Hiring', icon: Users },
  { id: 'sales', label: 'Sales', icon: ClipboardCheck },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'empty', label: 'Start empty', icon: Plus },
] as const;

type UseCase = (typeof USECASES)[number]['id'];
type Role = 'admin' | 'member' | 'viewer';

export function WelcomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const workspaces = useWorkspaces();
  const [params] = useSearchParams();
  const step = params.get('step') === 'invite' ? 2 : 1;
  const [useCase, setUseCase] = useState<UseCase>('projects');
  const [rows, setRows] = useState<{ email: string; role: Role }[]>([
    { email: '', role: 'member' },
  ]);
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState('');

  if (me.isLoading || workspaces.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-muted">
        <Spinner size={20} />
      </div>
    );
  }
  const admin = me.data?.user.role === 'owner' || me.data?.user.role === 'admin';
  if (!me.data || !admin) return <Navigate to="/" replace />;
  if ((workspaces.data?.length ?? 0) > 1) return <Navigate to="/" replace />;

  async function continueStarter() {
    setBusy(true);
    setError('');
    try {
      await api('POST', '/onboarding/starter', { useCase });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      await qc.invalidateQueries({ queryKey: ['home'] });
      navigate('/welcome?step=invite');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function sendInvites() {
    const valid = rows.filter((row) => row.email.trim());
    if (!valid.length) {
      navigate('/');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ invites: Invite[] }>('POST', '/invites/batch', {
        invites: valid.map((row) => ({ email: row.email.trim(), role: row.role })),
      });
      setInvites(result.invites);
      await qc.invalidateQueries({ queryKey: ['home'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (step === 2 && invites) {
    return (
      <AuthShell
        wide
        title="Invite your team"
        subtitle="Share these links. Email sending arrives with email setup."
      >
        <Stepper step={4} />
        <p className="mb-2 t-meta text-muted">
          Email sending is{' '}
          {invites[0]?.emailedAt
            ? 'on — each person got a message.'
            : 'not set up — share the links below.'}
        </p>
        <div className="space-y-2">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center gap-2 rounded-control border border-line px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{invite.email}</p>
                <p data-testid="invite-status" className="t-meta text-muted">
                  {invite.emailedAt ? 'Emailed' : 'Link only'}
                </p>
                <p data-testid="invite-link" className="truncate t-meta text-muted">
                  {invite.url}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                data-testid="invite-copy"
                onClick={async () => {
                  await navigator.clipboard.writeText(invite.url);
                  toast.show('Link copied', 'success');
                }}
              >
                Copy
              </Button>
            </div>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => navigate('/')}>
          Go to Tuesday
        </Button>
        <Button
          className="mt-2 w-full"
          variant="secondary"
          onClick={() => navigate('/admin?tab=guide')}
        >
          Open the admin guide
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      wide
      title={step === 1 ? 'What will you use Tuesday for first?' : 'Invite your team'}
      subtitle={
        step === 1
          ? "We'll set up a board you can change any time."
          : 'Tuesday is better together. You can do this later from Admin.'
      }
    >
      <Stepper step={step === 1 ? 3 : 4} />
      {step === 1 ? (
        <>
          <div
            role="radiogroup"
            aria-label="What will you use Tuesday for first?"
            className="grid gap-2 sm:grid-cols-2"
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
              event.preventDefault();
              const index = USECASES.findIndex((entry) => entry.id === useCase);
              const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
              const next = USECASES[(index + delta + USECASES.length) % USECASES.length];
              setUseCase(next.id);
            }}
          >
            {USECASES.map((entry) => (
              <button
                key={entry.id}
                role="radio"
                aria-checked={useCase === entry.id}
                data-testid="usecase-card"
                data-usecase={entry.id}
                className={`flex items-center gap-2 rounded-[12px] border p-3 text-left ${
                  useCase === entry.id
                    ? 'border-accent bg-accent-soft text-accent-soft-ink'
                    : 'border-line bg-surface text-ink hover:border-accent'
                }`}
                onClick={() => setUseCase(entry.id)}
              >
                <entry.icon size={16} />
                <span className="text-sm font-semibold">{entry.label}</span>
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button
              data-testid="setup-next"
              loading={busy}
              onClick={() => void continueStarter()}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} data-testid="invite-row" className="flex items-center gap-2">
                <Input
                  aria-label={`Email ${index + 1}`}
                  type="email"
                  value={row.email}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, email: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="teammate@company.com"
                />
                <Select
                  ariaLabel={`Role ${index + 1}`}
                  value={row.role}
                  onChange={(value) =>
                    setRows((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, role: value as Role } : entry,
                      ),
                    )
                  }
                  options={[
                    { value: 'member', label: 'Member' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                  className="w-[120px] shrink-0"
                />
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            data-testid="invite-add-row"
            className="mt-2"
            disabled={rows.length >= 10}
            onClick={() => setRows((current) => [...current, { email: '', role: 'member' }])}
          >
            <Plus size={13} /> Add another
          </Button>
          {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" data-testid="setup-skip" onClick={() => navigate('/')}>
              Skip for now
            </Button>
            <Button
              data-testid="setup-next"
              loading={busy}
              onClick={() => void sendInvites()}
              className="flex-1"
            >
              Send invites
            </Button>
          </div>
        </>
      )}
    </AuthShell>
  );
}
