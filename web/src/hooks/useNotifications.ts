import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Notification } from '../../../shared/types';

export interface NotificationsResult {
  notifications: Notification[];
  unreadCount: number;
}

export function useNotifications(unreadOnly = false) {
  const query = useQuery({
    queryKey: ['notifications', unreadOnly ? 'unread' : 'all'],
    queryFn: () =>
      api<NotificationsResult>('GET', `/notifications${unreadOnly ? '?unreadOnly=1' : ''}`),
  });
  const unread = query.data?.unreadCount ?? 0;
  useEffect(() => {
    const navigatorWithBadge = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unread > 0) void navigatorWithBadge.setAppBadge?.(unread);
    else void navigatorWithBadge.clearAppBadge?.();
  }, [unread]);
  return query;
}
