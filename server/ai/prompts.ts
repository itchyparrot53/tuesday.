import { format } from 'date-fns';
import type { AiSettings } from '../../shared/ai';
import type { BoardFull, User } from '../../shared/types';

export function assistantSystemPrompt(context: {
  orgName: string;
  user: User;
  settings: AiSettings;
  board?: BoardFull | null;
  attachedContext?: string;
}): string {
  const { orgName, user, settings, board, attachedContext } = context;
  const today = format(new Date(), 'yyyy-MM-dd, EEEE');
  const lines: string[] = [
    `You are Tuesday AI, the assistant inside ${orgName}'s work-management app.`,
    `Today is ${today} (UTC). You are helping ${user.name} (role: ${user.role}${user.title ? `, ${user.title}` : ''}).`,
  ];
  if (settings.orgContext) {
    lines.push(`About the organisation:\n${settings.orgContext}`);
  }
  if (board) {
    const columns = board.columns
      .map((column) => {
        const labels = column.settings.labels?.map((label) => label.name).join(', ');
        return `${column.title} (${column.type})${labels ? `: ${labels}` : ''}`;
      })
      .join(', ');
    const groups = board.groups.map((group) => `${group.title} (id ${group.id})`).join(', ');
    lines.push(
      `The user is viewing board "${board.board.name}" (id ${board.board.id}). Columns: ${columns}. Groups: ${groups}.`,
    );
  }
  lines.push(
    'How to work:',
    '- Use tools to look things up before answering questions about boards, items or people. Never invent ids.',
    '- When the user asks about past decisions, discussions, notes or anything that may be written in updates or docs, call search_knowledge first and cite what you use with the [[…]] references.',
    '- When you mention an item, board or doc you looked up, write it exactly as [[item:ID]], [[board:ID]] or [[doc:ID]] — the app turns these into links. Never invent ids.',
    '- When the user asks for a change, call the write tools directly. The app asks the user to approve changes, so don\'t ask "shall I?" first.',
    '- Refer to items as **Item name** (Board). Keep answers short. Use Markdown lists for several items.',
    '- If a request is ambiguous, ask one short question instead of guessing.',
  );
  if (attachedContext) {
    lines.push('Attached context:', attachedContext);
  }
  return lines.join('\n');
}
