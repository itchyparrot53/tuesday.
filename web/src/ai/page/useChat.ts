import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { postNdjson } from '../../lib/ndjson';
import type {
  AiContext,
  AiConversation,
  AiStreamEvent,
  AiToolCallView,
  AiUiMessage,
} from '../../../../shared/ai';

interface Chip {
  id: string;
  description: string;
  status: 'running' | 'done' | 'error';
}

export function useChat(
  conversationId: number | null,
  options: { context?: Partial<AiContext>; onCreated: (id: number) => void },
) {
  const qc = useQueryClient();
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [chips, setChips] = useState<Chip[]>([]);
  const [approval, setApproval] = useState<AiToolCallView[] | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const detail = useQuery({
    queryKey: ['ai', 'conversation', conversationId],
    queryFn: () =>
      api<{ conversation: AiConversation; messages: AiUiMessage[] }>(
        'GET',
        `/ai/conversations/${conversationId}`,
      ),
    enabled: conversationId !== null,
  });

  useEffect(() => {
    if (streaming || !detail.data) return;
    const pending = detail.data.messages.find(
      (message) => message.status === 'pending_approval' && message.toolCalls.length,
    );
    setApproval(pending ? pending.toolCalls : null);
  }, [detail.data, streaming]);

  function handle(event: AiStreamEvent) {
    switch (event.type) {
      case 'text':
        setStreamText((text) => text + event.delta);
        break;
      case 'tool_start':
        setChips((prev) => [
          ...prev,
          { id: event.id, description: event.description, status: 'running' },
        ]);
        break;
      case 'tool_result':
        setChips((prev) =>
          prev.map((chip) =>
            chip.id === event.id ? { ...chip, status: event.ok ? 'done' : 'error' } : chip,
          ),
        );
        break;
      case 'approval_required':
        setApproval(event.calls);
        break;
      case 'error':
        setError(event.message);
        break;
    }
  }

  async function ensureConversation(): Promise<number | null> {
    if (conversationId) return conversationId;
    try {
      const data = await api<{ conversation: AiConversation }>('POST', '/ai/conversations', {
        context: options.context ?? { boardIds: [], itemIds: [], docIds: [] },
      });
      await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      options.onCreated(data.conversation.id);
      return data.conversation.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a chat');
      return null;
    }
  }

  async function send(content: string): Promise<void> {
    const text = content.trim();
    if (!text || streaming) return;
    const id = await ensureConversation();
    if (!id) return;
    setPendingUser(text);
    setStreamText('');
    setChips([]);
    setApproval(null);
    setError('');
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    let aborted = false;
    try {
      await postNdjson(
        `/ai/conversations/${id}/messages`,
        { content: text },
        handle,
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') aborted = true;
      else setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setStreaming(false);
      setPendingUser(null);
      abort.current = null;
      await qc.refetchQueries({ queryKey: ['ai', 'conversation', id], type: 'all' });
      await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      if (!aborted) {
        setStreamText('');
        setChips([]);
      }
    }
  }

  function stop(): void {
    abort.current?.abort();
    setStreaming(false);
  }

  async function regenerate(): Promise<void> {
    if (!conversationId || streaming) return;
    setStreamText('');
    setChips([]);
    setApproval(null);
    setError('');
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    let aborted = false;
    try {
      await postNdjson(
        `/ai/conversations/${conversationId}/regenerate`,
        {},
        handle,
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') aborted = true;
      else setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setStreaming(false);
      abort.current = null;
      await qc.refetchQueries({ queryKey: ['ai', 'conversation', conversationId], type: 'all' });
      if (!aborted) {
        setStreamText('');
        setChips([]);
      }
    }
  }

  async function decide(approve: boolean): Promise<void> {
    if (!conversationId || streaming) return;
    setApproval(null);
    setStreamText('');
    setChips([]);
    setError('');
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await postNdjson(
        `/ai/conversations/${conversationId}/decision`,
        { approve },
        handle,
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setStreaming(false);
      abort.current = null;
      await qc.refetchQueries({ queryKey: ['ai', 'conversation', conversationId], type: 'all' });
      setStreamText('');
      setChips([]);
    }
  }

  return {
    detail,
    messages: (detail.data?.messages ?? []).filter((message) => message.role !== 'tool'),
    conversation: detail.data?.conversation ?? null,
    pendingUser,
    streamText,
    chips,
    approval,
    streaming,
    error,
    setError,
    send,
    stop,
    regenerate,
    decide,
  };
}
