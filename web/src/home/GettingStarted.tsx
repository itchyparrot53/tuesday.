import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Sparkles } from 'lucide-react';
import type { OnboardingState, OnboardingStepId } from '../../../shared/types';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { CreateBoardDialog } from '../components/CreateBoardDialog';
import { QuickAddDialog } from './QuickAddDialog';

const LABELS: Record<OnboardingStepId, string> = {
  create_board: 'Create your first board',
  add_item: 'Add an item',
  invite_team: 'Invite your team',
  post_update: 'Post an update or @mention someone',
  try_ai: 'Ask Tuesday AI something',
  set_profile: 'Add your job title',
  install_app: 'Install Tuesday on your devices',
  take_tour: 'Take the 1-minute tour',
};

export function GettingStarted({
  state,
  onStartTour,
}: {
  state: OnboardingState;
  onStartTour: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [boardOpen, setBoardOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  if (!state.show) return null;
  const done = state.steps.filter((step) => step.done).length;

  async function action(id: OnboardingStepId) {
    switch (id) {
      case 'create_board':
        setBoardOpen(true);
        break;
      case 'add_item':
        setQuickOpen(true);
        break;
      case 'invite_team':
        navigate('/admin?tab=invites');
        break;
      case 'post_update':
        navigate('/my-work');
        break;
      case 'try_ai':
        navigate('/ai');
        break;
      case 'set_profile':
        navigate('/profile');
        break;
      case 'install_app':
        window.dispatchEvent(new Event('tuesday:install-app'));
        break;
      case 'take_tour':
        onStartTour();
        break;
    }
  }

  return (
    <section
      data-testid="home-getting-started"
      className="mb-6 rounded-[16px] border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h2 className="t-section text-ink">Get started with Tuesday</h2>
          <p className="t-meta text-muted">
            {done} of {state.steps.length} done
          </p>
        </div>
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-sunken">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${(done / Math.max(1, state.steps.length)) * 100}%` }}
          />
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={stepsOpen}
          onClick={() => setStepsOpen((open) => !open)}
        >
          {stepsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Steps
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="onboarding-hide"
          onClick={async () => {
            await api('PATCH', '/me', { preferences: { onboardingDismissed: true } });
            await qc.invalidateQueries({ queryKey: ['home'] });
            await qc.invalidateQueries({ queryKey: ['me'] });
          }}
        >
          Hide
        </Button>
      </div>
      <div className={cn('mt-3 gap-1 sm:grid-cols-2', stepsOpen ? 'grid' : 'hidden')}>
        {state.steps.map((step) => (
          <div
            key={step.id}
            data-testid="onboarding-step"
            data-step={step.id}
            data-done={step.done}
            className="flex items-center gap-2 rounded-[6px] px-1 py-1"
          >
            {step.done ? (
              <CheckCircle2 size={16} className="shrink-0 text-success" />
            ) : (
              <Circle size={16} className="shrink-0 text-faint" />
            )}
            <span
              className={`min-w-0 flex-1 truncate text-sm ${step.done ? 'text-muted line-through' : 'text-ink'}`}
            >
              {LABELS[step.id]}
            </span>
            {!step.done && (
              <Button size="sm" variant="ghost" onClick={() => void action(step.id)}>
                {step.id === 'take_tour' ? <Sparkles size={12} /> : null}
                {step.id === 'create_board'
                  ? 'Create'
                  : step.id === 'add_item'
                    ? 'Add'
                    : step.id === 'take_tour'
                      ? 'Start'
                      : 'Open'}
              </Button>
            )}
          </div>
        ))}
      </div>
      <CreateBoardDialog open={boardOpen} onOpenChange={setBoardOpen} />
      <QuickAddDialog open={quickOpen} onOpenChange={setQuickOpen} />
    </section>
  );
}
