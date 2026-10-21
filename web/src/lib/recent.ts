export interface RecentItem {
  kind: 'board' | 'doc' | 'dashboard';
  id: number;
  name: string;
  workspaceName?: string;
}

const KEY = 'tuesday:recent';

export function listRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentItem[];
  } catch {
    return [];
  }
}

export function rememberRecent(item: RecentItem): void {
  try {
    const next = [
      item,
      ...listRecent().filter((entry) => entry.kind !== item.kind || entry.id !== item.id),
    ].slice(0, 8);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
