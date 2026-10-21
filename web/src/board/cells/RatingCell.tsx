import { useState } from 'react';
import { Star } from 'lucide-react';
import type { CellEditorProps } from './CellEditor';
import { useSetValue } from '../mutations';

export function RatingCell({ column, item, boardId }: CellEditorProps) {
  const value = item.values[String(column.id)] as { rating?: number } | undefined;
  const setValue = useSetValue(boardId);
  const [hover, setHover] = useState(0);
  const max = column.settings.max ?? 5;

  return (
    <div className="flex h-9 w-full items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }).map((_, index) => {
        const n = index + 1;
        const filled = n <= (hover || value?.rating || 0);
        return (
          <button
            key={n}
            aria-label={`Rate ${n}`}
            onMouseEnter={() => setHover(n)}
            onClick={() =>
              setValue.mutate({
                itemId: item.id,
                columnId: column.id,
                value: value?.rating === n ? null : { rating: n },
              })
            }
          >
            <Star size={14} className={filled ? 'fill-warning text-warning' : 'text-line-strong'} />
          </button>
        );
      })}
    </div>
  );
}
