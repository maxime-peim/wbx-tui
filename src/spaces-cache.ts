/** Opt-in, untrusted display hints. Never credentials, messages or receipt authority. */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PrivateCache } from './private-cache.js';
import type { OAuthConfig } from './oauth.js';
import type { AccessCredentials } from './auth-protocol.js';
import type { MessageRoom } from './messaging-api.js';
import { chatId } from './chat-protocol.js';
import { peopleId, readPeopleJSON } from './people-status.js';
import { deadline } from './lifecycle.js';

export const SPACES_CACHE_LIMITS = Object.freeze({ rooms: 500, bytes: 1_048_576, slots: 8, entries: 64, ageMs: 6 * 3600_000, identityMs: 3000 });
export interface CachedUnread { id: string; unread: boolean; observedAt: number }
export interface CachedSpaces { observedAt: number; rooms: MessageRoom[]; unread?: CachedUnread[] }
export interface SpacesCacheStatus { state: 'off' | 'loading' | 'miss' | 'stale' | 'ready' | 'unavailable';
  reason?: 'scope-required' | 'identity-unavailable' | 'cache-unavailable' | 'refresh-failed' | 'expired' | 'cleared'; observedAt?: number; verified?: boolean }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unsafe = /[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff\ud800-\udfff]/gu;
const title = (value: string) => Array.from(value).slice(0, 80).join('').replace(unsafe, ' ').trim();
const activity = (value: unknown): value is string => value === '' || typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const invalid = () => new Error('Local spaces cache unavailable. No cached data was trusted.');
export function cachedSpaceMetadata(rooms: MessageRoom[]): MessageRoom[] {
  const seen = new Set<string>();
  return rooms.slice(0, SPACES_CACHE_LIMITS.rooms).flatMap(room => {
    if (!chatId(room.id) || seen.has(room.id) || !['direct', 'group'].includes(room.type) || typeof room.title !== 'string') return [];
    seen.add(room.id);
    return [{ id: room.id, title: title(room.title) || (room.type === 'direct' ? 'Direct conversation' : 'Untitled space'),
      type: room.type, lastActivity: activity(room.lastActivity) ? room.lastActivity : '' }];
  });
}
/** Preserve each actual observation time; metadata writes must not renew it. */
export function cachedUnreadFlags(flags: CachedUnread[], rooms: MessageRoom[], now: number): CachedUnread[] {
  const members = new Set(rooms.map(room => room.id)), result = new Map<string, CachedUnread>();
  for (const flag of flags.slice(0, SPACES_CACHE_LIMITS.rooms * 2)) {
    if (!members.has(flag.id) || typeof flag.unread !== 'boolean' || !Number.isSafeInteger(flag.observedAt)
      || flag.observedAt < 0 || flag.observedAt > now || now - flag.observedAt >= SPACES_CACHE_LIMITS.ageMs) continue;
    if ((result.get(flag.id)?.observedAt ?? -1) <= flag.observedAt) result.set(flag.id, { id: flag.id, unread: flag.unread, observedAt: flag.observedAt });
  }
  return [...result.values()];
}
export function spacesCacheKey(config: string, profile: OAuthConfig, accountId: string): string {
  if (!peopleId(accountId) || accountId === 'me') throw invalid();
  return createHash('sha256').update(JSON.stringify([resolve(config), profile.clientId, profile.redirectUri, [...profile.scopes].sort(), accountId])).digest('hex');
}
export function spacesCacheScope(scope: string): boolean { return scope.split(/\s+/).some(value => value === 'spark:all' || value === 'spark:people_read'); }
/** Opt-in identity only, not presence, directory enumeration, or new consent. */
export async function spacesCacheAccount(access: AccessCredentials, parent: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  if (!spacesCacheScope(access.scope) || access.expiresAt <= Date.now()) throw invalid();
  const abort = new AbortController(), cancel = () => abort.abort();
  parent.addEventListener('abort', cancel, { once: true });
  if (parent.aborted) abort.abort();
  const timer = setTimeout(cancel, SPACES_CACHE_LIMITS.identityMs);
  try {
    const response = await deadline(() => readPeopleJSON({ self: true }, access.token, fetcher, abort.signal, Date.now,
      pending => { void pending.catch(() => {}); }), SPACES_CACHE_LIMITS.identityMs, 'Account identity unavailable.', abort.signal);
    const self = response.value;
    if (abort.signal.aborted || !object(self) || !peopleId(self.id) || self.id === 'me' || self.errors !== undefined
      || self.type !== undefined && self.type !== 'person') throw invalid();
    return self.id;
  } finally { clearTimeout(timer); parent.removeEventListener('abort', cancel); abort.abort(); }
}

