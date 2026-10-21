import type { QueryClient } from '@tanstack/react-query';
import type { Notification, StreamEvent } from '../../../shared/types';

export function startEventStream(
  qc: QueryClient,
  onNotification?: (notification: Notification) => void,
): () => void {
  const source = new EventSource('/api/stream');
  let hadError = false;

  source.onopen = () => {
    if (hadError) {
      hadError = false;
      qc.invalidateQueries();
    }
  };

  source.onerror = () => {
    hadError = true;
  };

  source.onmessage = (message) => {
    let event: StreamEvent;
    try {
      event = JSON.parse(message.data) as StreamEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'board.changed':
        qc.invalidateQueries({ queryKey: ['board', event.boardId] });
        qc.invalidateQueries({ queryKey: ['items', event.boardId] });
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'item' });
        qc.invalidateQueries({ queryKey: ['my-work'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        break;
      case 'workspaces.changed':
        qc.invalidateQueries({ queryKey: ['workspaces'] });
        break;
      case 'notification':
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        onNotification?.(event.notification);
        break;
      case 'users.changed':
        qc.invalidateQueries({ queryKey: ['users'] });
        break;
      case 'favorites.changed':
        qc.invalidateQueries({ queryKey: ['favorites'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        break;
      case 'ai.conversations.changed':
        qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
        break;
    }
  };

  return () => source.close();
}
