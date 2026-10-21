import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PALETTE } from '../../../shared/columns';
import { uploadFile } from '../lib/upload';
import { renderMentions } from '../lib/mentions';
import { relative } from '../lib/format';
import { useUsers } from '../hooks/useUsers';
import { useMe } from '../hooks/useMe';
import { useAiStatus } from '../hooks/useAiStatus';
import { WriteAssistMenu } from '../ai/WriteAssistMenu';
import { Button } from '../components/ui/Button';
import { AtSign, Paperclip } from 'lucide-react';
import { Markdown } from '../components/ui/Markdown';
import { Avatar } from '../components/ui/Avatar';
import { useToast } from '../components/ui/Toast';
import type { Update, User } from '../../../shared/types';

function UpdateRow({
  update,
  author,
  me,
  files,
  editing,
  editBody,
  setEditing,
  setEditBody,
  onSaveEdit,
  onRemove,
  replyTo,
  replyBody,
  setReplyTo,
  setReplyBody,
  posting,
  onPostReply,
  replies,
}: {
  update: Update;
  author: (id: number | null) => User | undefined;
  me: User | undefined;
  files: { id: number; updateId: number | null; filename: string; url: string }[];
  editing: number | null;
  editBody: string;
  setEditing: (id: number | null) => void;
  setEditBody: (body: string) => void;
  onSaveEdit: (update: Update) => void;
  onRemove: (update: Update) => void;
  replyTo: number | null;
  replyBody: string;
  setReplyTo: (id: number | null) => void;
  setReplyBody: (body: string) => void;
  posting: boolean;
  onPostReply: (body: string, parentId: number) => void;
  replies: Update[];
}) {
  const user = author(update.authorId);
  const mine = update.authorId === me?.id;
  return (
    <div className="border-b border-line pb-4 last:border-0">
      <div className="mb-1.5 flex items-center gap-2">
        {update.authorKind === 'ai' ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ai-soft t-meta font-semibold text-ai">
            AI
          </span>
        ) : (
          <Avatar name={user?.name ?? 'Unknown'} color={user?.color ?? PALETTE[7]} size={32} />
        )}
        <span className="text-sm font-semibold text-ink">
          {update.authorKind === 'ai' ? 'Tuesday AI' : (user?.name ?? 'Unknown')}
        </span>
        {update.authorKind === 'ai' && (
          <span className="rounded-chip bg-ai-soft px-1.5 t-meta font-semibold text-ai">AI</span>
        )}
        <span className="t-meta text-muted">{relative(update.createdAt)}</span>
        {update.editedAt && <span className="t-meta text-muted">(edited)</span>}
        <div className="ml-auto flex gap-2">
          {mine && (
            <button
              className="t-meta text-muted hover:text-ink"
              onClick={() => {
                setEditing(update.id);
                setEditBody(update.body);
              }}
            >
              Edit
            </button>
          )}
          {(mine || me?.role === 'owner' || me?.role === 'admin') && (
            <button
              className="t-meta text-muted hover:text-danger"
              onClick={() => onRemove(update)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {editing === update.id ? (
        <div>
          <textarea
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            rows={3}
            className="mb-2 w-full rounded-control border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSaveEdit(update)}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div data-testid="update-body">
          <Markdown>{renderMentions(update.body)}</Markdown>
          {files
            .filter((file) => file.updateId === update.id)
            .map((file) => (
              <a
                key={file.id}
                href={`${file.url}?download=1`}
                className="mt-1 block t-meta text-accent hover:underline"
              >
                📎 {file.filename}
              </a>
            ))}
        </div>
      )}
      {update.parentId === null && (
        <button
          className="mt-2 t-meta text-muted hover:text-ink"
          onClick={() => {
            setReplyTo(replyTo === update.id ? null : update.id);
            setReplyBody('');
          }}
        >
          Reply
        </button>
      )}
      {replyTo === update.id && (
        <div className="mt-2">
          <textarea
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                onPostReply(replyBody, update.id);
              }
            }}
            rows={2}
            placeholder="Write a reply…"
            className="mb-1 w-full rounded-control border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <Button size="sm" loading={posting} onClick={() => onPostReply(replyBody, update.id)}>
              Reply
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setReplyTo(null)}>
              Cancel
            </Button>
            <span className="ml-auto self-center t-meta text-muted">⌘Enter</span>
          </div>
        </div>
      )}
      {replies.map((reply) => {
        const replyUser = author(reply.authorId);
        return (
          <div key={reply.id} className="ml-10 mt-3 border-l border-line pl-4">
            <div className="mb-1 flex items-center gap-2">
              <Avatar
                name={replyUser?.name ?? 'Unknown'}
                color={replyUser?.color ?? PALETTE[7]}
                size={24}
              />
              <span className="text-sm font-semibold">{replyUser?.name}</span>
              <span className="t-meta text-muted">{relative(reply.createdAt)}</span>
            </div>
            <div data-testid="update-body">
              <Markdown>{renderMentions(reply.body)}</Markdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UpdatesThread({
  itemId,
  boardId,
  updates,
}: {
  itemId: number;
  boardId: number;
  updates: Update[];
}) {
  const me = useMe();
  const users = useUsers();
  const qc = useQueryClient();
  const toast = useToast();
  const ai = useAiStatus();
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const files = useQuery({
    queryKey: ['files', itemId],
    queryFn: async () =>
      (
        await api<{
          files: { id: number; updateId: number | null; filename: string; url: string }[];
        }>('GET', `/items/${itemId}/files`)
      ).files,
  });
  const textarea = useRef<HTMLTextAreaElement>(null);

  const author = (id: number | null): User | undefined =>
    id ? users.data?.byId.get(id) : undefined;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['item', itemId] });
    await qc.invalidateQueries({ queryKey: ['items', boardId] });
  }

  async function post(text: string, parentId?: number) {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const text_ = text.trim() || (attachments.length ? '📎 Attached files' : '');
      if (!text_) return;
      setUploading(true);
      const response = await api<{ update: { id: number } }>('POST', `/items/${itemId}/updates`, {
        body: text_,
        ...(parentId ? { parentId } : {}),
      });
      for (const file of attachments) {
        await uploadFile(itemId, file, { updateId: response.update.id });
      }
      setAttachments([]);
      await refresh();
      await qc.invalidateQueries({ queryKey: ['files', itemId] });
      if (parentId) {
        setReplyBody('');
        setReplyTo(null);
      } else {
        setBody('');
      }
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setPosting(false);
      setUploading(false);
    }
  }

  async function saveEdit(update: Update) {
    try {
      await api('PATCH', `/updates/${update.id}`, { body: editBody.trim() });
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  async function remove(update: Update) {
    try {
      await api('DELETE', `/updates/${update.id}`);
      await refresh();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  function onChangeBody(value: string, target: HTMLTextAreaElement) {
    setBody(value);
    const upto = value.slice(0, target.selectionStart ?? value.length);
    const at = upto.lastIndexOf('@');
    if (at >= 0 && !/\s/.test(upto.slice(at + 1))) {
      setMentionQuery(upto.slice(at + 1));
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(user: User) {
    const el = textarea.current;
    const value = body;
    const upto = el ? value.slice(0, el.selectionStart ?? value.length) : value;
    const at = upto.lastIndexOf('@');
    const next =
      at >= 0
        ? `${value.slice(0, at)}@[${user.name}](user:${user.id}) ${value.slice(el?.selectionStart ?? value.length)}`
        : `${value}@[${user.name}](user:${user.id}) `;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  const mentionMatches =
    mentionQuery !== null
      ? [...(users.data?.users ?? [])]
          .filter(
            (user) => user.isActive && user.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6)
      : [];

  const top = updates.filter((u) => u.parentId === null);

  return (
    <div className="space-y-3">
      <div className="relative rounded-pop border border-line bg-surface p-3">
        <textarea
          ref={textarea}
          data-testid="update-composer"
          value={body}
          onChange={(e) => onChangeBody(e.target.value, e.target)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post(body);
          }}
          rows={3}
          placeholder="Write an update. Type @ to mention someone."
          className="w-full resize-y bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        {mentionMatches.length > 0 && (
          <div className="absolute left-2 top-[calc(100%+4px)] z-20 w-[240px] rounded-pop border border-line bg-surface p-1.5 shadow-pop">
            {mentionMatches.map((user) => (
              <button
                key={user.id}
                className="flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-sm text-ink hover:bg-sunken"
                onClick={() => insertMention(user)}
              >
                <Avatar name={user.name} color={user.color} size={20} />
                {user.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
          <div className="flex items-center gap-2">
            {ai.data?.usable && (
              <WriteAssistMenu text={body} onReplace={setBody} disabled={!body.trim()} />
            )}
            <button
              type="button"
              aria-label="Mention someone"
              title="Mention someone"
              className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
              onClick={() => {
                setBody((current) => `${current}@`);
                requestAnimationFrame(() => textarea.current?.focus());
              }}
            >
              <AtSign size={14} />
            </button>
            <label className="cursor-pointer rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink">
              <Paperclip size={14} />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(event) =>
                  setAttachments((current) => [...current, ...Array.from(event.target.files ?? [])])
                }
              />
            </label>
            {attachments.map((file) => (
              <span key={file.name} className="max-w-[120px] truncate t-meta text-muted">
                {file.name}
              </span>
            ))}
            {uploading && <span className="t-meta text-muted">Uploading…</span>}
          </div>
          <Button
            size="sm"
            loading={posting}
            disabled={!body.trim() && attachments.length === 0}
            onClick={() => post(body)}
          >
            Post
          </Button>
        </div>
      </div>

      {top.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">
          No updates yet. Start the conversation.
        </p>
      )}
      {top.map((update) => (
        <UpdateRow
          key={update.id}
          update={update}
          author={author}
          me={me.data?.user}
          files={files.data ?? []}
          editing={editing}
          editBody={editBody}
          setEditing={setEditing}
          setEditBody={setEditBody}
          onSaveEdit={saveEdit}
          onRemove={remove}
          replyTo={replyTo}
          replyBody={replyBody}
          setReplyTo={setReplyTo}
          setReplyBody={setReplyBody}
          posting={posting}
          onPostReply={post}
          replies={updates.filter((reply) => reply.parentId === update.id)}
        />
      ))}
    </div>
  );
}