/** Eight fixed slots bound storage across profiles/processes. Collisions are
 * misses, never account matches; atomic rename makes concurrent writers safe. */
export class SpacesCache extends PrivateCache {
  constructor(base?: string, private now = Date.now) { super('wbx-tui-spaces', SPACES_CACHE_LIMITS.bytes, base); }
  private decode(value: unknown, key: string): CachedSpaces | undefined {
    if (!object(value) || ![1, 2].includes(value.version as number) || typeof value.profile !== 'string' || !/^[a-f0-9]{64}$/.test(value.profile)
      || Object.keys(value).some(name => !['version', 'profile', 'observedAt', 'rooms', ...(value.version === 2 ? ['unread'] : [])].includes(name))) throw invalid();
    if (value.profile !== key) return; // Slot collision: no metadata crosses accounts.
    if (typeof value.observedAt !== 'number' || !Number.isSafeInteger(value.observedAt) || value.observedAt < 0
      || !Array.isArray(value.rooms) || value.rooms.length > SPACES_CACHE_LIMITS.rooms) throw invalid();
    const seen = new Set<string>();
    const rooms: MessageRoom[] = [];
    for (const room of value.rooms) {
      if (!object(room) || !chatId(room.id) || seen.has(room.id) || typeof room.title !== 'string' || !room.title || room.title !== title(room.title)
        || !['direct', 'group'].includes(String(room.type)) || !activity(room.lastActivity)
        || Object.keys(room).some(name => !['id', 'title', 'type', 'lastActivity'].includes(name))) throw invalid();
      seen.add(room.id); rooms.push({ id: room.id, title: room.title, type: room.type as MessageRoom['type'], lastActivity: room.lastActivity });
    }
    const unread: CachedUnread[] = [], flags = value.version === 2 ? value.unread : [];
    if (!Array.isArray(flags) || flags.length > SPACES_CACHE_LIMITS.rooms) throw invalid();
    const flagsSeen = new Set<string>();
    for (const flag of flags) {
      if (!object(flag) || !chatId(flag.id) || !seen.has(flag.id) || flagsSeen.has(flag.id) || typeof flag.unread !== 'boolean'
        || typeof flag.observedAt !== 'number' || !Number.isSafeInteger(flag.observedAt) || flag.observedAt < 0
        || Object.keys(flag).some(name => !['id', 'unread', 'observedAt'].includes(name))) throw invalid();
      flagsSeen.add(flag.id);
      if (flag.observedAt <= value.observedAt) unread.push({ id: flag.id, unread: flag.unread, observedAt: flag.observedAt });
    }
    const age = this.now() - value.observedAt;
    return age >= 0 && age < SPACES_CACHE_LIMITS.ageMs ? { observedAt: value.observedAt, rooms,
      ...(value.version === 2 ? { unread: cachedUnreadFlags(unread, rooms, this.now()) } : {}) } : undefined;
  }
  async load(key: string): Promise<CachedSpaces | undefined> {
    const value = await this.readDocument(key);
    return value === undefined ? undefined : this.decode(value, key);
  }
  save(key: string, rooms: MessageRoom[], unread: CachedUnread[] = [], observedAt = this.now()): Promise<void> {
    if (!Number.isSafeInteger(observedAt) || observedAt < 0 || observedAt > this.now()) throw invalid();
    const metadata = cachedSpaceMetadata(rooms);
    const value = { version: 2, profile: key, observedAt, rooms: metadata, unread: cachedUnreadFlags(unread, metadata, observedAt) };
    return this.saveDocument(key, value);
  }
}
