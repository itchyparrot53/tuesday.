import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText, LayoutDashboard, ListTodo } from 'lucide-react';
import type { KnowledgeHit } from '../../../shared/ai';
import type { SearchResult } from '../../../shared/types';
import { api } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { openAi } from '../ai/openAi';

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(
    `(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        words.some((word) => part.toLowerCase() === word.toLowerCase()) ? (
          <mark key={index} className="rounded-[3px] bg-accent-soft px-0.5 text-accent-soft-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const knowledge = useQuery({
    queryKey: ['knowledge', 'search', q],
    queryFn: () =>
      api<{ hits: KnowledgeHit[] }>('GET', `/knowledge/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
  });
  const classic = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<SearchResult>('GET', `/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
  });
  const hits = knowledge.data?.hits ?? [];
  const empty =
    q.length > 0 &&
    !knowledge.isLoading &&
    hits.length === 0 &&
    (classic.data?.items.length ?? 0) === 0 &&
    (classic.data?.boards.length ?? 0) === 0 &&
    (classic.data?.docs.length ?? 0) === 0;

  return (
    <div data-testid="search-page" className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader title="Search" description="Find items, boards, docs and what your team wrote." />
      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setParams({ q: draft.trim() });
        }}
      >
        <Input
          autoFocus
          aria-label="Search everything"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search everything…"
          className="max-w-[640px]"
        />
        <Button type="submit">Search</Button>
      </form>

      {empty && (
        <div className="rounded-[12px] border border-line p-6 text-center">
          <p className="text-sm text-muted">
            No results for "{q}". Try fewer words or ask Tuesday AI.
          </p>
          <Button className="mt-3" size="sm" onClick={() => openAi(navigate, { q })}>
            Ask Tuesday AI
          </Button>
        </div>
      )}

      {hits.length > 0 && (
        <section className="mb-6">
          <h2 className="t-section mb-2 text-ink">Best matches</h2>
          <div className="space-y-1">
            {hits.map((hit) => (
              <Link
                key={hit.chunkId}
                data-testid="search-hit"
                to={
                  hit.sourceKind === 'doc'
                    ? `/docs/${hit.docId}`
                    : `/boards/${hit.boardId}?item=${hit.itemId}`
                }
                className="block rounded-[8px] border border-line px-3 py-2 hover:bg-surface-2"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {hit.sourceKind === 'doc' ? <FileText size={13} /> : <ListTodo size={13} />}
                  {hit.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  <Highlight text={hit.snippet} query={q} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(classic.data?.items.length ?? 0) > 0 && (
        <section className="mb-6">
          <h2 className="t-section mb-2 text-ink">Items</h2>
          <div className="space-y-1">
            {classic.data!.items.map((item) => (
              <Link
                key={item.id}
                to={`/boards/${item.boardId}?item=${item.id}`}
                className="block rounded-[6px] px-2 py-1.5 text-sm text-ink hover:bg-surface-2"
              >
                {item.name} <span className="t-meta text-muted">· {item.boardName}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(classic.data?.boards.length ?? 0) > 0 && (
        <section className="mb-6">
          <h2 className="t-section mb-2 text-ink">Boards</h2>
          {classic.data!.boards.map((board) => (
            <Link
              key={board.id}
              to={`/boards/${board.id}`}
              className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-ink hover:bg-surface-2"
            >
              <LayoutDashboard size={13} /> {board.name}
            </Link>
          ))}
        </section>
      )}

      {(classic.data?.docs.length ?? 0) > 0 && (
        <section>
          <h2 className="t-section mb-2 text-ink">Docs</h2>
          {classic.data!.docs.map((doc) => (
            <Link
              key={doc.id}
              to={`/docs/${doc.id}`}
              className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-ink hover:bg-surface-2"
            >
              <FileText size={13} /> {doc.title}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
