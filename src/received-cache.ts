/** Authorized decrypted display data. Never loaded into a live messaging/mutation store. */
import { createHash } from 'node:crypto';
import { chatId, type ChatMessage } from './chat-protocol.js';
import { peopleId, validSenderName } from './identity-contracts.js';
import { validReactionSnapshot, type ReactionSnapshot } from './reaction-contracts.js';
import { PrivateCache } from './private-cache.js';

export const RECEIVED_CACHE_LIMITS = Object.freeze({ names: 256, rooms: 16, messages: 32,
  bytes: 4_194_304, nameAgeMs: 24 * 3600_000, ageMs: 6 * 3600_000 });
export interface CachedName { id: string; name: string; observedAt: number }
interface CachedMessage { message: ChatMessage; observedAt: number }
interface History { roomId: string; messages: CachedMessage[]; reactions: { key: string; snapshot: ReactionSnapshot }[] }
interface Document { version: 1; profile: string; names: CachedName[]; histories: History[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const time = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
  && !/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(v);
const invalid = () => new Error('Received display cache unavailable.');
const fresh = (at: number, age: number, now: number) => now >= at && now - at < age;
/** Exclude resolved names and rich-preview state, not source text/edit identity. */
export const receivedContentKey = (m: ChatMessage): string => createHash('sha256')
  .update(JSON.stringify([m.id, m.created, m.updated, m.text, m.markdown, m.parentId, m.quoted, m.edited])).digest('hex');
function message(value: unknown): value is ChatMessage {
  return object(value) && only(value, ['id', 'author', 'authorId', 'created', 'updated', 'edited', 'text', 'markdown', 'parentId', 'quoted'])
    && chatId(value.id) && text(value.author, 120) && !/[\n\t]/u.test(value.author) && date(value.created) && text(value.text, 65536)
    && (value.authorId === undefined || peopleId(value.authorId)) && (value.updated === undefined || date(value.updated))
    && (value.markdown === undefined || text(value.markdown, 65536))
    && (value.parentId === undefined || chatId(value.parentId) && value.parentId !== value.id)
    && (value.quoted === undefined || typeof value.quoted === 'boolean') && (value.edited === undefined || typeof value.edited === 'boolean');
}
/** Positive projection: no attachment URLs, image data, SDK objects or write handles. */
function project(m: ChatMessage): ChatMessage | undefined {
  const value = { id: m.id, author: m.author, created: m.created, text: m.text,
    ...(m.authorId ? { authorId: m.authorId } : {}), ...(m.updated ? { updated: m.updated } : {}),
    ...(m.markdown !== undefined ? { markdown: m.markdown } : {}), ...(m.parentId ? { parentId: m.parentId } : {}),
    ...(m.quoted !== undefined ? { quoted: m.quoted } : {}), ...(m.edited !== undefined ? { edited: m.edited } : {}) };
  return message(value) ? value : undefined;
}
export class ReceivedCacheStorage extends PrivateCache {
  constructor(base?: string) { super('wbx-tui-received', RECEIVED_CACHE_LIMITS.bytes, base, [1]); }
  async load(key: string): Promise<Document | undefined> {
    const v = await this.readDocument(key);
    if (v === undefined) return;
    if (!object(v) || !only(v, ['version', 'profile', 'names', 'histories']) || v.version !== 1
      || typeof v.profile !== 'string' || !/^[a-f0-9]{64}$/.test(v.profile)) throw invalid();
    if (v.profile !== key) return;
    if (!Array.isArray(v.names) || v.names.length > RECEIVED_CACHE_LIMITS.names
      || !Array.isArray(v.histories) || v.histories.length > RECEIVED_CACHE_LIMITS.rooms) throw invalid();
    const unique = (items: string[]) => new Set(items).size === items.length;
    for (const name of v.names) if (!object(name) || !only(name, ['id', 'name', 'observedAt'])
      || !peopleId(name.id) || !validSenderName(name.name) || !time(name.observedAt)) throw invalid();
    if (!unique(v.names.map(n => n.id))) throw invalid();
    for (const h of v.histories) {
      if (!object(h) || !only(h, ['roomId', 'messages', 'reactions']) || !chatId(h.roomId)
        || !Array.isArray(h.messages) || h.messages.length > RECEIVED_CACHE_LIMITS.messages
        || !Array.isArray(h.reactions) || h.reactions.length > RECEIVED_CACHE_LIMITS.messages) throw invalid();
      for (const row of h.messages) if (!object(row) || !only(row, ['message', 'observedAt']) || !time(row.observedAt) || !message(row.message)) throw invalid();
      for (const row of h.reactions) if (!object(row) || !only(row, ['key', 'snapshot']) || typeof row.key !== 'string'
        || !/^[a-f0-9]{64}$/.test(row.key) || !validReactionSnapshot(row.snapshot) || row.snapshot.roomId !== h.roomId
        || row.snapshot.groups.some(g => g.own !== undefined)) throw invalid();
      if (!unique(h.messages.map(row => row.message.id)) || !unique(h.reactions.map(row => row.snapshot.messageId))) throw invalid();
    }
    if (!unique(v.histories.map(h => h.roomId))) throw invalid();
    return v as unknown as Document;
  }
  save(key: string, names: CachedName[], histories: History[]): Promise<void> {
    return this.saveDocument(key, { version: 1, profile: key, names, histories });
  }
}
export class ReceivedCache {
  private names = new Map<string, CachedName>();
  private histories = new Map<string, History>();
  private binding?: { key: string; current(): boolean };
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private written = '';
  private active?: Promise<void>;
  private dirty = false;
  state: 'loading' | 'ready' | 'unavailable' | 'off' = 'loading';
  constructor(private storage = new ReceivedCacheStorage(), private now = Date.now) {}
  async bind(key: string, current: () => boolean): Promise<void> {
    if (this.closed || this.binding) throw invalid();
    const binding = this.binding = { key, current }, revision = this.revision;
    try {
      const doc = await this.storage.load(key);
      if (this.closed || this.binding !== binding || !current()) return;
      const liveRooms = [...this.histories.keys()];
      for (const name of doc?.names ?? []) if ((this.names.get(name.id)?.observedAt ?? -1) < name.observedAt) this.names.set(name.id, name);
      // Invalidation during disk I/O must not resurrect a deleted/revoked target.
      if (revision === this.revision) for (const history of doc?.histories ?? []) {
        const live = this.histories.get(history.roomId);
        if (!live) this.histories.set(history.roomId, history);
        else {
          for (const row of history.messages) if (!live.messages.some(m => m.message.id === row.message.id)) live.messages.push(row);
          for (const row of history.reactions) if (!live.reactions.some(r => r.snapshot.messageId === row.snapshot.messageId)) live.reactions.push(row);
        }
      }
      for (const id of liveRooms) {
        const h = this.histories.get(id)!; this.histories.delete(id); this.histories.set(id, h);
      }
      this.names = new Map([...this.names].sort((a, b) => a[1].observedAt - b[1].observedAt));
      this.prune(); this.state = 'ready'; this.changed();
    } catch { if (!this.closed && this.binding === binding && current()) this.state = 'unavailable'; }
  }
  restoredNames(): CachedName[] { this.prune(); return structuredClone([...this.names.values()]); }
  observeNames(names: CachedName[]): void {
    if (this.closed) return;
    this.names = new Map(names.filter(n => peopleId(n.id) && validSenderName(n.name) && time(n.observedAt)).map(n => [n.id, { ...n }]));
    this.changed();
  }
  private history(roomId: string): History {
    const h = this.histories.get(roomId) ?? { roomId, messages: [], reactions: [] };
    this.histories.delete(roomId); this.histories.set(roomId, h); return h;
  }
  observeMessages(roomId: string, messages: ChatMessage[]): void {
    if (this.closed || !chatId(roomId)) return;
    const h = this.history(roomId), now = this.now();
    for (const m of messages.slice(-500)) {
      const value = project(m); if (!value) continue;
      const previous = h.messages.find(row => row.message.id === m.id);
      if (previous && receivedContentKey(previous.message) !== receivedContentKey(value)) h.reactions = h.reactions.filter(r => r.snapshot.messageId !== m.id);
      h.messages = h.messages.filter(row => row.message.id !== m.id);
      h.messages.push({ message: value, observedAt: now });
    }
    this.changed();
  }
  observeReaction(snapshot: ReactionSnapshot, target: ChatMessage): void {
    if (this.closed || !validReactionSnapshot(snapshot) || snapshot.messageId !== target.id) return;
    const h = this.history(snapshot.roomId);
    h.reactions = h.reactions.filter(row => row.snapshot.messageId !== target.id);
    const value = structuredClone(snapshot);
    value.groups = value.groups.map(({ own, ...group }) => ({ ...group, ...(own ? { mine: true as const } : {}) }));
    h.reactions.push({ key: receivedContentKey(target), snapshot: value }); this.changed();
  }
  messages(roomId: string): ChatMessage[] {
    this.prune(); return structuredClone(this.histories.get(roomId)?.messages.map(row => row.message) ?? []);
  }
  reactions(roomId: string, messages: ChatMessage[]): ReactionSnapshot[] {
    this.prune();
    return structuredClone((this.histories.get(roomId)?.reactions ?? []).filter(row =>
      messages.some(m => m.id === row.snapshot.messageId && receivedContentKey(m) === row.key)).map(row => row.snapshot));
  }
  forget(roomId: string, messageId?: string): void {
    if (this.closed) return;
    this.revision++;
    const h = this.histories.get(roomId);
    if (messageId && h) {
      h.messages = h.messages.filter(row => row.message.id !== messageId);
      h.reactions = h.reactions.filter(row => row.snapshot.messageId !== messageId);
    } else if (!messageId) this.histories.delete(roomId);
    this.changed();
  }
  forgetReaction(roomId: string, messageId: string): void {
    if (this.closed) return;
    this.revision++;
    const h = this.histories.get(roomId);
    if (h) h.reactions = h.reactions.filter(row => row.snapshot.messageId !== messageId);
    this.changed();
  }
  private prune(trim = false): void {
    const now = this.now();
    for (const [id, n] of this.names) if (!fresh(n.observedAt, RECEIVED_CACHE_LIMITS.nameAgeMs, now)) this.names.delete(id);
    while (this.names.size > RECEIVED_CACHE_LIMITS.names) this.names.delete(this.names.keys().next().value!);
    for (const [id, h] of this.histories) {
      h.messages = h.messages.filter(row => fresh(row.observedAt, RECEIVED_CACHE_LIMITS.ageMs, now))
        .sort((a, b) => a.message.created.localeCompare(b.message.created) || a.message.id.localeCompare(b.message.id)).slice(-RECEIVED_CACHE_LIMITS.messages);
      h.reactions = h.reactions.filter(row => fresh(row.snapshot.observedAt, RECEIVED_CACHE_LIMITS.ageMs, now)
        && h.messages.some(m => m.message.id === row.snapshot.messageId && receivedContentKey(m.message) === row.key)).slice(-RECEIVED_CACHE_LIMITS.messages);
      if (!h.messages.length) this.histories.delete(id);
    }
    while (this.histories.size > RECEIVED_CACHE_LIMITS.rooms) this.histories.delete(this.histories.keys().next().value!);
    // Very long messages must evict old rooms, not make every future save fail.
    while (trim && this.histories.size && Buffer.byteLength(JSON.stringify([[...this.names.values()], [...this.histories.values()]])) > RECEIVED_CACHE_LIMITS.bytes - 1024) {
      this.histories.delete(this.histories.keys().next().value!);
    }
  }
  private changed(): void {
    this.prune(true); this.dirty = true;
    if (this.closed || !this.binding?.current() || this.state !== 'ready' || this.timer || this.active) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 5000); this.timer.unref?.();
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.active) return this.active;
    if (this.closed || !this.binding?.current() || this.state !== 'ready' || !this.dirty) return;
    this.prune(); this.dirty = false;
    const { key } = this.binding, names = [...this.names.values()], histories = [...this.histories.values()];
    const encoded = JSON.stringify([names, histories]); if (encoded === this.written) return;
    let work: Promise<void>;
    try { work = this.storage.save(key, names, histories); }
    catch { this.state = 'unavailable'; return; }
    this.active = work;
    try { await work; if (!this.closed) this.written = encoded; }
    catch { if (!this.closed) this.state = 'unavailable'; }
    finally { this.active = undefined; if (this.dirty) this.changed(); }
  }
  async clear(): Promise<void> {
    const key = this.binding?.key; this.close();
    if (key) await this.storage.clear(key);
  }
  close(): void {
    this.closed = true; clearTimeout(this.timer); this.storage.close(); this.binding = undefined;
    this.names.clear(); this.histories.clear(); this.state = 'off';
  }
}
