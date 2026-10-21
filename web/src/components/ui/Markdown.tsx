import { cloneElement, isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type RefKind = 'item' | 'board' | 'doc';
export type RenderRef = (kind: RefKind, id: number, key: string) => ReactNode;

const REF = /\[\[(item|board|doc):(\d+)\]\]/g;

export function renderWithRefs(node: ReactNode, renderRef?: RenderRef): ReactNode {
  if (!renderRef) return node;
  if (typeof node === 'string') {
    const parts: ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    REF.lastIndex = 0;
    while ((match = REF.exec(node))) {
      if (match.index > last) parts.push(node.slice(last, match.index));
      parts.push(
        renderRef(match[1] as RefKind, Number(match[2]), `${match[1]}-${match[2]}-${match.index}`),
      );
      last = match.index + match[0].length;
    }
    if (!parts.length) return node;
    if (last < node.length) parts.push(node.slice(last));
    return parts;
  }
  if (Array.isArray(node)) return node.map((child, index) => renderWithRefs(child, renderRef));
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, { children: renderWithRefs(node.props.children, renderRef) });
  }
  return node;
}

export function Markdown({ children, renderRef }: { children: string; renderRef?: RenderRef }) {
  return (
    <div className="max-w-[72ch] space-y-3 text-[var(--text-base)] leading-[1.6] [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_code]:rounded-control [&_code]:bg-sunken [&_code]:px-1 [&_h1]:font-display [&_h1]:text-[24px] [&_h1]:font-[650] [&_h2]:font-display [&_h2]:text-[19px] [&_h2]:font-semibold [&_h3]:font-display [&_h3]:text-[16px] [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:whitespace-pre-wrap [&_pre]:overflow-auto [&_pre]:rounded-[8px] [&_pre]:bg-sunken [&_pre]:p-3 [&_input[type=checkbox]]:mr-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: linkChildren, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {linkChildren}
            </a>
          ),
          p: ({ children: text }) => <p>{renderWithRefs(text, renderRef)}</p>,
          li: ({ children: text }) => <li>{renderWithRefs(text, renderRef)}</li>,
          td: ({ children: text }) => <td>{renderWithRefs(text, renderRef)}</td>,
          strong: ({ children: text }) => <strong>{renderWithRefs(text, renderRef)}</strong>,
          em: ({ children: text }) => <em>{renderWithRefs(text, renderRef)}</em>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
