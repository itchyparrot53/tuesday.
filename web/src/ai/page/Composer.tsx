import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, Send, Square } from 'lucide-react';
import type { AiContext } from '../../../../shared/ai';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { MeetingNotesDialog } from '../MeetingNotesDialog';
import { ContextPicker } from './ContextPicker';
import { SLASH_COMMANDS, SlashMenu } from './SlashMenu';

export function Composer({
  value,
  onValueChange,
  onSend,
  onStop,
  streaming,
  disabled,
  conversationId,
  context,
  onContextSaved,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  conversationId: number | null;
  context: AiContext;
  onContextSaved: (context: AiContext) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const slash = value.startsWith('/') && !value.includes('\n');
  const menuOpen =
    slash &&
    SLASH_COMMANDS.some((command) =>
      `${command.command} ${command.label}`.toLowerCase().includes(value.toLowerCase()),
    );

  useEffect(() => {
    function focus() {
      textarea.current?.focus();
    }
    window.addEventListener('tuesday:focus-ai-composer', focus);
    requestAnimationFrame(focus);
    return () => window.removeEventListener('tuesday:focus-ai-composer', focus);
  }, [conversationId]);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(8, Math.max(1, element.scrollHeight / 21)) * 21 + 16}px`;
  }, [value]);

  function pick(command: (typeof SLASH_COMMANDS)[number]) {
    if (command.command === '/notes') {
      setNotesOpen(true);
      onValueChange('');
      return;
    }
    const rest = value.slice(command.command.length).trim();
    const prompt = command.prompt.replace('{text}', rest || '{text}');
    onValueChange(prompt);
    setSelected(0);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      const matches = SLASH_COMMANDS.filter((command) =>
        `${command.command} ${command.label}`.toLowerCase().includes(value.toLowerCase()),
      );
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((current) => (current + 1) % matches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((current) => (current - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onValueChange('');
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        pick(matches[selected] ?? matches[0]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  return (
    <div className="border-t border-line p-3">
      <div className="relative mx-auto max-w-[760px]">
        {menuOpen && <SlashMenu filter={value} selected={selected} onPick={pick} />}
        <div className="rounded-dialog border border-line-strong bg-surface p-2 focus-within:border-accent">
          <textarea
            ref={textarea}
            data-testid="ai-composer"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? 'AI is not set up' : 'Message Tuesday AI…  / for commands'}
            className="max-h-[184px] w-full resize-none bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <div className="mt-1 flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={<Paperclip size={13} />}
              disabled={!conversationId || disabled}
              onClick={() => setPickerOpen(true)}
            >
              Context
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                onValueChange(value ? `${value} /` : '/');
                textarea.current?.focus();
              }}
            >
              /
            </Button>
            <span className="ml-auto t-meta text-muted">Enter to send</span>
            {streaming ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="ai-stop"
                icon={<Square size={12} />}
                onClick={onStop}
              >
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<Send size={12} />}
                disabled={disabled || !value.trim()}
                onClick={onSend}
                aria-label="Send"
              >
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
      <ContextPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        context={context}
        onSave={async (next) => {
          if (!conversationId) return;
          await api('PATCH', `/ai/conversations/${conversationId}`, { context: next });
          onContextSaved(next);
          await qc.invalidateQueries({ queryKey: ['ai', 'conversation', conversationId] });
          toast.show('Context updated', 'success');
        }}
      />
      <MeetingNotesDialog open={notesOpen} onOpenChange={setNotesOpen} />
    </div>
  );
}
