/** Plaintext is literal. Markdown mentions require exact syntax, consent and fresh membership. */
import { peopleId, senderName } from './identity-contracts.js';
import { PublicProblem, type ActionREST } from './public-rest.js';
import { RoomMembers, MEMBER_LIMITS } from './room-members.js';
export interface MentionConsent { mentionsAccepted?: boolean; allAccepted?: boolean }
export function richMentions(content: string): { people: string[]; all: boolean } {
  if (/<spark-mention\b/i.test(content)) throw new PublicProblem('failed');
  const mentions = [...content.matchAll(/<@[^>]*>/g)], people = new Set<string>();
  if (mentions.length !== (content.match(/<@/g) ?? []).length) throw new PublicProblem('failed');
  let all = false;
  for (const match of mentions) {
    if (match[0] === '<@all>') { all = true; continue; }
    const target = /^<@personId:([^|>]+)\|([^<>|\r\n]+)>$/.exec(match[0]);
    if (!target || !peopleId(target[1]) || !target[2] || senderName(target[2]) !== target[2]) throw new PublicProblem('failed');
    people.add(target[1]);
  }
  if (people.size > MEMBER_LIMITS.mentions || mentions.length > 32) throw new PublicProblem('failed');
  return { people: [...people], all };
}
export async function validateMentions(rest: ActionREST, members: RoomMembers, room: string, content: string,
  consent: MentionConsent, signal: AbortSignal, token: () => string): Promise<void> {
  const targets = richMentions(content);
  if ((targets.people.length || targets.all) && consent.mentionsAccepted !== true || targets.all && consent.allAccepted !== true) throw new PublicProblem('failed');
  for (const person of targets.people) await members.verify(rest, room, person, token(), signal);
}
