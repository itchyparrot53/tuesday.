import { button, escapeHtml, layout } from './layout';

interface Base {
  appUrl: string;
  unsubscribeUrl?: string;
}

export function inviteEmail(
  input: Base & {
    orgName: string;
    inviterName: string;
    role: 'admin' | 'member' | 'viewer';
    link: string;
    isGuest: boolean;
    boardNames: string[];
  },
): { subject: string; html: string; text: string } {
  const role =
    input.role === 'admin'
      ? 'You can manage members and settings.'
      : input.role === 'viewer'
        ? 'You can view boards and comment.'
        : 'You can create and edit boards.';
  const intro = input.isGuest
    ? `${input.inviterName} invited you to work with ${input.orgName} on Tuesday. You'll see: ${input.boardNames.join(', ') || 'the boards they share with you'}.`
    : `${input.inviterName} invited you to join ${input.orgName} on Tuesday. ${role}`;
  const body = `<p>${escapeHtml(intro)}</p>${button(input.link, `Join ${input.orgName}`)}<p style="font-size:13px;color:#6e6272;">This link expires in 7 days.</p>`;
  return {
    subject: `${input.inviterName} invited you to ${input.orgName} on Tuesday`,
    html: layout({
      title: `Join ${input.orgName}`,
      body,
      appUrl: input.appUrl,
      preheader: `Join ${input.orgName} on Tuesday.`,
      footerNote: `You're receiving this because someone invited you to ${input.orgName} on Tuesday.`,
    }),
    text: `${intro}\n\nJoin ${input.orgName}: ${input.link}\n\nThis link expires in 7 days.`,
  };
}

export function resetEmail(input: Base & { name: string; link: string }) {
  const body = `<p>Hi ${escapeHtml(input.name)},</p><p>Someone asked to reset the password for this account. If it was you, use the button within 60 minutes. If not, you can ignore this email.</p>${button(input.link, 'Reset password')}`;
  return {
    subject: 'Reset your Tuesday password',
    html: layout({
      title: 'Reset your password',
      body,
      appUrl: input.appUrl,
      preheader: 'Reset your Tuesday password.',
      footerNote:
        "You're receiving this because someone requested a password reset for this address.",
    }),
    text: `Hi ${input.name},\n\nSomeone asked to reset the password for this account. If it was you, open this link within 60 minutes: ${input.link}\n\nIf not, you can ignore this email.`,
  };
}

export function notificationEmail(
  input: Base & {
    name: string;
    items: { title: string; body: string; link: string; actorName: string | null }[];
  },
) {
  const subject =
    input.items.length === 1
      ? input.items[0].title
      : `${input.items.length} new notifications on Tuesday`;
  const items = input.items
    .map(
      (item) =>
        `<li style="margin-bottom:10px;"><a href="${escapeHtml(item.link)}" style="color:#C9356C;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a><br/><span style="color:#6e6272;font-size:13px;">${escapeHtml(item.actorName ?? 'Tuesday')}${item.body ? ` — ${escapeHtml(item.body)}` : ''}</span></li>`,
    )
    .join('');
  const body = `<p>Hi ${escapeHtml(input.name)},</p><ul style="padding-left:18px;">${items}</ul>`;
  return {
    subject,
    html: layout({
      title: 'New on Tuesday',
      body,
      appUrl: input.appUrl,
      preheader: subject,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
    text: `Hi ${input.name},\n\n${input.items.map((item) => `${item.title}: ${input.appUrl}${item.link}`).join('\n')}${input.unsubscribeUrl ? `\n\nUnsubscribe: ${input.unsubscribeUrl}` : ''}`,
  };
}

export function digestEmail(
  input: Base & {
    name: string;
    date: string;
    due: { id: number; name: string; board: string; dueDate: string | null }[];
    overdue: { id: number; name: string; board: string; dueDate: string | null }[];
    mentions: { title: string; link: string }[];
    boardChanges: { board: string; count: number }[];
  },
) {
  const section = (title: string, rows: string) =>
    rows
      ? `<h2 style="margin:20px 0 6px;font-size:16px;color:#2b2130;">${escapeHtml(title)}</h2><ul style="padding-left:18px;margin:0;">${rows}</ul>`
      : '';
  const rows = (items: { id: number; name: string; board: string; dueDate: string | null }[]) =>
    items
      .map(
        (item) =>
          `<li style="margin-bottom:4px;">${escapeHtml(item.name)} <span style="color:#6e6272;">· ${escapeHtml(item.board)}${item.dueDate ? ` · ${escapeHtml(item.dueDate)}` : ''}</span></li>`,
      )
      .join('');
  const body = `<p>Hi ${escapeHtml(input.name)}, here is your Tuesday for ${escapeHtml(input.date)}.</p>
    ${section('Overdue', rows(input.overdue))}
    ${section('Due today', rows(input.due))}
    ${section('Mentions', input.mentions.map((mention) => `<li><a href="${escapeHtml(mention.link)}" style="color:#C9356C;">${escapeHtml(mention.title)}</a></li>`).join(''))}
    ${section('Changes on your favourite boards', input.boardChanges.map((change) => `<li>${change.count} changes on ${escapeHtml(change.board)}</li>`).join(''))}`;
  return {
    subject: `Your Tuesday for ${input.date}`,
    html: layout({
      title: `Your Tuesday for ${input.date}`,
      body,
      appUrl: input.appUrl,
      preheader: `Your Tuesday for ${input.date}.`,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
    text: `Your Tuesday for ${input.date}\n\nOverdue: ${input.overdue.map((item) => item.name).join(', ') || 'none'}\nDue today: ${input.due.map((item) => item.name).join(', ') || 'none'}\nMentions: ${input.mentions.length}\nBoard changes: ${input.boardChanges.map((change) => `${change.count} on ${change.board}`).join(', ') || 'none'}${input.unsubscribeUrl ? `\n\nUnsubscribe: ${input.unsubscribeUrl}` : ''}`,
  };
}

export function testEmail(input: Base & { name: string; host: string }) {
  const body = `<p>Hi ${escapeHtml(input.name)},</p><p>If you can read this, email from Tuesday works. Sent through ${escapeHtml(input.host)}.</p>`;
  return {
    subject: 'Tuesday test email',
    html: layout({
      title: 'Tuesday test email',
      body,
      appUrl: input.appUrl,
      preheader: 'Tuesday email is working.',
      footerNote: 'This is a test message from Admin, Email.',
    }),
    text: `Hi ${input.name},\n\nIf you can read this, email from Tuesday works. Sent through ${input.host}.`,
  };
}
