import type { ReactNode } from 'react';
import { Logo } from '../components/brand/Logo';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative flex min-h-full items-center justify-center bg-canvas px-4 py-16">
      <div className="absolute left-7 top-7">
        <Logo />
      </div>
      <div className={`w-full ${wide ? 'max-w-[560px]' : 'max-w-[400px]'}`}>
        <div className="rounded-[16px] border border-line bg-surface p-8">
          <h1 className="t-title text-ink">{title}</h1>
          <div className="mt-5">{children}</div>
          {footer && <div className="mt-4 text-sm text-muted">{footer}</div>}
        </div>
        {subtitle && <p className="mt-4 text-center text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      <label htmlFor={htmlFor} className="t-label mb-1 block text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 t-meta text-muted">{hint}</p>}
    </div>
  );
}
