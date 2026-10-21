import type { StreamEvent } from '../../shared/types';

export interface BusMessage {
  event: StreamEvent;
  boardId?: number;
  userId?: number;
}

const listeners = new Set<(m: BusMessage) => void>();

export const bus = {
  publish(m: BusMessage): void {
    for (const fn of listeners) {
      try {
        fn(m);
      } catch {}
    }
  },
  subscribe(fn: (m: BusMessage) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
