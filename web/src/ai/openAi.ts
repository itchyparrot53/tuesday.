import type { NavigateFunction } from 'react-router';

export interface OpenAiOptions {
  boardId?: number;
  itemId?: number;
  docId?: number;
  q?: string;
}

export function openAi(navigate: NavigateFunction, opts: OpenAiOptions = {}): void {
  const params = new URLSearchParams();
  if (opts.boardId) params.set('board', String(opts.boardId));
  if (opts.itemId) params.set('item', String(opts.itemId));
  if (opts.docId) params.set('doc', String(opts.docId));
  if (opts.q) params.set('q', opts.q);
  const query = params.toString();
  navigate(`/ai${query ? `?${query}` : ''}`);
}
