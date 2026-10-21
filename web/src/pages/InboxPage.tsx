import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { PALETTE } from '../../../shared/columns';
import { relative } from '../lib/format';
import { useNotifications } from '../hooks/useNotifications';
import { useUsers } from '../hooks/useUsers';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import { SkeletonRows } from '../components/ui/Skeleton';
import { UnderlineTabs } from '../components/ui/Tabs';
import type { Notification } from '../../../shared/types';

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function InboxPage() {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const notifications = useNotifications(tab === 'unread');
  const users = useUsers();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function open(notification: Notification) {
    if (!notification.readAt) {
      await api('POST', '/notifications/read', { ids: [notification.id] });
      await qc.invalidateQueries({ queryKey: ['notifications'] });
    }
    navigate(notification.link);
  }

  async function markAll() {
    await api('POST', '/notifications/read', { all: true });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  }

  const entries = notifications.data?.notifications ?? [];
  const groups = [
    { label: 'Today', rows: entries.filter((entry) => isToday(entry.createdAt)) },
    { label: 'Earlier', rows: entries.filter((entry) => !isToday(entry.createdAt)) },
  ].filter((group) => group.rows.length > 0);

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Inbox"
        description="Mentions, assignments and AI results land here."
        actions={
          <Button variant="ghost" size="sm" onClick={markAll} disabled={entries.length === 0}>
            Mark all as read
          </Button>
        }
        tabs={
          <UnderlineTabs
            value={tab}
            onChange={(value) => setTab(value as 'all' | 'unread')}
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
            ]}
          />
        }
      />

      {notifications.isLoading && <SkeletonRows rows={6} />}

      {notifications.isError && (
        <QueryError onRetry={() => void notifications.refetch()} className="mt-4" />
      )}

      {!notifications.isLoading && !notifications.isError && entries.length === 0 && (
        <EmptyState
          icon={<Inbox size={22} />}
          title="You're all caught up."
          description="New mentions and assignments will appear here."
          className="pt-12"
        />
      )}

      {groups.map((group) => (
        <section key={group.label} className="mb-6">
          <h2 className="t-label mb-1 text-muted">{group.label}</h2>
          <div className="border-t border-line">
            {group.rows.map((notification) => {
              const actor = notification.actorId
                ? users.data?.byId.get(notification.actorId)
                : undefined;
              const unread = !notification.readAt;
              return (
                <button
                  key={notification.id}
                  onClick={() => open(notification)}
                  className="flex w-full items-center gap-3 border-b border-line px-1 py-2.5 text-left hover:bg-surface-2"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-accent"
                    style={{ visibility: unread ? 'visible' : 'hidden' }}
                    aria-hidden="true"
                  />
                  {notification.kind === 'ai_done' ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ai-soft text-ai">
                      <Sparkles size={13} />
                    </span>
                  ) : (
                    <Avatar
                      name={actor?.name ?? 'Tuesday'}
                      color={actor?.color ?? PALETTE[7]}
                      size={24}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={unread ? 'truncate text-ink' : 'truncate text-muted'}>
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="truncate text-sm text-muted">{notification.body}</p>
                    )}
                  </div>
                  <span className="t-meta shrink-0 text-muted">
                    {relative(notification.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
