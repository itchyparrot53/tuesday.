import { Markdown } from '../components/ui/Markdown';
import { RefChip } from '../ai/page/RefChip';

export function DocPreview({ content }: { content: string }) {
  const prepared = content
    .replace(/^(\s*)- \[ \] /gm, '$1- ☐ ')
    .replace(/^(\s*)- \[x\] /gim, '$1- ☑ ');
  const parts = prepared.split(/(\[\[item:\d+\]\])/g);
  return (
    <div data-testid="doc-preview" className="max-w-[72ch] text-base leading-7">
      {parts.map((part, index) => {
        const match = part.match(/^\[\[item:(\d+)\]\]$/);
        if (match) return <RefChip key={index} kind="item" id={Number(match[1])} />;
        return <Markdown key={index}>{part}</Markdown>;
      })}
    </div>
  );
}
