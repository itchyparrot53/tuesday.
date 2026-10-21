import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import type { AiUiMessage } from '../../../../shared/ai';
import type { User } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Message, StreamingMessage } from './Message';

function dayLabel(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE d MMMM');
}

export function MessageList({
  messages,
  user,
  pendingUser,
  streamText,
  chips,
  streaming,
  onOpenItem,
  onRegenerate,
  onDecide,
  onPrompt,
  children,
}: {
  messages: AiUiMessage[];
  user?: User;
  pendingUser: string | null;
  streamText: string;
  chips: { id: string; description: string; status: 'running' | 'done' | 'error' }[];
  streaming: boolean;
  onOpenItem: (itemId: number) => void;
  onRegenerate: () => void;
  onDecide: (approve: boolean) => void;
  onPrompt?: (text: string) => void;
  children?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  function scrollToBottom() {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }

  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [messages.length, pendingUser, streamText, chips.length, atBottom]);

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        className="h-full overflow-y-auto px-6 py-4 max-md:px-4"
        onScroll={(event) => {
          const element = event.currentTarget;
          setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 60);
        }}
      >
        <div className="mx-auto max-w-[760px]">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay =
              !previous ||
              new Date(previous.createdAt).toDateString() !==
                new Date(message.createdAt).toDateString();
            const grouped =
              previous &&
              previous.role === message.role &&
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                5 * 60 * 1000;
            return (
              <div key={message.id}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="t-label text-muted">{dayLabel(message.createdAt)}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <Message
                  message={message}
                  showHeader={!grouped}
                  user={user}
                  isLastAssistant={lastAssistant?.id === message.id && !streaming}
                  onOpenItem={onOpenItem}
                  onRegenerate={onRegenerate}
                  onDecide={onDecide}
                />
              </div>
            );
          })}
          {pendingUser && (
            <div data-testid="ai-message-user" className="flex gap-2.5 py-1">
              <div className="w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-ink">{user?.name}</span>
                  <span className="t-meta text-muted">now</span>
                </div>
                <p className="whitespace-pre-wrap text-[var(--text-base)] text-ink">
                  {pendingUser}
                </p>
              </div>
            </div>
          )}
          {(streaming || streamText || chips.length > 0) && (
            <StreamingMessage text={streamText} chips={chips} />
          )}
          {!streaming &&
            onPrompt &&
            messages.length > 0 &&
            messages[messages.length - 1]?.role === 'assistant' && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[
                  ['Summarize this', 'Summarize this conversation in three bullets.'],
                  ['What should I do next?', 'What should I do next? Be specific and brief.'],
                  ['Find related items', 'Find the most related items to this conversation.'],
                ].map(([label, prompt]) => (
                  <button
                    key={label}
                    className="rounded-full border border-line bg-surface px-2 py-1 t-meta text-muted hover:border-line-strong hover:text-ink"
                    onClick={() => onPrompt(prompt)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          {children}
        </div>
      </div>
      {!atBottom && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-pop"
          onClick={() => {
            setAtBottom(true);
            scrollToBottom();
          }}
        >
          Jump to latest
        </Button>
      )}
    </div>
  );
}
