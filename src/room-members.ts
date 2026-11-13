/** Explicit single-selected-room roster. No presence, account-wide scans or writes. */
import { chatId } from './chat-protocol.js';
import { peopleId, senderName } from './identity-contracts.js';
import { type ActionREST, PublicProblem, publicURL } from './public-rest.js';
export const MEMBER_LIMITS = Object.freeze({ page: 100, retained: 500, pages: 10, mentions: 16 });
export interface RoomMember { id: string; personId: string; label: string; moderator: boolean }
export interface MemberSnapshot { roomId: string; revision: number; state: 'empty' | 'ready' | 'failed';
  partial: boolean; more: boolean; items: RoomMember[] }
export interface DirectVisibility { roomId: string; isRoomHidden: boolean | null }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export async function authenticatedSelf(rest: ActionREST, signal: AbortSignal, token: () => string): Promise<string> {
  const response = await rest.call('/v1/people/me', 'GET', token(), signal);
  token();
  if (!object(response.value) || !peopleId(response.value.id) || 'errors' in response.value) throw new PublicProblem('failed');
  return response.value.id;
}
export function member(value: unknown, roomId: string): RoomMember | undefined {
  if (!object(value) || 'errors' in value || value.roomId !== roomId || !chatId(value.id) || !peopleId(value.personId)
    || value.isModerator !== undefined && typeof value.isModerator !== 'boolean') return;
  return { id: value.id, personId: value.personId, label: senderName(value.personDisplayName) || 'Unnamed participant',
    moderator: value.isModerator === true };
}
function nextLink(link: string | undefined, room: string): string | undefined {
  if (!link) return;
  const match = /<([^>]+)>;\s*rel="next"/.exec(link);
  if (!match) { if (/\bnext\b/.test(link)) throw new PublicProblem('failed'); return; }
  if ([...link.matchAll(/rel="next"/g)].length !== 1) throw new PublicProblem('failed');
  const url = publicURL(match[1]!);
  if (url.pathname !== '/v1/memberships' || url.searchParams.get('roomId') !== room
    || [...url.searchParams.keys()].some(key => !['roomId', 'max', 'before', 'after', 'cursor'].includes(key))
    || [...new Set(url.searchParams.keys())].some(key => url.searchParams.getAll(key).length !== 1)) throw new PublicProblem('failed');
  return url.href;
}
export class RoomMembers {
  private value: MemberSnapshot = { roomId: '', revision: 0, state: 'empty', partial: true, more: false, items: [] };
  private next?: string;
  private cursors = new Set<string>();
  private pages = 0;
  snapshot(): MemberSnapshot { return structuredClone(this.value); }
  /** Raw own-direct API flag only. Stateless proof, not roster publication or preference policy. */
  async readOwnDirectVisibility(rest: ActionREST, roomId: string, token: () => string, signal: AbortSignal): Promise<DirectVisibility> {
    if (!chatId(roomId) || signal.aborted || rest.busy()) throw new PublicProblem('failed');
    const check = () => { if (signal.aborted) throw new PublicProblem('failed'); return token(); };
    const self = await authenticatedSelf(rest, signal, check);
    check();
    const room = await rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', check(), signal);
    check();
    if (room.link || !object(room.value) || 'errors' in room.value || room.value.id !== roomId
      || room.value.type !== 'direct' || 'teamId' in room.value) throw new PublicProblem('failed');
    const response = await rest.call('/v1/memberships?roomId=' + encodeURIComponent(roomId)
      + '&personId=' + encodeURIComponent(self) + '&max=100', 'GET', check(), signal);
    check();
    const raw = response.value;
    if (response.link || !object(raw) || 'errors' in raw || !Array.isArray(raw.items) || raw.items.length !== 1) throw new PublicProblem('failed');
    const own = raw.items[0];
    if (!object(own) || 'errors' in own || !chatId(own.id) || own.roomId !== roomId || own.personId !== self
      || Object.hasOwn(own, 'roomType') && own.roomType !== 'direct'
      || Object.hasOwn(own, 'isRoomHidden') && typeof own.isRoomHidden !== 'boolean') throw new PublicProblem('failed');
    return { roomId, isRoomHidden: Object.hasOwn(own, 'isRoomHidden') ? own.isRoomHidden as boolean : null };
  }
  select(roomId: string): void {
    if (roomId === this.value.roomId) return;
    this.value = { roomId, revision: this.value.revision + 1, state: 'empty', partial: true, more: false, items: [] };
    this.next = undefined; this.cursors.clear(); this.pages = 0;
  }
  async load(rest: ActionREST, room: string, token: string, signal: AbortSignal, more = false): Promise<MemberSnapshot> {
    if (!chatId(room) || more && (room !== this.value.roomId || !this.next || !this.value.more)) throw new PublicProblem('failed');
    this.select(room);
    const revision = this.value.revision, path = more ? this.next! : '/v1/memberships?roomId=' + encodeURIComponent(room) + '&max=100';
    try {
      const result = await rest.call(path, 'GET', token, signal);
      if (signal.aborted || revision !== this.value.revision || room !== this.value.roomId) throw new PublicProblem('failed');
      if (!object(result.value) || 'errors' in result.value || !Array.isArray(result.value.items) || result.value.items.length > MEMBER_LIMITS.page) throw new PublicProblem('failed');
      const items = result.value.items.map(item => member(item, room));
      if (items.some(item => !item)) throw new PublicProblem('failed'); // Never silently turn partial identity into a complete roster.
      const merged = new Map((more ? this.value.items : []).map(item => [item.id, item]));
      for (const item of items as RoomMember[]) merged.set(item.id, item);
      const next = nextLink(result.link, room), seen = more ? this.cursors : new Set<string>(), pages = more ? this.pages + 1 : 1;
      const stalled = !!next && (next === path || seen.has(next));
      seen.add(path);
      this.cursors = seen; this.pages = pages;
      this.next = next;
      const bounded = merged.size >= MEMBER_LIMITS.retained || pages >= MEMBER_LIMITS.pages || stalled;
      this.value = { roomId: room, revision: revision + 1, state: 'ready', partial: !!next || merged.size > MEMBER_LIMITS.retained,
        more: !!next && !bounded, items: [...merged.values()].slice(0, MEMBER_LIMITS.retained) };
      return this.snapshot();
    } catch (error) {
      if (revision === this.value.revision) { this.value.state = 'failed'; this.value.partial = true; this.value.more = false; }
      throw error;
    }
  }
  async verify(rest: ActionREST, room: string, person: string, token: string, signal: AbortSignal, explicitRole = false): Promise<RoomMember> {
    if (!chatId(room) || !peopleId(person)) throw new PublicProblem('failed');
    const result = await rest.call('/v1/memberships?roomId=' + encodeURIComponent(room) + '&personId=' + encodeURIComponent(person) + '&max=100', 'GET', token, signal);
    if (signal.aborted || !object(result.value) || 'errors' in result.value || !Array.isArray(result.value.items)
      || result.value.items.length !== 1 || nextLink(result.link, room)) throw new PublicProblem('failed');
    if (explicitRole && (!object(result.value.items[0]) || !Object.hasOwn(result.value.items[0], 'isModerator')
      || typeof result.value.items[0].isModerator !== 'boolean')) throw new PublicProblem('failed');
    const matches = result.value.items.map(value => member(value, room));
    if (matches[0]?.personId !== person) throw new PublicProblem('failed');
    return matches[0]!;
  }
}
