export function renderTemplate(
  tpl: string,
  ctx: {
    itemName?: string;
    boardName?: string;
    actorName?: string;
    values?: Record<string, string>;
    updates?: string;
  },
): string {
  const values = new Map(
    Object.entries(ctx.values ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, raw: string) => {
    const token = raw.trim();
    const lower = token.toLowerCase();
    if (lower === 'name') return ctx.itemName ?? '';
    if (lower === 'board') return ctx.boardName ?? '';
    if (lower === 'user') return ctx.actorName ?? '';
    if (lower === 'updates') return ctx.updates ?? '';
    return values.get(lower) ?? '';
  });
}
