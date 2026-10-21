import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { AiContext, AiConversation } from '../../../../shared/ai';
import { api } from '../../lib/api';
import { useMe } from '../../hooks/useMe';
import { useToast } from '../../components/ui/Toast';
import { useAiStatus } from '../../hooks/useAiStatus';
import { useUsers } from '../../hooks/useUsers';
import { useBoard } from '../../hooks/useBoard';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Dialog';
import { QueryError } from '../../components/ui/QueryError';
import { Skeleton } from '../../components/ui/Skeleton';
import { ItemPanel } from '../../board/ItemPanel';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { ContextPanel } from './ContextPanel';
import { ContextPicker } from './ContextPicker';
import { ConversationList } from './ConversationList';
import { EmptyChat } from './EmptyChat';
import { MessageList } from './MessageList';
import { useChat } from './useChat';
import { SLASH_COMMANDS } from './SlashMenu';

function contextFromParams(params: URLSearchParams): Partial<AiContext> {
  const boardId = Number(params.get('board') ?? 0);
  const itemId = Number(params.get('item') ?? 0);
  const docId = Number(params.get('doc') ?? 0);
  return {
    boardIds: boardId ? [boardId] : [],
    itemIds: itemId ? [itemId] : [],
    docIds: docId ? [docId] : [],
  };
}

