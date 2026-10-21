import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'ai';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  ghost: 'bg-transparent text-ink hover:bg-sunken',
  subtle: 'bg-accent-soft text-accent-soft-ink hover:bg-accent-soft/80',
  danger: 'btn-danger',
  ai: 'bg-ai-soft text-ai hover:bg-ai-soft/80',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] font-semibold',
  md: 'h-9 px-3.5 text-[13.5px] font-semibold',
  lg: 'h-11 px-[18px] text-[14px] font-semibold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[8px] transition-colors disabled:cursor-not-allowed disabled:bg-sunken! disabled:text-ink! disabled:opacity-100! disabled:hover:bg-sunken!',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}
