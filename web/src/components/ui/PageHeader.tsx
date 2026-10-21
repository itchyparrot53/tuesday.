import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function PageHeader({
  title,
  description,
  actions,
  tabs,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5', className)}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div data-testid="page-title" role="heading" aria-level={1} className="t-title text-ink">
            {title}
          </div>
          {description && (
            <div className="mt-1 line-clamp-2 text-[13px] text-muted">{description}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  );
}
