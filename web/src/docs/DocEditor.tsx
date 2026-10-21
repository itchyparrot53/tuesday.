import { useRef } from 'react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';
import { WriteAssistMenu } from '../ai/WriteAssistMenu';

const ACTIONS = [
  { icon: Bold, before: '**', after: '**', label: 'Bold' },
  { icon: Italic, before: '_', after: '_', label: 'Italic' },
  { icon: Heading1, before: '# ', after: '', label: 'Heading 1' },
  { icon: Heading2, before: '## ', after: '', label: 'Heading 2' },
  { icon: List, before: '- ', after: '', label: 'Bulleted list' },
  { icon: ListOrdered, before: '1. ', after: '', label: 'Numbered list' },
  { icon: Quote, before: '> ', after: '', label: 'Quote' },
  { icon: Code, before: '`', after: '`', label: 'Code' },
  { icon: Link2, before: '[', after: '](https://)', label: 'Link' },
];

export function DocEditor({
  value,
  onChange,
  aiUsable,
  onExtract,
}: {
  value: string;
  onChange: (value: string) => void;
  aiUsable: boolean;
  onExtract: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after: string) {
    const element = ref.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + before.length, end + before.length);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 flex h-11 flex-wrap items-center gap-1 border-b border-line bg-surface pb-2">
        {ACTIONS.map(({ icon: Icon, before, after, label }) => (
          <button
            key={label}
            aria-label={label}
            title={label}
            className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
            onClick={() => wrap(before, after)}
          >
            <Icon size={14} />
          </button>
        ))}
        {aiUsable && (
          <>
            <span className="mx-1 h-4 w-px bg-line" />
            <WriteAssistMenu text={value} onReplace={onChange} disabled={!value.trim()} />
            <button className="ml-1 t-meta text-accent" onClick={onExtract}>
              Extract action items
            </button>
          </>
        )}
      </div>
      <textarea
        ref={ref}
        data-testid="doc-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[420px] w-full max-w-[72ch] flex-1 resize-none bg-transparent font-sans text-base leading-[1.7] text-ink outline-none"
        placeholder="Start writing…"
      />
    </div>
  );
}
