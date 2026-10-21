import { useState } from 'react';
import { Check, ChevronDown, Clipboard, FilePlus2, RefreshCw, Send, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import type { AiToolCallView, AiUiMessage } from '../../../../shared/ai';
import type { User } from '../../../../shared/types';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Logo } from '../../components/brand/Logo';
import { Markdown } from '../../components/ui/Markdown';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { MeetingNotesDialog } from '../MeetingNotesDialog';
import { RefChip } from './RefChip';

function MessageActions({
  message,
  isLastAssistant,
  onRegenerate,
}: {
  message: AiUiMessage;
  isLastAssistant: boolean;
  onRegenerate: () => void;
}) {
  const toast = useToast();
  const [notesOpen, setNotesOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);

  return (
    <div
      data-testid="ai-message-actions"
      className="mt-1 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
    >
      <Button
        size="sm"
        variant="ghost"
        icon={<Clipboard size={12} />}
        aria-label="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(message.content);
          toast.show('Copied', 'success');
        }}
      />
      {isLastAssistant && (
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw size={12} />}
          aria-label="Regenerate"
          onClick={onRegenerate}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={<FilePlus2 size={12} />}
        aria-label="Create items"
        onClick={() => setNotesOpen(true)}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<Send size={12} />}
        aria-label="Post as update"
        onClick={() => setPostOpen(true)}
      />
      <MeetingNotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        initialText={message.content}
      />
      <PostUpdateDialog open={postOpen} onOpenChange={setPostOpen} text={message.content} />
    </div>
  );
}

function PostUpdateDialog({
  open,
  onOpenChange,
  text,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: number; name: string; boardName: string }[]>([]);

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const data = await api<{ items: { id: number; name: string; boardName: string }[] }>(
      'GET',
      `/search?q=${encodeURIComponent(value.trim())}`,
    );
    setResults(data.items);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Post as update">
      <div className="space-y-2">
        <Input
          autoFocus
          value={query}
          onChange={(event) => void search(event.target.value)}
          placeholder="Search for an item…"
          aria-label="Search items"
        />
        <div className="max-h-64 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.id}
              className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-sunken"
              onClick={async () => {
                await api('POST', `/items/${item.id}/updates`, { body: text });
                toast.show('Posted', 'success');
                onOpenChange(false);
              }}
            >
              <span className="truncate text-ink">{item.name}</span>
              <span className="ml-auto t-meta text-muted">{item.boardName}</span>
            </button>
          ))}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="px-2 py-2 t-meta text-muted">No matching items.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function Message({
  message,
  showHeader,
  user,
  isLastAssistant,
  onOpenItem,
  onRegenerate,
  onDecide,
}: {
  message: AiUiMessage;
  showHeader: boolean;
  user?: User;
  isLastAssistant: boolean;
  onOpenItem: (itemId: number) => void;
  onRegenerate: () => void;
  onDecide: (approve: boolean) => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const isUser = message.role === 'user';
  const toolCalls = message.toolCalls;

  return (
    <div
      data-testid={isUser ? 'ai-message-user' : 'ai-message-assistant'}
      className="group flex gap-2.5 py-1"
    >
      <div className="w-8 shrink-0">
        {showHeader &&
          (isUser && user ? (
            <Avatar name={user.name} color={user.color} size={32} />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-ai-soft">
              <Logo collapsed />
            </span>
          ))}
      </div>
      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink">
              {isUser ? user?.name : 'Tuesday AI'}
            </span>
            <span className="t-meta text-muted">
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
          </div>
        )}
        {message.content && (
          <Markdown
            renderRef={(kind, id) => (
              <RefChip key={`${kind}-${id}`} kind={kind} id={id} onOpenItem={onOpenItem} />
            )}
          >
            {message.content}
          </Markdown>
        )}
        {!isUser && toolCalls.length > 0 && (
          <div className="mt-1">
            <button
              className="inline-flex items-center gap-1 t-meta text-muted hover:text-ink"
              onClick={() => setToolsOpen((open) => !open)}
            >
              <Check size={11} className="text-success" />
              Looked up {toolCalls.length} {toolCalls.length === 1 ? 'thing' : 'things'}
              <ChevronDown size={11} className={cn(toolsOpen && 'rotate-180')} />
            </button>
            {toolsOpen && (
              <div className="mt-1 space-y-0.5">
                {toolCalls.map((call) => (
                  <div key={call.id} className="t-meta text-muted">
                    {call.description}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {message.status === 'pending_approval' && toolCalls.length > 0 && (
          <ApprovalCard calls={toolCalls} onDecide={onDecide} />
        )}
        {!isUser && (
          <MessageActions
            message={message}
            isLastAssistant={isLastAssistant}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}

function ApprovalCard({
  calls,
  onDecide,
}: {
  calls: AiToolCallView[];
  onDecide: (approve: boolean) => void;
}) {
  return (
    <div data-testid="ai-approval" className="mt-2 rounded-[12px] border border-ai bg-ai-soft p-3">
      <p className="mb-2 text-sm font-medium text-ink">Approve these changes?</p>
      <div className="mb-3 space-y-1">
        {calls.map((call) => (
          <div key={call.id} className="flex items-start gap-1.5 t-meta text-ink">
            <Sparkles size={12} className="mt-0.5 shrink-0 text-ai" />
            {call.description}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onDecide(true)}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onDecide(false)}>
          Decline
        </Button>
      </div>
    </div>
  );
}

export function StreamingMessage({
  text,
  chips,
}: {
  text: string;
  chips: { id: string; description: string; status: 'running' | 'done' | 'error' }[];
}) {
  return (
    <div data-testid="ai-message-assistant" aria-live="polite" className="flex gap-2.5 py-1">
      <div className="w-8 shrink-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-ai-soft">
          <Logo collapsed />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ink">Tuesday AI</span>
          <span className="t-meta text-muted">now</span>
        </div>
        {text && <Markdown>{text}</Markdown>}
        {chips.map((chip) => (
          <div key={chip.id} className="mt-1 flex items-center gap-1 t-meta text-muted">
            {chip.status === 'running' ? (
              <Spinner size={11} />
            ) : chip.status === 'done' ? (
              <Check size={11} className="text-success" />
            ) : (
              <span className="text-danger-text">!</span>
            )}
            {chip.description}
          </div>
        ))}
        {!text && chips.length === 0 && (
          <div className="text-muted">
            <Spinner size={14} />
          </div>
        )}
      </div>
    </div>
  );
}
