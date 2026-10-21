import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Trash2 } from 'lucide-react';
import type { BoardAccess, BoardMember } from '../../../shared/types';
import { api } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ui/Toast';

const ACCESS_LABEL: Record<string, string> = {
  manage: 'Can manage',
  edit: 'Can edit',
  comment: 'Can comment',
  view: 'Can view',
};

export function ShareDialog({
  boardId,
  open,
  onOpenChange,
  isPrivate,
  onChanged,
}: {
  boardId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPrivate: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useUsers();
  const [search, setSearch] = useState('');
  const [guestAccess, setGuestAccess] = useState<'view' | 'comment' | 'edit'>('view');
  const members = useQuery({
    queryKey: ['board-members', boardId],
    queryFn: () =>
      api<{ isPrivate: boolean; members: BoardMember[] }>('GET', `/boards/${boardId}/members`),
    enabled: open,
  });

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['board-members', boardId] });
    await qc.invalidateQueries({ queryKey: ['board', boardId] });
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
    await qc.invalidateQueries({ queryKey: ['home'] });
    onChanged();
  }

  async function setPrivacy(next: boolean) {
    await api('PATCH', `/boards/${boardId}/privacy`, { isPrivate: next });
    await refresh();
  }

  async function setAccess(userId: number, access: BoardAccess) {
    await api('PUT', `/boards/${boardId}/members/${userId}`, { access });
    await refresh();
  }

  async function remove(userId: number) {
    if (!window.confirm('Remove this person from the board?')) return;
    await api('DELETE', `/boards/${boardId}/members/${userId}`);
    await refresh();
  }

  async function add(userId: number) {
    await setAccess(userId, 'view');
    setSearch('');
  }

  async function inviteGuest() {
    const email = search.trim();
    if (!email.includes('@')) return;
    try {
      await api('POST', `/boards/${boardId}/guests`, { email, access: guestAccess });
      toast.show('Guest invite sent', 'success');
      setSearch('');
      await refresh();
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  }

  const current = members.data?.members ?? [];
  const memberIds = new Set(current.map((member) => member.userId));
  const suggestions = (users.data?.users ?? [])
    .filter((user) => !memberIds.has(user.id))
    .filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share board" wide>
      <div data-testid="share-dialog" className="space-y-4">
        <div>
          <p className="t-label mb-1.5 text-ink">Who can see this board</p>
          <div data-testid="share-privacy" className="inline-flex rounded-control bg-sunken p-0.5">
            <button
              className={`rounded-[6px] px-3 py-1 text-sm font-semibold ${
                !isPrivate ? 'bg-surface text-ink shadow-pop' : 'text-muted'
              }`}
              onClick={() => void setPrivacy(false)}
            >
              Workspace
            </button>
            <button
              className={`flex items-center gap-1 rounded-[6px] px-3 py-1 text-sm font-semibold ${
                isPrivate ? 'bg-surface text-ink shadow-pop' : 'text-muted'
              }`}
              onClick={() => void setPrivacy(true)}
            >
              <Lock size={12} /> Private only
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {current.map((member) => (
            <div
              key={`${member.source}-${member.userId}`}
              data-testid="share-member-row"
              className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-sunken"
            >
              {member.source === 'workspace' ? (
                <span className="h-6 w-6 rounded-full bg-sunken" />
              ) : (
                <Avatar name={member.name} color={member.color} size={24} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm text-ink">
                  {member.name}
                  {member.isGuest && (
                    <span data-testid="guest-badge">
                      <Badge tone="neutral">Guest</Badge>
                    </span>
                  )}
                </span>
                {member.email && (
                  <span className="block truncate t-meta text-muted">{member.email}</span>
                )}
              </span>
              {member.source === 'workspace' ||
              member.source === 'admin' ||
              member.source === 'creator' ? (
                <span className="t-meta text-muted">
                  {member.source === 'workspace' ? 'Everyone' : ACCESS_LABEL[member.access]}
                </span>
              ) : (
                <Select
                  ariaLabel={`Access for ${member.name}`}
                  testId="share-access"
                  value={member.access}
                  onChange={(value) => void setAccess(member.userId, value as BoardAccess)}
                  options={
                    member.isGuest
                      ? [
                          { value: 'view', label: 'Can view' },
                          { value: 'comment', label: 'Can comment' },
                          { value: 'edit', label: 'Can edit' },
                        ]
                      : [
                          { value: 'view', label: 'Can view' },
                          { value: 'comment', label: 'Can comment' },
                          { value: 'edit', label: 'Can edit' },
                          { value: 'manage', label: 'Can manage' },
                        ]
                  }
                  size="sm"
                />
              )}
              {member.source === 'member' && (
                <button
                  aria-label={`Remove ${member.name}`}
                  className="rounded-control p-1 text-muted hover:bg-surface hover:text-danger-text"
                  onClick={() => void remove(member.userId)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div>
          <Input
            data-testid="share-add"
            aria-label="Add people or guests by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Add people or guests by name or email"
          />
          <div className="mt-1 space-y-0.5">
            {suggestions.map((user) => (
              <button
                key={user.id}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1 text-left text-sm hover:bg-sunken"
                onClick={() => void add(user.id)}
              >
                <Avatar name={user.name} color={user.color} size={20} />
                <span className="min-w-0 flex-1 truncate text-ink">{user.name}</span>
                <span className="t-meta text-muted">{user.email}</span>
              </button>
            ))}
            {search.includes('@') && !suggestions.some((user) => user.email === search.trim()) && (
              <div className="flex items-center gap-2 rounded-control bg-surface-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  Invite {search.trim()} as a guest
                </span>
                <Select
                  ariaLabel="Guest access"
                  testId="share-guest-access"
                  value={guestAccess}
                  onChange={(value) => setGuestAccess(value as typeof guestAccess)}
                  options={[
                    { value: 'view', label: 'Can view' },
                    { value: 'comment', label: 'Can comment' },
                    { value: 'edit', label: 'Can edit' },
                  ]}
                  size="sm"
                />
                <Button size="sm" onClick={() => void inviteGuest()}>
                  Invite
                </Button>
              </div>
            )}
          </div>
        </div>
        {isPrivate && <p className="t-meta text-muted">Admins can always see private boards.</p>}
      </div>
    </Dialog>
  );
}
