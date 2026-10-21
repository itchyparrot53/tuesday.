import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="grid gap-3 border-b border-line py-6 first:pt-0 last:border-b-0 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="t-section text-ink">{title}</h2>
        {description && <p className="t-meta mt-1 text-muted">{description}</p>}
      </div>
      <div className="min-w-0">
        {children}
        {actions && <div className="mt-4 flex justify-end gap-2">{actions}</div>}
      </div>
    </section>
  );
}
