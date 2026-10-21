import { PALETTE } from '../../../../shared/columns';
import { cn } from '../../lib/cn';
import { labelKey, labelStyle, useTheme } from '../../lib/labelColors';

export function ColorPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}) {
  const theme = useTheme();
  return (
    <div className={cn('grid grid-cols-6 gap-1.5', className)}>
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Colour ${labelKey(color)}`}
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-full border-2',
            value === color
              ? 'border-transparent ring-2 ring-focus ring-offset-2 ring-offset-surface'
              : 'border-transparent',
          )}
          style={{ backgroundColor: labelStyle(color, theme).solid }}
        />
      ))}
    </div>
  );
}
