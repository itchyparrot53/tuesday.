import { Check } from 'lucide-react';
import { COLOR_THEMES, type ColorThemeId } from '../../../../shared/themes';
import { useTheme } from '../../lib/labelColors';
import { cn } from '../../lib/cn';

export function ColorThemeSwatches({
  value,
  onChange,
  compact = false,
}: {
  value: ColorThemeId;
  onChange: (value: ColorThemeId, theme: 'light' | 'dark') => void;
  compact?: boolean;
}) {
  const resolved = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex flex-wrap gap-2">
      {COLOR_THEMES.map((theme) => {
        const selected = theme.id === value;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Colour theme: ${theme.name}`}
            title={`${theme.name} — ${theme.description} (${theme.defaultMode} default)`}
            data-testid={`color-theme-${theme.id}`}
            onClick={() => onChange(theme.id, theme.defaultMode)}
            className={cn(
              'flex items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors',
              selected
                ? 'border-accent bg-accent-soft'
                : 'border-line hover:border-line-strong hover:bg-surface-2',
              compact ? 't-meta' : 't-label',
            )}
          >
            <span
              className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: resolved === 'dark' ? theme.accentDark : theme.accent }}
            >
              {selected && (
                <Check size={12} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />
              )}
            </span>
            <span className="font-semibold text-ink">{theme.name}</span>
            {!compact && (
              <span className="t-meta text-muted">
                {theme.description} · {theme.defaultMode} default
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
