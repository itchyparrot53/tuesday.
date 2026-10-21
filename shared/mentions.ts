export const MENTION_RE = /@\[([^\]]+)\]\(user:(\d+)\)/g;

export function extractMentionIds(body: string): number[] {
  const ids = new Set<number>();
  for (const match of body.matchAll(MENTION_RE)) {
    const id = Number(match[2]);
    if (Number.isInteger(id)) ids.add(id);
  }
  return [...ids];
}
