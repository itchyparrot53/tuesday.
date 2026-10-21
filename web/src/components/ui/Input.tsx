import { AlertCircle } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: string; help?: string }
>(function Input({ className, error, help, id, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || help ? `${inputId}-help` : undefined}
        className={cn(
          'control h-9 w-full rounded-[8px] border bg-surface px-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-line-strong focus:border-accent focus:ring-focus/20',
          className,
        )}
        {...rest}
      />
      {(error || help) && (
        <p
          id={`${inputId}-help`}
          className={cn('mt-1 text-[12px]', error ? 'text-danger' : 'text-muted')}
        >
          {error && <AlertCircle size={12} className="mr-1 inline" />}
          {error ?? help}
        </p>
      )}
    </>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; help?: string }
>(function Textarea({ className, error, help, id, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || help ? `${inputId}-help` : undefined}
        className={cn(
          'w-full rounded-[8px] border bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-line-strong focus:border-accent focus:ring-focus/20',
          className,
        )}
        {...rest}
      />
      {(error || help) && (
        <p
          id={`${inputId}-help`}
          className={cn('mt-1 text-[12px]', error ? 'text-danger' : 'text-muted')}
        >
          {error && <AlertCircle size={12} className="mr-1 inline" />}
          {error ?? help}
        </p>
      )}
    </>
  );
});
