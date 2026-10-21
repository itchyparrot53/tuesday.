import { Check, ChevronDown } from 'lucide-react';
import { Menu, MenuItem } from './Menu';
import { cn } from '../../lib/cn';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * The design-system select. Native selects stay in dense table cells and filter
 * bars until those are migrated; dialogs and settings should use this.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select',
  size = 'md',
  className,
  disabled,
  testId,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu
      align="start"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={testId}
          title={current?.label ?? placeholder}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-control border border-line bg-surface text-left text-sm text-ink transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'h-7 px-2' : 'h-9 px-2.5',
            className,
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown size={13} className="shrink-0 text-muted" />
        </button>
      }
    >
      {options.map((option) => (
        <MenuItem
          key={option.value}
          role="menuitemradio"
          aria-checked={option.value === value}
          onSelect={() => onChange(option.value)}
        >
          <span className="flex w-full items-center gap-2">
            <span className="flex-1 truncate">{option.label}</span>
            {option.value === value && <Check size={13} className="shrink-0 text-accent" />}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}
