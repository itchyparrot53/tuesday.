import type { Action, Automation, Condition, Trigger } from '../../../../shared/automations';
import {
  describeAutomationParts,
  type AutomationDescriptionContext,
} from '../../../../shared/automations';
import { cn } from '../../lib/cn';

interface SentenceProps {
  automation: Pick<Automation, 'trigger' | 'conditions' | 'actions'> & {
    trigger: Trigger;
    conditions: Condition[];
    actions: Action[];
  };
  ctx: AutomationDescriptionContext;
  className?: string;
}

export function AutomationSentence({ automation, ctx, className }: SentenceProps) {
  const parts = describeAutomationParts(automation, ctx);
  return (
    <span className={cn('text-sm leading-6 text-ink', className)}>
      {parts.map((part, index) => (
        <span
          key={`${index}-${part.text}`}
          className={cn(
            part.tone === 'trigger' &&
              'rounded-[4px] bg-accent-soft px-1 py-0.5 font-semibold text-accent-soft-ink',
            part.tone === 'condition' && 'font-medium text-muted',
            part.tone === 'action' && 'font-medium text-ink',
          )}
        >
          {part.text}
        </span>
      ))}
    </span>
  );
}

export interface RecipeSegment {
  text: string;
  tone?: 'value';
}

export function RecipeSentence({
  segments,
  className,
}: {
  segments: RecipeSegment[];
  className?: string;
}) {
  return (
    <span className={cn('text-sm leading-6 text-ink', className)}>
      {segments.map((segment, index) => (
        <span
          key={`${index}-${segment.text}`}
          className={cn(
            segment.tone === 'value' &&
              'border-b-2 border-accent/35 pb-px font-semibold text-accent-soft-ink',
          )}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}

export function shortError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
