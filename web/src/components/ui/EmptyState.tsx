import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  small,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  small?: boolean;
}) {
  return (
    <div
      data-testid="empty-state"
      className={cn('mx-auto flex max-w-[360px] flex-col items-center px-4 text-center', className)}
    >
      <div
        className={cn(
          'mb-3 flex items-center justify-center rounded-full bg-sunken text-muted',
          small ? 'h-12 w-12' : 'h-[72px] w-[72px]',
        )}
      >
        {icon}
      </div>
      <h3 className={cn('t-section text-ink', small && 'text-[15px]')}>{title}</h3>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
