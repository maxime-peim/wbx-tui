/** Public pinned SDK reads only, inside the existing metadata worker. */
import type { ReadStatusSDK } from './read-status-sdk.js';
import { chatId } from './chat-protocol.js';
import { senderName } from './identity-contracts.js';
import { READER_LIMITS, validReaderTarget, type ReaderTarget, type MessageReaders } from './message-readers.js';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function identity(value: unknown, type: 'ROOM' | 'MESSAGE' | 'PEOPLE') {
  if (!chatId(value)) throw new Error('Unverified read-through identity.');
  const bytes = Buffer.from(value, 'base64url');
  const match = /^ciscospark:\/\/([a-z0-9-]{1,32})\/(ROOM|MESSAGE|PEOPLE)\/([a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/.exec(bytes.toString('utf8'));
  if (!match || match[2] !== type || bytes.toString('base64url') !== value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    throw new Error('Unverified read-through identity.');
  return { cluster: match[1]!, id: match[3]!.toLowerCase() };
}
function sameIdentity(value: unknown, type: 'ROOM' | 'MESSAGE', expected: ReturnType<typeof identity>): boolean {
  const actual = identity(value, type);
  return actual.cluster === expected.cluster && actual.id === expected.id;
}
function time(value: unknown): number {
  if (typeof value !== 'string' || value.length > 32 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  const normalized = value.length === 20 ? value.slice(0, -1) + '.000Z' : value;
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === normalized ? parsed : NaN;
}
export async function readMessageReaders(sdk: ReadStatusSDK, target: ReaderTarget, check: () => void = () => {},
  now = Date.now): Promise<MessageReaders> {
  if (!validReaderTarget(target)) throw new Error('Unverified read-through target.');
  const room = identity(target.roomId, 'ROOM'), messageId = identity(target.messageId, 'MESSAGE');
  if (room.cluster !== messageId.cluster) throw new Error('Unverified read-through target.');
  check();
  const message = await sdk.messages.get(target.messageId); check();
  if (!object(message) || !sameIdentity(message.id, 'MESSAGE', messageId) || !sameIdentity(message.roomId, 'ROOM', room))
    throw new Error('Unverified read-through message.');
  const author = identity(message.personId, 'PEOPLE'), created = time(message.created);
  if (!Number.isFinite(created) || created > now() + 5000) throw new Error('Unverified message date.');
  const page = await sdk.memberships.listWithReadStatus({ roomId: target.roomId }); check();
  if (!object(page) || !Array.isArray(page.items) || page.items.length > READER_LIMITS.memberships)
    throw new Error('Read-through membership limit or invalid data.');
  const readers: MessageReaders['readers'] = [], seen = new Set<string>();
  for (const member of page.items) {
    if (!object(member) || !sameIdentity(member.roomId, 'ROOM', room)) throw new Error('Unverified membership room.');
    const person = identity(member.personId, 'PEOPLE'), key = `${person.cluster}/${person.id}`;
    if (seen.has(key)) throw new Error('Duplicate read-through identity.');
    seen.add(key);
    if (person.id === author.id) continue; // Ambiguous author namespace cannot count as another reader.
    if (member.lastSeenId === undefined && member.lastSeenDate === undefined) continue;
    let last;
    try { last = identity(member.lastSeenId, 'MESSAGE'); } catch { continue; }
    const date = time(member.lastSeenDate);
    if (last.cluster !== room.cluster || !Number.isFinite(date) || date > now() + 5000
      || (last.id === messageId.id ? date !== created : date <= created)) continue;
    if (readers.length < READER_LIMITS.readers) {
      const name = senderName(member.personDisplayName);
      readers.push({ personId: member.personId as string, ...(name ? { name } : {}) });
    }
  }
  // The public SDK drops participant coverage flags. Never claim a full census.
  return { ...target, coverage: 'space-read-watermark', observedAt: now(), partial: true, readers };
}
