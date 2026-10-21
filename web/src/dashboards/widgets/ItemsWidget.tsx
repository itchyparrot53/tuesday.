import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';
import type { WidgetData } from '../../../../shared/dashboards';

export function ItemsWidget({ data }: { data: Extract<WidgetData, { kind: 'items' }> }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left t-meta">
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id} className="border-b border-line last:border-b-0">
              <td className="truncate py-1 pr-2">
                <Link
                  className="text-ink hover:text-accent"
                  to={`/boards/${item.boardId}?item=${item.id}`}
                >
                  {item.name}
                </Link>
              </td>
              <td className="truncate py-1 pr-2 text-muted">{item.boardName}</td>
              <td className="truncate py-1 text-muted">
                {Object.entries(item.values)
                  .slice(0, 2)
                  .map(([title, value]) => `${title}: ${value}`)
                  .join(' · ')}
              </td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={3}>
                <EmptyState
                  small
                  icon={<span className="t-label">0</span>}
                  title="No items match"
                  description="No items match this widget's filters."
                  className="py-3"
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
