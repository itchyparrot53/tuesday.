import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Badge({
  children,
  tone = 'neutral',
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'ai';
  className?: string;
  [key: `data-${string}`]: string | undefined;
}) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    accent: 'bg-accent text-accent-ink',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger-text',
    warning: 'bg-warning-soft text-warning',
    ai: 'bg-ai-soft text-ai',
  };
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex h-[18px] items-center rounded-full px-1.5 text-[11.5px] font-bold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
