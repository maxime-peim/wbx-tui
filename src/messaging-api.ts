import { chatId, chatText, type ChatMessage } from './chat-protocol.js';
import { validToken } from './auth-protocol.js';
import { messageContent, messageText } from './message-content.js';
import { MessageImages, type MessageImage, type OpenedImage } from './message-images.js';
import { MessageAttachments, type MessageAttachment, type OpenedAttachment } from './message-attachments.js';
import { ContentAdmission, type ContentLease } from './content-admission.js';
import type { AttachmentResolveOptions, ResolvedAttachment } from './attachment-policy.js';
import { peopleId } from './identity-contracts.js';
import { validMessageAck } from './message-ack.js';
export { messageText } from './message-content.js';

export interface MessageRoom { id: string; title: string; type: 'direct' | 'group'; lastActivity: string;
  teamId?: string; isLocked?: boolean; isReadOnly?: boolean; isAnnouncementOnly?: boolean }
export const activityTime = (value: string): number => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export const recentRooms = (rooms: MessageRoom[]): MessageRoom[] => [...rooms].sort((a, b) => activityTime(b.lastActivity) - activityTime(a.lastActivity));
export interface MessagePage<T> { items: T[]; next?: string }
export interface MessagingAPI {
  readonly contentAdmission?: ContentAdmission;
  rooms(next?: string, signal?: AbortSignal): Promise<MessagePage<MessageRoom>>;
  history(room: string, next?: string, signal?: AbortSignal): Promise<MessagePage<ChatMessage>>;
  /** Undefined means a confirmed exact-message 404, never a partial-page omission. */
  getMessage?(room: string, id: string, signal?: AbortSignal): Promise<ChatMessage | undefined>;
  send(room: string, text: string, parentId?: string): Promise<ChatMessage>;
  projectMessage?(value: unknown, room: string): ChatMessage | undefined;
  demoMessageAction?(room: string, id: string, action: 'get' | 'edit' | 'delete', content?: string, format?: 'plain' | 'markdown'): Promise<unknown>;
  demoRichMessage?(room: string, markdown: string, parentId?: string): Promise<ChatMessage>;
  demoConversation?(action: string, input: Record<string, unknown>): Promise<unknown>;
  previews?(ids: string[], signal: AbortSignal): Promise<MessageImage[]>;
  attachmentMetadata?(ids: string[], signal: AbortSignal): Promise<MessageAttachment[]>;
  openImage?(id: string, signal: AbortSignal): Promise<OpenedImage>;
  openAttachment?(id: string, signal: AbortSignal): Promise<OpenedAttachment>;
  resolveAttachment?(id: string, options: AttachmentResolveOptions, signal: AbortSignal, lease?: ContentLease): Promise<ResolvedAttachment>;
  close(): void;
}
export class MessagingError extends Error {
  constructor(readonly reason: 'denied' | 'failed' | 'canceled' | 'unknown', message: string, readonly status?: number) { super(message); }
}
export function parseMessage(value: unknown, room: string): ChatMessage | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  // Some REST responses explicitly use null for a root; normalize only that
  // known no-parent representation. Malformed relationships are not guessed.
  const parentId = v.parentId === null ? undefined : v.parentId;
  if (!chatId(v.id) || v.roomId !== room || parentId !== undefined && (!chatId(parentId) || parentId === v.id)) return;
  return { id: v.id, author: messageText(v.personEmail, 80) || messageText(v.personId, 80) || 'Participant',
    ...(peopleId(v.personId) ? { authorId: v.personId } : {}),
    created: typeof v.created === 'string' && Number.isFinite(Date.parse(v.created)) ? new Date(v.created).toISOString() : '',
    ...(typeof v.updated === 'string' && Number.isFinite(Date.parse(v.updated)) ? { updated: new Date(v.updated).toISOString(), edited: true } : {}),
    ...messageContent(v), ...(parentId !== undefined ? { parentId: parentId as string } : {}) };
}
/** No browser, SDK, token file or automatic POST retry. All credentials stay in Node. */
export class WebexMessagingAPI implements MessagingAPI {
  private abort = new AbortController();
  private images: MessageImages;
  private attachments: MessageAttachments;
  constructor(private token: () => string, private fetcher: typeof fetch = fetch, private timeoutMs = 12_000, readonly contentAdmission = new ContentAdmission()) {
    this.images = new MessageImages(token, fetcher, undefined, undefined, contentAdmission); this.attachments = new MessageAttachments(token, fetcher, contentAdmission);
  }
  private message(value: unknown, room: string): ChatMessage | undefined {
    const message = parseMessage(value, room); if (!message) return;
    const images = this.images.register((value as Record<string, unknown>).files);
    const attachments = this.attachments.register((value as Record<string, unknown>).files);
    return { ...message, ...(images.length ? { images } : {}), ...(attachments.length ? { attachments } : {}) };
  }
  previews(ids: string[], signal: AbortSignal): Promise<MessageImage[]> { return this.images.load(ids, signal); }
  attachmentMetadata(ids: string[], signal: AbortSignal): Promise<MessageAttachment[]> { return this.attachments.describe(ids, signal); }
  projectMessage(value: unknown, room: string): ChatMessage | undefined { return this.message(value, room); }
  openImage(id: string, signal: AbortSignal): Promise<OpenedImage> {
    const url = this.attachments.reference(id);
    if (url) this.images.register([url]);
    return this.images.open(id, signal);
  }
  openAttachment(id: string, signal: AbortSignal): Promise<OpenedAttachment> { return this.attachments.open(id, signal); }
  resolveAttachment(id: string, options: AttachmentResolveOptions, signal: AbortSignal, lease?: ContentLease): Promise<ResolvedAttachment> {
    return this.attachments.resolve(id, options, signal, (id, bytes, mime, abort) => this.images.fromBytes(id, bytes, mime, abort), lease);
  }
  private url(path: 'rooms' | 'messages', next?: string, room?: string): URL {
    const url = new URL(next ?? `https://webexapis.com/v1/${path}`);
    if (url.origin !== 'https://webexapis.com' || url.pathname !== `/v1/${path}` || url.username || url.password || url.hash
      || room && next && url.searchParams.get('roomId') !== room) throw new MessagingError('failed', 'Unsafe pagination link refused.');
    if (!next) {
      url.searchParams.set('max', '100');
      if (room) url.searchParams.set('roomId', room);
      else if (path === 'rooms') url.searchParams.set('sortBy', 'lastactivity');
    }
    return url;
  }
  private async request(url: URL, body?: object, signal?: AbortSignal): Promise<{ value: any; next?: string }> {
    const token = this.token();
    if (!validToken(token)) throw new MessagingError('denied', 'Sign in again; access credentials are unavailable.');
    let response: Response;
    try {
      response = await this.fetcher(url.href, { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new MessagingError(this.abort.signal.aborted || signal?.aborted ? 'canceled' : body ? 'unknown' : 'failed', body
      ? 'Delivery UNKNOWN. Check history before retrying; nothing was resent.' : 'Webex request failed or timed out. Refresh explicitly to retry.'); }
    if (!response.ok) {
      await response.body?.cancel();
      const denied = [400, 401, 403, 404, 413, 429].includes(response.status);
      throw new MessagingError([401, 403].includes(response.status) ? 'denied' : body && !denied ? 'unknown' : 'failed',
        [401, 403].includes(response.status) ? 'Webex access denied. Check authorization/scopes.' : body && !denied
          ? 'Delivery UNKNOWN. Check history; no automatic resend.' : `Webex refused the request (${response.status}). Nothing was retried.`, response.status);
    }
    const reader = response.body?.getReader();
    try {
      if (!reader) throw new Error();
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 1_048_576) { await reader.cancel(); throw new Error(); } chunks.push(value);
      }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const next = /<([^>]+)>\s*;\s*rel="?next"?/.exec(response.headers.get('link') ?? '')?.[1];
      return { value, ...(next ? { next } : {}) };
    } catch { throw new MessagingError(body ? 'unknown' : 'failed', body ? 'Delivery UNKNOWN: invalid acknowledgment. Check history; no automatic resend.' : 'Invalid Webex response.'); }
    finally { reader?.releaseLock(); }
  }
  async rooms(next?: string, signal?: AbortSignal): Promise<MessagePage<MessageRoom>> {
    const page = await this.request(this.url('rooms', next), undefined, signal);
    if (!Array.isArray(page.value.items)) throw new MessagingError('failed', 'Invalid space list.');
    const items: MessageRoom[] = [];
    for (const v of page.value.items.slice(0, 100)) {
      if (!v || !chatId(v.id)) continue;
      // Leave missing titles empty for the store to merge with known names;
      // a generated fallback must never overwrite a resolved direct-space name.
      items.push({ id: v.id, title: messageText(v.title, 80).replaceAll('\n', ' ').trim(), type: v.type === 'direct' ? 'direct' : 'group',
        ...(chatId(v.teamId) ? { teamId: v.teamId } : {}),
        ...Object.fromEntries(['isLocked', 'isReadOnly', 'isAnnouncementOnly'].flatMap(key => typeof v[key] === 'boolean' ? [[key, v[key]]] : [])),
        lastActivity: typeof v.lastActivity === 'string' && Number.isFinite(Date.parse(v.lastActivity)) ? new Date(v.lastActivity).toISOString() : '' });
    }
    return { items, next: page.next };
  }
  async history(room: string, next?: string, signal?: AbortSignal): Promise<MessagePage<ChatMessage>> {
    if (!chatId(room)) throw new MessagingError('failed', 'Invalid space.');
    const page = await this.request(this.url('messages', next, room), undefined, signal);
    if (!Array.isArray(page.value.items)) throw new MessagingError('failed', 'Invalid message history.');
    return { items: page.value.items.slice(0, 100).flatMap((v: unknown) => { const item = this.message(v, room); return item ? [item] : []; }), next: page.next };
  }
  async getMessage(room: string, id: string, signal?: AbortSignal): Promise<ChatMessage | undefined> {
    if (!chatId(room) || !chatId(id)) throw new MessagingError('failed', 'Invalid message identity.');
    try {
      const response = await this.request(new URL('https://webexapis.com/v1/messages/' + encodeURIComponent(id)), undefined, signal);
      const item = this.message(response.value, room);
      if (!item || item.id !== id) throw new MessagingError('failed', 'Message revalidation identity mismatch.');
      return item;
    } catch (error) {
      if (error instanceof MessagingError && error.status === 404) return undefined;
      throw error;
    }
  }
  async send(room: string, text: string, parentId?: string): Promise<ChatMessage> {
    if (!chatId(room) || !chatText(text) || parentId !== undefined && !chatId(parentId)) throw new MessagingError('failed', 'Choose a space/reply target and compose 1–1000 characters first.');
    const url = new URL('https://webexapis.com/v1/messages');
    const page = await this.request(url, { roomId: room, text, ...(parentId !== undefined ? { parentId } : {}) });
    if (!validMessageAck(page.value, { roomId: room, parentId, content: text, format: 'plain' })) {
      throw new MessagingError('unknown', 'Delivery UNKNOWN: raw acknowledgment did not match the submitted message. Check history; nothing was replayed.');
    }
    const item = parseMessage(page.value, room);
    if (!item || item.parentId !== parentId) throw new MessagingError('unknown', 'Delivery UNKNOWN: acknowledgment did not match the space/reply target. Check history.');
    return item;
  }
  close(): void { this.abort.abort(); this.images.close(); this.attachments.close(); this.token = () => ''; }
}
/** Account-free multi-space sandbox. Never makes network requests. */
export function demoMessageAPI(client: 'standalone' | 'editor' = 'standalone'): MessagingAPI {
  const rooms: MessageRoom[] = [
    { id: 'demo-general', title: '# general · local demo', type: 'group', lastActivity: '' },
    { id: 'demo-engineering', title: '# engineering', type: 'group', lastActivity: '', teamId: 'demo-team' },
    { id: 'demo-alex', title: 'Alex Chen · direct', type: 'direct', lastActivity: '' },
  ];
  let next = 0;
  let roomNext = 0, memberNext = 0;
  type DemoMember = { id: string; roomId: string; personId: string; personDisplayName: string; isModerator: boolean };
  const memberships = new Map<string, DemoMember[]>();
  const directRooms = new Map<string, string>([['demo-other', 'demo-alex']]);
  // Independent synthetic Team data/role; never derived from Room roles or a joined display label.
  const teamNames = new Map([['demo-team', 'Engineering · Server Team DEMO'], ['demo-other-team', 'Demo Team']]);
  const renamedTeams = new Set<string>();
  const teamDescriptions = new Map([...teamNames.keys()].map(id => [id, 'Synthetic Team description · DEMO']));
  // Synthetic provider field only, never installed in main room metadata/cache.
  const descriptions = new Map(rooms.filter(room => room.type === 'group')
    .map(room => [room.id, 'Synthetic space description · DEMO']));
  const moderation = new Map(rooms.filter(room => room.type === 'group')
    .map(room => [room.id, { creatorId: 'demo-self', isLocked: false }]));
  const announcements = new Map(rooms.filter(room => room.type === 'group').map(room => [room.id, false]));
  const details = (room: MessageRoom) => ({ ...room, ...moderation.get(room.id), isLocked: moderation.get(room.id)?.isLocked ?? false,
    isPublic: false, isAnnouncementOnly: announcements.get(room.id) ?? false,
    ...(descriptions.has(room.id) ? { description: descriptions.get(room.id) } : {}) });
  const members = (roomId: string): DemoMember[] => {
    let items = memberships.get(roomId);
    if (!items) {
      items = ['demo-self', 'demo-other'].map(personId => ({ id: `demo-membership-${++memberNext}`, roomId, personId,
        personDisplayName: personId === 'demo-self' ? 'You · DEMO' : 'Participant · DEMO',
        isModerator: roomId === 'demo-engineering' && personId === 'demo-self' }));
      memberships.set(roomId, items);
    }
    return items;
  };
  const history = new Map(rooms.map(room => [room.id, [
    { id: `welcome-${room.id}`, author: 'Alex Chen · DEMO', created: '2026-01-01T12:00:00.000Z', text: room.id === 'demo-general'
      ? client === 'editor' ? 'Welcome to Webex in Vim/Neovim. j/k moves through spaces; Enter opens one like a file. Press i in history to compose. Esc, then <localleader>s sends locally. Nothing goes to Webex in this demo.'
        : 'Welcome to WBX Messaging. j/k select a space, Enter opens it. Press i to compose; Ctrl+s sends locally. Esc returns to Normal mode.'
      : 'This is a separate local conversation. Drafts stay bound to their destination.' },
    { id: `tips-${room.id}`, author: 'Morgan · DEMO', created: '2026-01-01T12:01:00.000Z', text: client === 'editor'
      ? 'Backspace in history returns to spaces; / searches their titles. Your editor owns modes, undo, registers, splits and colorschemes. Drafts stay bound to their space; Enter in a draft is a newline and writing never sends.'
      : 'Try :theme forest, :layout detailed, /search, and Ctrl+w h/j/k/l. All keys and panel layouts are configurable.' },
  ] as ChatMessage[]]));
  return { rooms: async () => ({ items: rooms.filter(room => members(room.id).some(item => item.personId === 'demo-self')) }), history: async room => {
    if (!members(room).some(item => item.personId === 'demo-self')) throw new MessagingError('denied', 'Not a demo member.');
    return { items: [...(history.get(room) ?? [])] };
  },
    send: async (room, text, parentId) => {
      const items = history.get(room); if (!items) throw new MessagingError('failed', 'Unknown demo space.');
      const item = { id: `local-${++next}`, author: 'You · DEMO', created: new Date().toISOString(), text, ...(parentId !== undefined ? { parentId } : {}) };
      items.push(item); if (items.length > 200) items.shift(); return item;
    }, demoRichMessage: async (room, markdown, parentId) => {
      const items = history.get(room); if (!items) throw new MessagingError('failed', 'Unknown demo space.');
      const item: ChatMessage = { id: `local-${++next}`, author: 'You · DEMO', created: new Date().toISOString(), text: markdown, markdown,
        ...(parentId ? { parentId } : {}) };
      items.push(item); if (items.length > 200) items.shift(); return item;
    }, demoMessageAction: async (room, id, action, content, format) => {
      const items = history.get(room), index = items?.findIndex(item => item.id === id) ?? -1;
      if (!items || index < 0) throw new MessagingError('failed', 'Demo message unavailable.');
      let item = items[index]!;
      if (action === 'delete') { items.splice(index, 1); return; }
      if (action === 'edit') {
        item = { ...item, text: content!, markdown: format === 'markdown' ? content : undefined,
          edited: true, updated: new Date().toISOString() };
        items[index] = item;
      }
      return { ...item, roomId: room, personEmail: item.author, personId: item.author.startsWith('You') ? 'demo-self' : 'demo-other' };
    }, demoConversation: async (action, input) => {
      const room = rooms.find(room => room.id === input.roomId);
      if (action === 'query-messages') {
        if (!room || !members(room.id).some(item => item.personId === 'demo-self')) throw new MessagingError('denied', 'Not a demo member.');
        if (input.mentionsOnly) return { items: [{ id: 'demo-mention-' + room.id, roomId: room.id, personId: 'demo-other',
          personEmail: 'Participant · DEMO', created: '2026-01-01T12:02:00.000Z',
          text: 'Synthetic @me query result. This was not inserted into main history and does not mark anything read.' }] };
        return { items: (history.get(room.id) ?? []).filter(item => item.parentId === input.parentId).map(item => ({
          ...item, roomId: room.id, personId: item.author.startsWith('You') ? 'demo-self' : 'demo-other', personEmail: item.author })) };
      }
      if (action === 'room') {
        if (!room) throw new MessagingError('failed', 'Unknown demo space.');
        return details(room);
      }
      if (action === 'announcement') {
        if (!room || room.type !== 'group' || room.teamId !== undefined || moderation.get(room.id)?.isLocked !== true
          || typeof input.title !== 'string' || typeof input.isAnnouncementOnly !== 'boolean') throw new MessagingError('failed', 'Not an already moderated standalone demo space.');
        announcements.set(room.id, input.isAnnouncementOnly);
        return { ...details(room), title: input.title }; // No synthetic message or notification.
      }
      if (action === 'lock') {
        const state = room && moderation.get(room.id);
        if (!room || room.type !== 'group' || room.teamId !== undefined || !state || typeof input.title !== 'string'
          || typeof input.isLocked !== 'boolean') throw new MessagingError('failed', 'Not a standalone demo moderation transition.');
        state.isLocked = input.isLocked;
        // Deliberate sandbox role model only, not a claim about live unlock roles.
        const own = members(room.id).find(item => item.personId === 'demo-self');
        if (own) own.isModerator = input.isLocked;
        return { ...details(room), title: input.title };
      }
      if (action === 'description-clear') {
        if (!room || room.type !== 'group' || room.teamId !== undefined || typeof input.title !== 'string'
          || input.description !== ' ' || announcements.get(room.id) !== false) throw new MessagingError('failed', 'Not a bounded standalone demo description clear.');
        descriptions.set(room.id, '');
        // Explicit empty is a sandbox model, not a canonical service ACK promise.
        return { ...details(room), title: input.title };
      }
      if (action === 'describe') {
        if (!room || room.type !== 'group' || room.teamId !== undefined || typeof input.title !== 'string'
          || typeof input.description !== 'string') throw new MessagingError('failed', 'Not a standalone demo description.');
        room.title = input.title; descriptions.set(room.id, input.description);
        return details(room);
      }
      if (action === 'rename') {
        if (!room || room.type !== 'group' || room.teamId !== undefined || typeof input.title !== 'string') throw new MessagingError('failed', 'Not a standalone demo group.');
        room.title = input.title;
        return details(room);
      }
      if (action === 'create') {
        const item: MessageRoom = { id: 'demo-created-' + ++roomNext, title: String(input.title), type: 'group', lastActivity: '', isLocked: false };
        rooms.push(item); history.set(item.id, []);
        descriptions.set(item.id, ''); // Explicit synthetic empty, not an inferred provider omission.
        moderation.set(item.id, { creatorId: 'demo-self', isLocked: false });
        announcements.set(item.id, false);
        memberships.set(item.id, [{ id: 'demo-membership-' + ++memberNext, roomId: item.id, personId: 'demo-self', personDisplayName: 'You · DEMO', isModerator: false }]);
        return { ...item };
      }
      if (action === 'members') return { items: members(String(input.roomId)).filter(item => !input.personId || item.personId === input.personId) };
      if (action === 'membership') {
        for (const items of memberships.values()) { const item = items.find(item => item.id === input.id); if (item) return { ...item }; }
        throw new MessagingError('failed', 'Unknown demo membership.');
      }
      if (action === 'invite') {
        const items = members(String(input.roomId));
        if (items.some(item => item.personId === input.personId)) throw new MessagingError('failed', 'Already a demo member.');
        const item = { id: 'demo-membership-' + ++memberNext, roomId: String(input.roomId), personId: String(input.personId), personDisplayName: 'Invited · DEMO', isModerator: false };
        items.push(item); return { ...item };
      }
      if (action === 'remove') {
        for (const items of memberships.values()) { const at = items.findIndex(item => item.id === input.id); if (at >= 0) { items.splice(at, 1); return; } }
        throw new MessagingError('failed', 'Unknown demo membership.');
      }
      if (action === 'direct') {
        let target = room ?? rooms.find(room => room.id === directRooms.get(String(input.personId)));
        if (!target) {
          target = { id: 'demo-direct-' + ++roomNext, title: 'Direct · DEMO', type: 'direct', lastActivity: '' };
          directRooms.set(String(input.personId), target.id); rooms.push(target); history.set(target.id, []);
        }
        const peer = input.personId ?? [...directRooms].find(([, id]) => id === target.id)?.[0];
        const item: ChatMessage = { id: 'local-' + ++next, author: 'You · DEMO', created: new Date().toISOString(),
          text: String(input.markdown ?? input.text ?? ''), ...(typeof input.markdown === 'string' ? { markdown: input.markdown } : {}) };
        history.get(target.id)!.push(item);
        return { ...item, personId: 'demo-self', toPersonId: peer, roomId: target.id,
          ...(input.file ? { files: ['https://webexapis.com/v1/contents/demo-direct-' + item.id] } : {}) };
      }
      if (action === 'teams') return { items: [...teamNames].map(([id, name]) => ({ id, name: renamedTeams.has(id) ? name : 'Demo Team' })) };
      if (['team', 'team-rename', 'team-describe', 'team-members'].includes(action) && teamNames.has(String(input.id))) {
        const id = String(input.id);
        if (action === 'team-members') return { items: [{ id: 'demo-team-member-' + id, teamId: id, personId: 'demo-self', isModerator: id === 'demo-team' }] };
        if (action === 'team-rename') {
          if (id !== 'demo-team' || typeof input.name !== 'string') throw new MessagingError('failed', 'Demo Team moderator proof refused.');
          teamNames.set(id, input.name); renamedTeams.add(id);
        }
        if (action === 'team-describe') {
          if (id !== 'demo-team' || input.name !== teamNames.get(id) || typeof input.description !== 'string') throw new MessagingError('failed', 'Demo Team description proof refused.');
          teamDescriptions.set(id, input.description);
        }
        return { id, name: teamNames.get(id), description: teamDescriptions.get(id) };
      }
      throw new MessagingError('failed', 'Unsupported demo operation.');
    }, close() {} };
}
