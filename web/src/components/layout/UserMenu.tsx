import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LogOut, MoreHorizontal, Shield, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { applyPrefs } from '../../lib/prefs';
import { useMe } from '../../hooks/useMe';
import { Avatar } from '../ui/Avatar';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { COLOR_THEMES } from '../../../../shared/themes';
import { usePwa } from '../../pwa/usePwa';
import { InstallDialog } from '../../pwa/InstallDialog';
import { clearOutbox, countOutbox } from '../../pwa/outbox';

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pwa = usePwa();
  const [installOpen, setInstallOpen] = useState(false);
  useEffect(() => {
    const open = () => setInstallOpen(true);
    window.addEventListener('tuesday:install-app', open);
    return () => window.removeEventListener('tuesday:install-app', open);
  }, []);
  const user = me.data?.user;
  if (!user) return null;
  const prefs = user.preferences;
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  async function update(patch: Partial<typeof prefs>) {
    const next = { ...prefs, ...patch };
    applyPrefs(next);
    await api('PATCH', '/me', { preferences: patch });
    await qc.invalidateQueries({ queryKey: ['me'] });
  }
  return (
    <>
      <Menu
        className="w-[220px]"
        trigger={
          <button
            data-testid="user-menu"
            className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-sunken"
            aria-label="User menu"
          >
            <Avatar name={user.name} color={user.color} size={24} />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {user.name}
                </span>
                <MoreHorizontal size={14} className="text-muted" />
              </>
            )}
          </button>
        }
      >
        <MenuItem onSelect={() => navigate('/profile')}>
          <UserRound size={14} /> Profile
        </MenuItem>
        {pwa.canInstall && (
          <MenuItem
            data-testid="install-app"
            onSelect={async () => {
              await pwa.promptInstall();
              await update({ appInstalled: true });
            }}
          >
            Install app
          </MenuItem>
        )}
        {pwa.isIos && (
          <MenuItem data-testid="install-app" onSelect={() => setInstallOpen(true)}>
            Add to Home Screen
          </MenuItem>
        )}
        {isAdmin && (
          <MenuItem onSelect={() => navigate('/admin')}>
            <Shield size={14} /> Admin
          </MenuItem>
        )}
        <MenuItem
          onSelect={() => {
            navigate('/');
            window.setTimeout(() => window.dispatchEvent(new Event('tuesday:start-tour')), 250);
          }}
        >
          Take the tour
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <MenuItem
          role="menuitemradio"
          aria-checked={prefs.theme === 'system'}
          data-testid="theme-option-system"
          onSelect={() => update({ theme: 'system' })}
        >
          System {prefs.theme === 'system' ? '✓' : ''}
        </MenuItem>
        <MenuItem
          role="menuitemradio"
          aria-checked={prefs.theme === 'light'}
          data-testid="theme-option-light"
          onSelect={() => update({ theme: 'light' })}
        >
          Light {prefs.theme === 'light' ? '✓' : ''}
        </MenuItem>
        <MenuItem
          role="menuitemradio"
          aria-checked={prefs.theme === 'dark'}
          data-testid="theme-option-dark"
          onSelect={() => update({ theme: 'dark' })}
        >
          Dark {prefs.theme === 'dark' ? '✓' : ''}
        </MenuItem>
        <MenuLabel>Colour theme</MenuLabel>
        {COLOR_THEMES.map((theme) => (
          <MenuItem
            key={theme.id}
            role="menuitemradio"
            aria-checked={prefs.colorTheme === theme.id}
            data-testid={`color-theme-option-${theme.id}`}
            onSelect={() => update({ colorTheme: theme.id, theme: theme.defaultMode })}
          >
            <span
              className="h-3 w-3 rounded-full border border-line"
              style={{ backgroundColor: theme.accent }}
            />
            {theme.name} {prefs.colorTheme === theme.id ? '✓' : ''}
          </MenuItem>
        ))}
        <MenuLabel>Density</MenuLabel>
        <MenuItem
          role="menuitemradio"
          aria-checked={prefs.density === 'comfortable'}
          data-testid="density-option-comfortable"
          onSelect={() => update({ density: 'comfortable' })}
        >
          Comfortable {prefs.density === 'comfortable' ? '✓' : ''}
        </MenuItem>
        <MenuItem
          role="menuitemradio"
          aria-checked={prefs.density === 'compact'}
          data-testid="density-option-compact"
          onSelect={() => update({ density: 'compact' })}
        >
          Compact {prefs.density === 'compact' ? '✓' : ''}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            const pending = await countOutbox();
            if (
              pending > 0 &&
              !window.confirm(
                `You have ${pending} unsynced change${pending === 1 ? '' : 's'}. Sign out anyway?`,
              )
            ) {
              return;
            }
            await api('POST', '/auth/logout');
            navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
            await clearOutbox();
            localStorage.removeItem('tuesday:last-user');
            await qc.invalidateQueries();
            navigate('/login');
          }}
        >
          <LogOut size={14} /> Log out
        </MenuItem>
        <Link to="/profile" className="hidden" />
      </Menu>
      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} />
    </>
  );
}
