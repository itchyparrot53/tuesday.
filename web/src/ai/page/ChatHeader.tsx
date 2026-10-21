import { useState } from 'react';
import { Copy, Download, MoreHorizontal, PanelRight, Star } from 'lucide-react';
import type { AiConversation } from '../../../../shared/ai';
import { Button } from '../../components/ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/Menu';
import { RefChip } from './RefChip';

export function ChatHeader({
  conversation,
  onRename,
  onPin,
  onDelete,
  onToggleContext,
  contextOpen,
  onOpenItem,
  onCopyLink,
  onExport,
}: {
  conversation: AiConversation;
  onRename: (title: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onToggleContext: () => void;
  contextOpen: boolean;
  onOpenItem: (itemId: number) => void;
  onCopyLink: () => void;
  onExport: () => void;
}) {
  const contextCount =
    conversation.context.boardIds.length +
    conversation.context.itemIds.length +
    conversation.context.docIds.length;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);

  return (
    <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2">
      {editing ? (
        <input
          autoFocus
          data-testid="ai-chat-title"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.trim()) onRename(draft.trim());
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (draft.trim()) onRename(draft.trim());
              setEditing(false);
            }
            if (event.key === 'Escape') {
              setDraft(conversation.title);
              setEditing(false);
            }
          }}
          className="min-w-0 max-w-[320px] rounded-control border border-line-strong bg-surface px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-accent"
        />
      ) : (
        <button
          data-testid="ai-chat-title"
          className="min-w-0 max-w-[420px] truncate rounded-control px-1 py-0.5 t-section text-left text-ink hover:bg-sunken"
          title="Click to rename"
          onClick={() => {
            setDraft(conversation.title);
            setEditing(true);
          }}
        >
          {conversation.title}
        </button>
      )}
      <button
        aria-label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
        aria-pressed={conversation.pinned}
        className={`rounded-control p-1.5 hover:bg-sunken ${
          conversation.pinned ? 'text-accent' : 'text-muted'
        }`}
        onClick={onPin}
      >
        <Star size={15} fill={conversation.pinned ? 'currentColor' : 'none'} />
      </button>
      <div className="hidden min-w-0 items-center gap-1 lg:flex">
        {conversation.context.boardIds.map((id) => (
          <RefChip key={`b-${id}`} kind="board" id={id} />
        ))}
        {conversation.context.itemIds.map((id) => (
          <RefChip key={`i-${id}`} kind="item" id={id} onOpenItem={onOpenItem} />
        ))}
        {conversation.context.docIds.map((id) => (
          <RefChip key={`d-${id}`} kind="doc" id={id} />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Menu
          trigger={
            <Button size="sm" variant="ghost" aria-label="Conversation actions">
              <MoreHorizontal size={15} />
            </Button>
          }
        >
          <MenuItem
            onSelect={() => {
              setDraft(conversation.title);
              setEditing(true);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem onSelect={onCopyLink}>
            <span className="inline-flex items-center gap-2">
              <Copy size={13} /> Copy chat link
            </span>
          </MenuItem>
          <MenuItem onSelect={onExport}>
            <span className="inline-flex items-center gap-2">
              <Download size={13} /> Download transcript
            </span>
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={onDelete}>
            Delete
          </MenuItem>
        </Menu>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Toggle context panel"
          aria-pressed={contextOpen}
          onClick={onToggleContext}
          title={`Context (${contextCount})`}
        >
          <PanelRight size={15} />
          {contextCount > 0 && (
            <span className="rounded-chip bg-sunken px-1 t-meta text-muted">{contextCount}</span>
          )}
        </Button>
      </div>
    </div>
  );
}
