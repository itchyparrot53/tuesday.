import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line bg-surface px-1 text-[10px] font-semibold text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
