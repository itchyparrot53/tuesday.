import { useState } from 'react';
import { MoreHorizontal, Plus, Search, Sparkles, X } from 'lucide-react';
import { format, isToday, isYesterday, isWithinInterval, subDays } from 'date-fns';
import type { AiConversation } from '../../../../shared/ai';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/Menu';
import { cn } from '../../lib/cn';

function groupOf(conversation: AiConversation, now: Date): string {
  if (conversation.pinned) return 'Pinned';
  const date = new Date(conversation.updatedAt);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isWithinInterval(date, { start: subDays(now, 7), end: now })) return 'Previous 7 days';
  return 'Older';
}

export function ConversationList({
  conversations,
  activeId,
  query,
  onQuery,
  onNew,
  onSelect,
  onRename,
  onPin,
  onDelete,
}: {
  conversations: AiConversation[];
  activeId: number | null;
  query: string;
  onQuery: (value: string) => void;
  onNew: () => void;
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onPin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const now = new Date();
  const order = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];
  const grouped = new Map<string, AiConversation[]>();
  for (const conversation of conversations) {
    const group = groupOf(conversation, now);
    grouped.set(group, [...(grouped.get(group) ?? []), conversation]);
  }

  return (
    <div data-testid="ai-conversation-list" className="flex h-full min-h-0 flex-col bg-surface-2">
      <div className="space-y-2 p-3">
        <button
          data-testid="ai-new-chat"
          className="flex h-9 w-full items-center gap-2 rounded-control bg-accent px-3 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
          onClick={onNew}
        >
          <Plus size={15} /> New chat
          <span className="ml-auto t-meta text-accent-ink">⌘J</span>
        </button>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-8 w-full rounded-control border border-line bg-surface pl-7 pr-7 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          {query && (
            <button
              aria-label="Clear chat search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-control p-0.5 text-muted hover:bg-sunken hover:text-ink"
              onClick={() => onQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {order.map((group) => {
          const rows = grouped.get(group);
          if (!rows?.length) return null;
          return (
            <div key={group} className="mb-2">
              <p className="px-2 pb-1 t-label text-muted">{group}</p>
              {rows.map((conversation) => (
                <div
                  key={conversation.id}
                  data-testid="ai-conversation-row"
                  data-id={conversation.id}
                  className={cn(
                    'group relative flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5',
                    activeId === conversation.id
                      ? 'bg-accent-soft text-accent-soft-ink before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[3px] before:rounded-full before:bg-accent'
                      : 'text-ink hover:bg-sunken',
                  )}
                  onClick={() => editing !== conversation.id && onSelect(conversation.id)}
                >
                  <Sparkles size={13} className="shrink-0 text-ai" />
                  <div className="min-w-0 flex-1">
                    {editing === conversation.id ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            onRename(conversation.id, draft.trim() || conversation.title);
                            setEditing(null);
                          }
                          if (event.key === 'Escape') setEditing(null);
                        }}
                        onBlur={() => {
                          if (draft.trim()) onRename(conversation.id, draft.trim());
                          setEditing(null);
                        }}
                        className="w-full rounded-[4px] border border-line bg-surface px-1 text-sm text-ink outline-none"
                      />
                    ) : (
                      <p className="truncate text-sm font-medium">{conversation.title}</p>
                    )}
                    <p className="truncate t-meta text-muted">
                      {conversation.preview || 'No messages yet'}
                    </p>
                  </div>
                  <span className="shrink-0 t-meta text-muted">
                    {format(
                      new Date(conversation.updatedAt),
                      isToday(new Date(conversation.updatedAt)) ? 'HH:mm' : 'd MMM',
                    )}
                  </span>
                  <Menu
                    trigger={
                      <button
                        aria-label={`Actions for ${conversation.title}`}
                        className="rounded-control p-0.5 text-muted opacity-0 hover:bg-sunken focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    }
                  >
                    <MenuItem
                      onSelect={() => {
                        setDraft(conversation.title);
                        setEditing(conversation.id);
                      }}
                    >
                      Rename
                    </MenuItem>
                    <MenuItem onSelect={() => onPin(conversation.id, !conversation.pinned)}>
                      {conversation.pinned ? 'Unpin' : 'Pin'}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      danger
                      onSelect={() => {
                        if (
                          window.confirm(`Delete "${conversation.title}"? This can't be undone.`)
                        ) {
                          onDelete(conversation.id);
                        }
                      }}
                    >
                      Delete
                    </MenuItem>
                  </Menu>
                </div>
              ))}
            </div>
          );
        })}
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center t-meta text-muted">
            {query ? 'No chats match that search.' : 'No chats yet. Start one above.'}
          </p>
        )}
      </div>
    </div>
  );
}
