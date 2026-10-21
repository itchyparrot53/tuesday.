import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { openAi } from '../ai/openAi';

export function AskBox({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  return (
    <div
      data-testid="home-ask"
      className={`flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-2.5 focus-within:border-accent ${className ?? ''}`}
    >
      <Sparkles size={14} className="shrink-0 text-ai" />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && text.trim()) {
            openAi(navigate, { q: text.trim() });
            setText('');
          }
        }}
        placeholder="Ask Tuesday anything…"
        aria-label="Ask Tuesday anything"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}
