import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/cn';

export function QueryError({
  onRetry,
  message = "Couldn't load this. Check your connection and try again.",
  className,
}: {
  onRetry: () => void;
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="query-error"
      className={cn(
        'flex flex-col items-center gap-3 rounded-pop border border-danger bg-danger-soft px-4 py-6 text-center',
        className,
      )}
    >
      <AlertCircle size={22} className="text-danger-text" />
      <p className="max-w-[420px] text-sm text-danger-text">{message}</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
