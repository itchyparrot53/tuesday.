import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { startEventStream } from '../../lib/sse';
import { CommandPalette } from '../CommandPalette';
import { undoStack } from '../../lib/undo';
import { Logo } from '../brand/Logo';
import { Menu, Search, Sparkles } from 'lucide-react';
import { applyPrefs } from '../../lib/prefs';
import { useMe } from '../../hooks/useMe';
import { useToast } from '../ui/Toast';
import { openAi, type OpenAiOptions } from '../../ai/openAi';
import { CreateBoardDialog } from '../CreateBoardDialog';
import { UpdateToast } from '../../pwa/UpdateToast';
import { BottomNav } from './BottomNav';
import { usePwa } from '../../pwa/usePwa';
import { OfflineBanner } from '../../pwa/OfflineBanner';
import { api } from '../../lib/api';
import { clearOutbox, countOutbox, replay } from '../../pwa/outbox';
import { OutboxBadge } from '../../pwa/OutboxBadge';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardWorkspaceId, setBoardWorkspaceId] = useState<number | undefined>(undefined);
  const [undoVisible, setUndoVisible] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const pwa = usePwa();
  const toast = useToast();
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!navigator.onLine) return;
      const count = await countOutbox();
      if (!count || cancelled) return;
      const result = await replay();
      await qc.invalidateQueries();
      if (result.sent)
        toast.show(`Synced ${result.sent} change${result.sent === 1 ? '' : 's'}`, 'success');
      for (const failure of result.failed)
        toast.show(`Couldn't sync "${failure.label}": ${failure.message}`, 'error');
    }
    void run();
    window.addEventListener('online', run);
    const timer = window.setInterval(run, 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, toast]);

  useEffect(() => {
    if (!me.data) return;
    const id = String(me.data.user.id);
    const previous = localStorage.getItem('tuesday:last-user');
    if (previous && previous !== id) {
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
      void clearOutbox();
    }
    localStorage.setItem('tuesday:last-user', id);
  }, [me.data]);

  useEffect(() => {
    if (pwa.isStandalone && me.data && !me.data.user.preferences.appInstalled) {
      void api('PATCH', '/me', { preferences: { appInstalled: true } }).then(() =>
        qc.invalidateQueries({ queryKey: ['me'] }),
      );
    }
  }, [pwa.isStandalone, me.data, qc]);
  useEffect(() => {
    if (me.data?.user.preferences) applyPrefs(me.data.user.preferences);
  }, [me.data?.user.preferences]);

  useEffect(() => {
    const stop = startEventStream(qc, (notification) => {
      toast.show(notification.title, 'success');
    });
    return stop;
  }, [qc, toast]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        if (window.location.pathname.startsWith('/ai')) {
          window.dispatchEvent(new Event('tuesday:focus-ai-composer'));
        } else {
          openAi(navigate);
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      const target = event.target as HTMLElement;
      const typing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) void undoStack.redo();
        else void undoStack.undo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => {
    function show() {
      setUndoVisible(true);
      window.setTimeout(() => setUndoVisible(false), 6000);
    }
    window.addEventListener('tuesday:undo-available', show);
    return () => window.removeEventListener('tuesday:undo-available', show);
  }, []);

  useEffect(() => {
    const toggle = () => setMobileOpen((open) => !open);
    window.addEventListener('tuesday:toggle-sidebar', toggle);
    const openPalette = () => setPaletteOpen(true);
    const handleOpenAi = (event: Event) => {
      openAi(navigate, (event as CustomEvent<OpenAiOptions>).detail ?? {});
    };
    const openBoard = (event: Event) => {
      setBoardWorkspaceId((event as CustomEvent<{ workspaceId?: number }>).detail?.workspaceId);
      setBoardOpen(true);
    };
    window.addEventListener('tuesday:open-palette', openPalette);
    window.addEventListener('tuesday:open-ai', handleOpenAi);
    window.addEventListener('tuesday:create-board', openBoard);
    return () => {
      window.removeEventListener('tuesday:toggle-sidebar', toggle);
      window.removeEventListener('tuesday:open-palette', openPalette);
      window.removeEventListener('tuesday:open-ai', handleOpenAi);
      window.removeEventListener('tuesday:create-board', openBoard);
    };
  }, [navigate]);

  return (
    <div className="flex h-full bg-canvas lg:gap-3 lg:p-3">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-ink"
      >
        Skip to content
      </a>
      <aside className="hidden lg:flex">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-x-0 inset-y-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] bg-canvas shadow-drawer">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas px-4 lg:hidden">
          <Logo />
          <button
            aria-label="Search"
            className="ml-auto rounded-control p-1.5 text-muted hover:bg-sunken"
            onClick={() => setPaletteOpen(true)}
          >
            <Search size={17} />
          </button>
          <button
            aria-label="Ask AI"
            className="rounded-control p-1.5 text-ai hover:bg-ai-soft"
            onClick={() => openAi(navigate)}
          >
            <Sparkles size={17} />
          </button>
        </header>
        <main
          id="content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-hidden border-line bg-surface pb-14 lg:rounded-[16px] lg:border lg:pb-0"
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <UpdateToast />
      <BottomNav onMenu={() => setMobileOpen(true)} />
      <div className="pointer-events-none fixed bottom-16 left-3 z-30 md:hidden">
        <OutboxBadge className="rounded-full bg-surface px-2 py-0.5 shadow-pop" />
      </div>
      <CreateBoardDialog
        open={boardOpen}
        onOpenChange={setBoardOpen}
        defaultWorkspaceId={boardWorkspaceId}
      />
      {undoVisible && (
        <div
          data-testid="undo-toast"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-pop bg-ink px-4 py-2.5 text-sm text-surface shadow-pop"
        >
          <span>Change saved</span>
          <button
            className="font-medium text-surface/70 hover:text-surface"
            onClick={async () => {
              await undoStack.undo();
              setUndoVisible(false);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
