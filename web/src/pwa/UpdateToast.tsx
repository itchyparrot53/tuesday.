import { usePwa } from './usePwa';
import { Button } from '../components/ui/Button';

export function UpdateToast() {
  const pwa = usePwa({ exposeE2e: true });
  if (!pwa.needRefresh) return null;
  return (
    <div
      data-testid="pwa-update"
      className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-pop border border-line bg-surface px-4 py-2.5 text-sm shadow-pop"
    >
      <span className="text-ink">A new version of Tuesday is ready.</span>
      <Button size="sm" onClick={pwa.update}>
        Reload
      </Button>
    </div>
  );
}
