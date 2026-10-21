import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  className,
  align = 'start',
}: {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align={align}
          className={cn(
            'popover-content z-50 rounded-[10px] border border-line bg-surface p-2 shadow-pop outline-none',
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
