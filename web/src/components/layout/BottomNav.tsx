import { NavLink, useLocation, useNavigate } from 'react-router';
import { Home, Inbox, Menu as MenuIcon, PanelLeft, Sparkles } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';

export function BottomNav({ onMenu }: { onMenu: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const unread = useNotifications().data?.unreadCount ?? 0;
  const items = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/my-work', label: 'My work', icon: PanelLeft },
    { to: '/ai', label: 'AI', icon: Sparkles, ai: true },
    { to: '/inbox', label: 'Inbox', icon: Inbox, badge: unread },
  ];
  return (
    <nav
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(56px+env(safe-area-inset-bottom))] items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active =
          item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid="bottom-nav-item"
            data-to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 t-meta',
              active ? 'text-accent' : 'text-muted',
            )}
          >
            <span className="relative">
              <item.icon size={20} className={item.ai ? 'text-ai' : undefined} />
              {item.badge ? (
                <Badge tone="accent" className="absolute -right-3 -top-2">
                  {item.badge}
                </Badge>
              ) : null}
            </span>
            {item.label}
          </NavLink>
        );
      })}
      <button
        data-testid="bottom-nav-item"
        data-to="menu"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 t-meta text-muted"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <MenuIcon size={20} />
        Menu
      </button>
      <button className="hidden" onClick={() => navigate('/')} aria-hidden />
    </nav>
  );
}