export function AiPage() {
  const params = useParams();
  const conversationId = params.id ? Number(params.id) : null;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const toast = useToast();
  const ai = useAiStatus();
  const users = useUsers();
  const [draft, setDraft] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const draftKey = `tuesday:ai-draft:${conversationId ?? 'new'}`;
  const [contextOpen, setContextOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  );
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [itemId, setItemId] = useState(0);
  const creating = useRef(false);
  const sentInitial = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    try {
      setDraft(localStorage.getItem(draftKey) ?? '');
    } catch {}
  }, [draftKey]);

  function updateDraft(value: string) {
    setDraft(value);
    try {
      localStorage.setItem(draftKey, value);
    } catch {}
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const conversations = useQuery({
    queryKey: ['ai', 'conversations', search],
    queryFn: async () =>
      (
        await api<{ conversations: AiConversation[] }>(
          'GET',
          `/ai/conversations${search ? `?q=${encodeURIComponent(search)}` : ''}`,
        )
      ).conversations,
  });

  async function createConversation(context: Partial<AiContext>): Promise<number | null> {
    try {
      const data = await api<{ conversation: AiConversation }>('POST', '/ai/conversations', {
        context,
      });
      await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      return data.conversation.id;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (conversationId || creating.current) return;
    const hasContext =
      searchParams.has('board') || searchParams.has('item') || searchParams.has('doc');
    const q = searchParams.get('q');
    if (!hasContext || q) return;
    creating.current = true;
    void createConversation(contextFromParams(searchParams)).then((id) => {
      if (id) navigate(`/ai/${id}`, { replace: true });
      else creating.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, searchParams]);

  useEffect(() => {
    if (conversationId) creating.current = false;
  }, [conversationId]);

  const chat = useChat(conversationId, {
    context: contextFromParams(searchParams),
    onCreated: (id) => navigate(`/ai/${id}`, { replace: true }),
  });

  useEffect(() => {
    if (!conversationId || sentInitial.current) return;
    const q = searchParams.get('q');
    if (!q) return;
    sentInitial.current = true;
    navigate(`/ai/${conversationId}`, { replace: true });
    void chat.send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, searchParams]);

  useEffect(() => {
    if (conversationId || sentInitial.current) return;
    const q = searchParams.get('q');
    if (!q) return;
    sentInitial.current = true;
    void chat.send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, searchParams]);

  const conversation = chat.conversation;
  const context: AiContext = conversation?.context ?? {
    boardIds: [],
    itemIds: [],
    docIds: [],
  };

  const itemDetail = useQuery({
    queryKey: ['item', itemId],
    queryFn: () =>
      api<{ item: { id: number; name: string }; board: { id: number; name: string } }>(
        'GET',
        `/items/${itemId}`,
      ),
    enabled: itemId > 0,
  });
  const boardId = itemDetail.data?.board.id ?? 0;
  const board = useBoard(boardId);

  async function patchConversation(patch: Record<string, unknown>) {
    if (!conversationId) return;
    await api('PATCH', `/ai/conversations/${conversationId}`, patch);
    await qc.invalidateQueries({ queryKey: ['ai', 'conversation', conversationId] });
    await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
  }

  function openItem(id: number) {
    setItemId(id);
  }

  function exportChat() {
    if (!conversation) return;
    const lines = [
      `# ${conversation.title}`,
      '',
      `Exported from Tuesday AI on ${new Date().toLocaleString()}`,
      '',
      ...chat.messages.map((message) => {
        const who = message.role === 'user' ? (me.data?.user.name ?? 'You') : 'Tuesday AI';
        return `## ${who}\n\n${message.content}\n`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${conversation.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'tuesday-chat'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyChatLink() {
    if (!conversation) return;
    void navigator.clipboard
      .writeText(`${window.location.origin}/ai/${conversation.id}`)
      .then(() => toast.show('Chat link copied', 'success'))
      .catch(() => toast.show('Could not copy the link', 'error'));
  }

  function applyCommand(command: string) {
    const entry = SLASH_COMMANDS.find((candidate) => candidate.command === command);
    if (!entry) return;
    if (entry.command === '/notes') {
      updateDraft('/notes');
      return;
    }
    updateDraft(entry.prompt.replace('{text}', ''));
    window.dispatchEvent(new Event('tuesday:focus-ai-composer'));
  }

  const chatPane = (
    <div
      data-testid="ai-panel"
      className={`min-h-0 min-w-0 flex-col overflow-hidden ${conversationId ? 'flex' : 'hidden md:flex'}`}
    >
      {conversationId && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1 md:hidden">
          <Button size="sm" variant="ghost" data-testid="ai-back" onClick={() => navigate('/ai')}>
            <ArrowLeft size={14} /> Chats
          </Button>
        </div>
      )}
      {conversation && (
        <ChatHeader
          conversation={conversation}
          onRename={(title) => void patchConversation({ title })}
          onPin={() => void patchConversation({ pinned: !conversation.pinned })}
          onDelete={async () => {
            if (!window.confirm(`Delete "${conversation.title}"? This can't be undone.`)) return;
            await api('DELETE', `/ai/conversations/${conversation.id}`);
            await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
            navigate('/ai');
          }}
          onToggleContext={() => setContextOpen((open) => !open)}
          contextOpen={contextOpen}
          onOpenItem={openItem}
          onCopyLink={copyChatLink}
          onExport={exportChat}
        />
      )}
      {chat.detail.isError && (
        <QueryError onRetry={() => void chat.detail.refetch()} className="m-4" />
      )}
      <MessageList
        messages={chat.messages}
        user={me.data?.user}
        pendingUser={chat.pendingUser}
        streamText={chat.streamText}
        chips={chat.chips}
        streaming={chat.streaming}
        onOpenItem={openItem}
        onRegenerate={() => void chat.regenerate()}
        onDecide={(approve) => void chat.decide(approve)}
        onPrompt={(text) => void chat.send(text)}
      >
        {chat.detail.isLoading && (
          <div className="space-y-3 py-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {!chat.detail.isLoading &&
          chat.messages.length === 0 &&
          !chat.pendingUser &&
          !chat.streamText && (
            <EmptyChat
              usable={Boolean(ai.data?.usable)}
              isAdmin={me.data?.user.role === 'owner' || me.data?.user.role === 'admin'}
              onCommand={applyCommand}
            />
          )}
        {chat.error && (
          <div className="my-2 rounded-control border border-danger/30 bg-danger-soft/50 p-2.5">
            <p className="text-sm text-danger-text">{chat.error}</p>
            {conversationId && (
              <Button
                className="mt-2"
                size="sm"
                variant="secondary"
                disabled={chat.streaming}
                onClick={() => void chat.regenerate()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
      </MessageList>
      <Composer
        value={draft}
        onValueChange={updateDraft}
        onSend={() => {
          const text = draft;
          setDraft('');
          try {
            localStorage.removeItem(draftKey);
          } catch {}
          void chat.send(text);
        }}
        onStop={chat.stop}
        streaming={chat.streaming}
        disabled={!ai.data?.usable}
        conversationId={conversationId}
        context={context}
        onContextSaved={() =>
          void qc.invalidateQueries({ queryKey: ['ai', 'conversation', conversationId] })
        }
      />
    </div>
  );

  return (
    <div
      data-testid="ai-page"
      className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]"
    >
      <div className={`min-h-0 ${conversationId ? 'hidden md:block' : 'block'}`}>
        <ConversationList
          conversations={conversations.data ?? []}
          activeId={conversationId}
          query={searchInput}
          onQuery={setSearchInput}
          onNew={() => navigate('/ai')}
          onSelect={(id) => navigate(`/ai/${id}`)}
          onRename={(id, title) =>
            void api('PATCH', `/ai/conversations/${id}`, { title }).then(() =>
              qc.invalidateQueries({ queryKey: ['ai', 'conversations'] }),
            )
          }
          onPin={(id, pinned) =>
            void api('PATCH', `/ai/conversations/${id}`, { pinned }).then(() =>
              qc.invalidateQueries({ queryKey: ['ai', 'conversations'] }),
            )
          }
          onDelete={async (id) => {
            await api('DELETE', `/ai/conversations/${id}`);
            await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
            if (id === conversationId) navigate('/ai');
          }}
        />
      </div>
      {chatPane}
      {conversation && contextOpen && (
        <div className="hidden min-h-0 xl:block">
          <ContextPanel
            conversation={conversation}
            onRemove={(next) => void patchConversation({ context: next })}
            onAdd={() => setAddOpen(true)}
            onCommand={applyCommand}
            onOpenItem={openItem}
          />
        </div>
      )}
      {conversation && narrow && (
        <Drawer
          open={contextOpen && narrow}
          onOpenChange={setContextOpen}
          title="Context"
          width="ai"
          closeLabel="Close context"
        >
          <ContextPanel
            conversation={conversation}
            onRemove={(next) => void patchConversation({ context: next })}
            onAdd={() => setAddOpen(true)}
            onCommand={applyCommand}
            onOpenItem={openItem}
          />
        </Drawer>
      )}
      {conversation && (
        <ContextPicker
          open={addOpen}
          onOpenChange={setAddOpen}
          context={context}
          onSave={(next) => patchConversation({ context: next })}
        />
      )}
      {itemId > 0 && board.full && (
        <ItemPanel
          itemId={itemId}
          full={board.full}
          users={users.data?.byId ?? new Map()}
          onClose={() => setItemId(0)}
        />
      )}
    </div>
  );
}
