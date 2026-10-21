import { useEffect, useState } from 'react';
import { countOutbox } from './outbox';
import { cn } from '../lib/cn';

export function OutboxBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => void countOutbox().then(setCount);
    refresh();
    window.addEventListener('tuesday:outbox-changed', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.removeEventListener('tuesday:outbox-changed', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);
  if (!count) return null;
  return (
    <span data-testid="outbox-badge" className={cn('t-meta text-warning', className)}>
      {count} change{count === 1 ? '' : 's'} waiting to sync
    </span>
  );
}
