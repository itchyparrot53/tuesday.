import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  wide,
  size,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
  size?: 'default' | 'wide';
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 dialog-overlay" />
        <DialogPrimitive.Content
          className={cn(
            'dialog-sheet fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-auto rounded-t-[14px] border border-line bg-surface p-6 shadow-pop focus:outline-none sm:left-1/2 sm:top-1/2 sm:inset-x-auto sm:bottom-auto sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[14px]',
            size === 'wide' || wide ? 'sm:max-w-[760px]' : 'sm:max-w-[520px]',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="t-section text-ink">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  header,
  children,
  footer,
  width = 'default',
  closeLabel = 'Close drawer',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'default' | 'ai' | 'wide';
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 dialog-overlay" />
        <DialogPrimitive.Content
          className={cn(
            'drawer-panel fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-drawer focus:outline-none md:rounded-l-[14px]',
            width === 'ai' ? 'md:w-[420px]' : width === 'wide' ? 'md:w-[880px]' : 'md:w-[600px]',
          )}
        >
          {header ? (
            <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
              <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
              {header}
              <DialogPrimitive.Close
                aria-label={closeLabel}
                className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
              >
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
          ) : (
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <DialogPrimitive.Title className="t-section text-ink">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label={closeLabel}
                className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
              >
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-line p-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
