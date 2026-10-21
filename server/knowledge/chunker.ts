import { createHash } from 'node:crypto';
import { cellToText, type CellValue, type ColumnType } from '../../shared/columns';
import type { Column, Item } from '../../shared/types';

export interface Chunk {
  index: number;
  title: string;
  text: string;
  hash: string;
}

const MAX = 1500;
const OVERLAP = 200;
const SKIP: ColumnType[] = ['file', 'ai', 'formula', 'mirror'];

export function hashChunk(title: string, text: string): string {
  return createHash('sha256').update(`${title}\n${text}`).digest('hex');
}

export function splitText(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= MAX) return clean ? [clean] : [];
  const parts: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + MAX);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end));
      if (boundary > start + MAX / 2) end = boundary + 1;
    }
    parts.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - OVERLAP);
  }
  return parts.filter(Boolean);
}

function chunks(title: string, text: string): Chunk[] {
  return splitText(text).map((part, index) => ({
    index,
    title,
    text: part,
    hash: hashChunk(title, part),
  }));
}

export function chunkItem(input: {
  item: Item;
  boardName: string;
  groupName: string;
  columns: Column[];
  userNames: Map<number, string>;
}): Chunk[] {
  const lines = [
    `Item: ${input.item.name}`,
    `Board: ${input.boardName}`,
    `Group: ${input.groupName}`,
  ];
  for (const column of input.columns) {
    if (SKIP.includes(column.type)) continue;
    const text = cellToText(
      column.type,
      column.settings,
      input.item.values[String(column.id)] as CellValue | undefined,
      (id) => input.userNames.get(id) ?? '',
    );
    if (text) lines.push(`${column.title}: ${text}`);
  }
  return chunks(`${input.item.name} — ${input.boardName}`, lines.join('\n'));
}

export function chunkUpdate(input: {
  itemName: string;
  boardName: string;
  authorName: string;
  body: string;
  createdAt: string;
}): Chunk[] {
  const date = input.createdAt.slice(0, 10);
  return chunks(
    `Update on ${input.itemName} — ${input.boardName}`,
    `${input.authorName}, ${date}: ${input.body}`,
  );
}

export function chunkDoc(input: { title: string; content: string }): Chunk[] {
  const result: Chunk[] = [];
  let heading = 'Introduction';
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) result.push(...chunks(`${input.title} › ${heading}`, text));
    buffer = [];
  };
  for (const line of input.content.split('\n')) {
    const match = /^#{1,6}\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  if (!result.length && input.content.trim()) {
    result.push(...chunks(input.title, input.content.trim()));
  }
  return result;
}
