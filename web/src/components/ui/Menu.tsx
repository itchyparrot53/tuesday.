import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Menu({
  trigger,
  children,
  align = 'end',
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className={cn(
            'menu-content z-50 max-h-[70vh] min-w-[180px] overflow-y-auto rounded-[10px] border border-line bg-surface p-1.5 shadow-pop outline-none max-md:w-[calc(100vw-24px)] max-md:min-w-0',
            className,
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
  role,
  'aria-checked': ariaChecked,
  ...rest
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  role?: 'menuitem' | 'menuitemradio';
  'aria-checked'?: boolean;
  [key: `data-${string}`]: string | undefined;
}) {
  return (
    <DropdownMenu.Item
      {...rest}
      {...(role ? { role, 'aria-checked': ariaChecked } : {})}
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'menu-item flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
        danger ? 'text-danger-text hover:bg-danger-soft' : 'text-ink hover:bg-sunken',
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2 py-1 text-[11.5px] font-semibold text-muted">
      {children}
    </DropdownMenu.Label>
  );
}
