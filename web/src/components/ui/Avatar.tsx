import { cn } from '../../lib/cn';
import { initials } from '../../lib/format';
import { labelStyle, useTheme } from '../../lib/labelColors';

export function Avatar({
  name,
  color,
  size = 24,
  className,
}: {
  name: string;
  color: string;
  size?: 20 | 24 | 28 | 32 | 40;
  className?: string;
}) {
  const text =
    size <= 20
      ? 'text-[9px]'
      : size <= 24
        ? 'text-[10px]'
        : size <= 32
          ? 'text-[12px]'
          : 'text-[14px]';
  const theme = useTheme();
  const style = labelStyle(color, theme);
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-surface',
        text,
        className,
      )}
      style={{ width: size, height: size, backgroundColor: style.tint, color: 'var(--ink)' }}
    >
      {initials(name)}
    </span>
  );
}
