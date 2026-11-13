/** Explicit selected-room public reads. No store insertion, receipts or mutations. */
import { chatId, type ChatMessage } from './chat-protocol.js';
import { parseMessage } from './messaging-api.js';
import { PublicProblem, publicURL, type ActionREST } from './public-rest.js';

export const MESSAGE_QUERY_LIMITS = Object.freeze({ page: 50, items: 250, pages: 5, bytes: 262_144, ageMs: 120_000 });
export type QueryKind = 'thread' | 'mentions';
export type QueryLimit = 'none' | 'items' | 'pages' | 'bytes' | 'cycle';
export type QueryMessage = Pick<ChatMessage, 'id' | 'author' | 'created' | 'updated' | 'edited' | 'text' | 'markdown' | 'quoted' | 'parentId'>
  & { fileCount: number; contentPartial: boolean };
export interface MessageQueryContext { sessionId: string; roomId: string }
export interface ThreadQueryContext extends MessageQueryContext { messageId: string; parentId?: string }
export interface MessageQueryPage extends MessageQueryContext {
  kind: QueryKind; coverage: 'room-thread' | 'room-mentions-me'; revision: number; observedAt: number;
  sourceId?: string; rootId?: string; partial: boolean; more: boolean; limit: QueryLimit; items: QueryMessage[];
}
interface Slot { value: MessageQueryPage; next?: string; seen: Set<string>; pages: number; bytes: number; sourceParent?: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function project(value: unknown, room: string): QueryMessage {
  if (!object(value) || 'errors' in value
    || ['text', 'markdown', 'html'].some(key => value[key] !== undefined && typeof value[key] !== 'string')
    || value.files !== undefined && (!Array.isArray(value.files) || value.files.length > 10 || value.files.some(file => typeof file !== 'string'))
    || value.attachments !== undefined && (!Array.isArray(value.attachments) || value.attachments.length > 10)) throw new PublicProblem('failed');
  const message = parseMessage(value, room);
  if (message?.created.length !== 24 || value.updated !== undefined && message.updated?.length !== 24) throw new PublicProblem('failed');
  // Pure projection, deliberately NOT api.projectMessage/store.projectSent:
  // file URLs must never register transferable attachment/image authority here.
  const { authorId: _id, senderName: _name, images: _images, attachments: _attachments, cards: _cards, ...body } = message;
  return { ...body, fileCount: Array.isArray(value.files) ? value.files.length : 0,
    contentPartial: !!(Array.isArray(value.files) && value.files.length || Array.isArray(value.attachments) && value.attachments.length)
      || !value.text && !value.markdown && !value.html
      || ['text', 'markdown'].some(key => typeof value[key] === 'string' && value[key].length > 10000)
      || typeof value.html === 'string' && value.html.length > 40000
      || !!message.markdown?.includes('[Rich text truncated at safe display limits]') };
}
function normalized(path: string): string {
  const url = publicURL(path); url.searchParams.sort(); return url.href;
}
function pageURL(room: string, root?: string): string {
  const url = publicURL('/v1/messages');
  url.searchParams.set('roomId', room); url.searchParams.set('max', '50');
  url.searchParams.set(root ? 'parentId' : 'mentionedPeople', root || 'me');
  return normalized(url.href);
}
function nextPage(link: string | undefined, room: string, root?: string): string | undefined {
  if (!link) return;
  const matches = [...link.matchAll(/<([^>]+)>;\s*rel="next"/g)];
  if (matches.length !== 1) { if (/\bnext\b/.test(link)) throw new PublicProblem('failed'); return; }
  const url = publicURL(matches[0]![1]!);
  const filter = root ? 'parentId' : 'mentionedPeople';
  if (url.pathname !== '/v1/messages' || url.searchParams.get('roomId') !== room
    || url.searchParams.get('max') !== '50' || url.searchParams.get(filter) !== (root || 'me')
    || [...url.searchParams.keys()].some(key => !['roomId', 'max', filter, 'before', 'beforeMessage'].includes(key))
    || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)
    || ['before', 'beforeMessage'].some(key => (url.searchParams.get(key)?.length ?? 0) > 2048)
    || url.searchParams.has('beforeMessage') && !chatId(url.searchParams.get('beforeMessage'))) throw new PublicProblem('failed');
  return normalized(url.href);
}
const bytesOf = (item: QueryMessage) => Buffer.byteLength(JSON.stringify(item)) + 1;
export class MessageQueries {
  private slots: Partial<Record<QueryKind, Slot>> = {};
  private epoch = 0;
  private revision = 0;
  private physical = false;
  constructor(private now = Date.now) {}
  reset(): void { this.slots = {}; this.epoch++; this.revision++; } // Does not release unsettled physical work.
  thread(context: ThreadQueryContext, rest: ActionREST, token: () => string, signal: AbortSignal, more = false, revision?: number) {
    return this.load('thread', context, rest, token, signal, more, revision);
  }
  mentions(context: MessageQueryContext, rest: ActionREST, token: () => string, signal: AbortSignal, more = false, revision?: number) {
    return this.load('mentions', context, rest, token, signal, more, revision);
  }
  private async load(kind: QueryKind, context: MessageQueryContext | ThreadQueryContext, rest: ActionREST, token: () => string,
    signal: AbortSignal, more: boolean, revision?: number): Promise<MessageQueryPage> {
    const thread = kind === 'thread' ? context as ThreadQueryContext : undefined;
    const previous = this.slots[kind], age = previous ? this.now() - previous.value.observedAt : -1;
    if (!/^[a-f0-9]{32}$/.test(context.sessionId) || !chatId(context.roomId) || this.physical || signal.aborted
      || thread && (!chatId(thread.messageId) || thread.parentId !== undefined && (!chatId(thread.parentId) || thread.parentId === thread.messageId))
      || more && (!previous || previous.value.sessionId !== context.sessionId || previous.value.roomId !== context.roomId
        || previous.value.sourceId !== thread?.messageId || previous.sourceParent !== thread?.parentId
        || previous.value.revision !== revision || !previous.value.more || !previous.next || age < 0 || age >= MESSAGE_QUERY_LIMITS.ageMs)) throw new PublicProblem('failed');
    if (!more) delete this.slots[kind];
    const epoch = this.epoch, prior = more ? previous : undefined;
    this.physical = true;
    const check = () => { if (signal.aborted || this.epoch !== epoch) throw new PublicProblem('failed'); return token(); };
    const get = async (path: string) => {
      const result = await rest.call(path, 'GET', check(), signal);
      check(); return result;
    };
    try {
      const items = [...(prior?.value.items ?? [])];
      let rootId = prior?.value.rootId, bytes = prior?.bytes ?? 0;
      if (thread && !more) {
        const source = project((await get('/v1/messages/' + encodeURIComponent(thread.messageId))).value, context.roomId);
        if (source.id !== thread.messageId || source.parentId !== thread.parentId) throw new PublicProblem('failed');
        rootId = source.parentId ?? source.id;
        const root = rootId === source.id ? source : project((await get('/v1/messages/' + encodeURIComponent(rootId))).value, context.roomId);
        if (root.id !== rootId || root.parentId) throw new PublicProblem('failed');
        items.push(root); bytes += bytesOf(root);
      }
      const path = prior?.next ?? pageURL(context.roomId, rootId);
      const response = await get(path);
      if (!object(response.value) || 'errors' in response.value || !Array.isArray(response.value.items)
        || response.value.items.length > MESSAGE_QUERY_LIMITS.page) throw new PublicProblem('failed');
      const ids = new Set(items.map(item => item.id)), max = MESSAGE_QUERY_LIMITS.items + (thread ? 1 : 0);
      let limit: QueryLimit = 'none';
      for (const raw of response.value.items) {
        const item = project(raw, context.roomId);
        if (ids.has(item.id) || rootId && item.parentId !== rootId) throw new PublicProblem('failed');
        ids.add(item.id);
        const size = bytesOf(item);
        if (limit !== 'none') continue;
        if (items.length >= max) { limit = 'items'; continue; }
        if (bytes + size > MESSAGE_QUERY_LIMITS.bytes) { limit = 'bytes'; continue; }
        items.push(item); bytes += size;
      }
      const next = nextPage(response.link, context.roomId, rootId), seen = new Set(prior?.seen);
      seen.add(normalized(path));
      const pages = (prior?.pages ?? 0) + 1;
      if (limit === 'none' && next) {
        if (seen.has(next)) limit = 'cycle';
        else if (items.length >= max) limit = 'items';
        else if (pages >= MESSAGE_QUERY_LIMITS.pages) limit = 'pages';
      }
      check();
      const value: MessageQueryPage = { sessionId: context.sessionId, roomId: context.roomId, kind,
        coverage: thread ? 'room-thread' : 'room-mentions-me', revision: ++this.revision,
        observedAt: prior?.value.observedAt ?? this.now(), ...(thread ? { sourceId: thread.messageId, rootId } : {}),
        partial: !!next || limit !== 'none', more: !!next && limit === 'none', limit, items };
      this.slots[kind] = { value, next, seen, pages, bytes, ...(thread?.parentId ? { sourceParent: thread.parentId } : {}) };
      return structuredClone(value);
    } catch (error) {
      if (epoch === this.epoch) delete this.slots[kind];
      throw error;
    } finally { this.physical = false; }
  }
}
