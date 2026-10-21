import { Share } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';

export function InstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Install Tuesday">
      <div data-testid="install-dialog" className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-ink">
          <Share size={16} className="text-accent" />
          Install Tuesday on your iPhone or iPad:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Tap the Share button.</li>
          <li>Choose Add to Home Screen.</li>
          <li>Open Tuesday from your Home Screen.</li>
        </ol>
        <p className="border-t border-line pt-3 text-sm text-muted">
          On Android, once installed, share a link or text from another app and choose Tuesday to
          turn it into an item.
        </p>
      </div>
    </Dialog>
  );
}
