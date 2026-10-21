import { MENTION_RE } from '../../../shared/mentions';

export { MENTION_RE };

export function renderMentions(body: string): string {
  return body.replace(MENTION_RE, (_match, name: string) => `**@${name}**`);
}
