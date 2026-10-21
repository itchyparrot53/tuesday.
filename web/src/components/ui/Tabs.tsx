import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  testId?: string;
}

export function UnderlineTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const button = container.current?.querySelector<HTMLElement>(`[data-tab-id="${value}"]`);
    if (!button || !container.current) return;
    const parent = container.current.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    setIndicator({ left: box.left - parent.left + container.current.scrollLeft, width: box.width });
  }, [value, tabs.length]);
  return (
    <div
      ref={container}
      role="tablist"
      className={cn(
        'relative flex items-center gap-1 overflow-x-auto border-b border-line',
        className,
      )}
    >
      <span
        data-testid="tab-indicator"
        className="absolute bottom-0 h-[2px] bg-accent transition-all duration-[160ms]"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab-id={tab.id}
          data-testid={tab.testId ?? `tab-${tab.id}`}
          data-tab={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative z-10 inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-[13.5px] font-semibold transition-colors',
            value === tab.id ? 'text-ink' : 'text-ink hover:text-accent',
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-full bg-sunken px-1.5 text-[10px] text-muted">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string | ReactNode; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-[8px] bg-sunken p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          title={option.title}
          aria-label={option.title}
          onClick={() => onChange(option.id)}
          className={cn(
            'inline-flex h-7 items-center justify-center gap-1 rounded-[6px] px-2 text-[12px] font-semibold',
            value === option.id
              ? 'border border-line bg-surface text-ink'
              : 'border border-transparent text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
