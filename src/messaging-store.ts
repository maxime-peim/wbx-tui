import { chatId, chatText, type ChatMessage } from './chat-protocol.js';
import { MessagingError, parseMessage, recentRooms, activityTime, type MessageRoom, type MessagingAPI } from './messaging-api.js';
import type { OpenedImage } from './message-images.js';
import type { OpenedAttachment } from './message-attachments.js';
import type { AttachmentResolveOptions, ResolvedAttachment } from './attachment-policy.js';
import { safeSpaceTitle } from './action-contracts.js';

const chronological = (a: ChatMessage, b: ChatMessage): number => a.created.localeCompare(b.created) || a.id.localeCompare(b.id);
const ROOM_LIMIT = 500, MESSAGE_LIMIT = 500, ROOM_METADATA_LIMIT = 1000;
const ROOM_LIMIT_NOTICE = 'Space limit: 500 loaded. Further paging cannot bypass this cap. Use Webex for destinations outside this bounded catalogue; no membership change is required.';
const sameMessage = (a: ChatMessage, b: ChatMessage): boolean => a.id === b.id && a.author === b.author && a.created === b.created
  && a.text === b.text && a.markdown === b.markdown && a.updated === b.updated && a.edited === b.edited && a.quoted === b.quoted && a.parentId === b.parentId && JSON.stringify(a.images) === JSON.stringify(b.images)
  && JSON.stringify(a.attachments) === JSON.stringify(b.attachments) && JSON.stringify(a.cards) === JSON.stringify(b.cards);

export interface Delivery { requestId: string; roomId: string; text: string; parentId?: string; messageId?: string; attachmentId?: string; draftId?: string; format?: 'markdown'; status: 'sent' | 'failed' | 'unknown'; message: string }
export interface PreparedMessage { identity: string; attachmentId?: string; draftId: string; format?: 'markdown'; send(): Promise<ChatMessage> }
/** Bounded selected-space polling, pagination and fail-closed destination checks. */
export class MessagingStore {
  rooms: MessageRoom[] = [];
  room?: MessageRoom;
  messages: ChatMessage[] = [];
  loading = false;
  loadingRooms = false;
  /** Latest admitted catalogue read only; merged metadata is not discovery proof.
   * Presentation evidence, never membership, mutation or receipt authority. */
  roomsStatus: 'unverified' | 'loading' | 'ready' | 'failed' = 'unverified';
  sending = false;
  ready = false;
  notice = '';
  moreRooms = false;
  moreHistory = false;
  /** Not necessarily loaded/displayed: receipt admission must check this endpoint. */
  latestMessageId?: string;
  historyAtLimit = false;
  uncertain = new Set<string>();
  onChange = () => {};
  onAccessLost = (_room: string) => {};
  /** Accepted live observations only; optional display storage cannot supply rows here. */
  onMessages = (_room: string, _messages: ChatMessage[]) => {};
  onMessageDeleted = (_room: string, _id: string) => {};
  onDelivery = (_: Delivery) => {};
  private roomsNext?: string;
  private historyNext?: string;
  private roomsCursors = new Set<string>();
  private historyCursors = new Set<string>();
  private historyInitialized = false;
  private historyExhausted = false;
  private historyStalled = false;
  private latestMessage?: ChatMessage;
  // Independent of first-page membership. Never cache generated fallback titles.
  private roomMetadataCache = new Map<string, MessageRoom>();
  /** Only guards the one already-in-flight room-list read; never a sticky title override. */
  private roomTitleFence?: Map<string, string>;
  private closed = false;
  private epoch = 0;
  private revision = 0;
  private deleted = new Set<string>();
  private blockedRooms = new Set<string>();
  private invalidationLimit = false;
  private reconciliationCursor = 0;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private imageAbort?: AbortController;
  private imageLoading = false;
  private imageRequests = new Set<string>();
  private attachmentAbort?: AbortController;
  private attachmentLoading = false;
  private metadataRequests = new Set<string>();
  private metadataSettled?: Promise<void>;
  private destinationAbort = new AbortController();
  get attachmentSignal(): AbortSignal { return this.destinationAbort.signal; }
  private requests = new Map<string, { roomId: string; text: string; parentId?: string; identity?: string; result?: Delivery }>();
  constructor(private api: MessagingAPI, private pollMs = 4000, readonly mode: 'live' | 'demo' = 'live') {}
  /** Actual observed message time, including endpoints withheld by the view cap. */
  get latestMessageCreated(): string | undefined { return this.latestMessage?.created; }
  private emit(): void { if (!this.closed) this.onChange(); }
  private error(error: unknown): string { return error instanceof MessagingError ? error.message : 'Messaging failed. No request was retried.'; }
  private displayRoom(room: MessageRoom): MessageRoom {
    return { ...room, title: room.title || (room.type === 'direct' ? 'Direct conversation' : 'Untitled space') };
  }
  private roomMetadata(room: MessageRoom, authoritative = false): MessageRoom {
    const previous = this.roomMetadataCache.get(room.id);
    const title = room.title.trim(), email = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const displayTitle = room.type === 'direct' && previous?.type === 'direct' && previous.title && !email(previous.title) && email(title)
      ? previous.title : title || previous?.title || '';
    const metadata = { id: room.id, type: room.type, title: displayTitle,
      lastActivity: activityTime(previous?.lastActivity ?? '') > activityTime(room.lastActivity) ? previous!.lastActivity : room.lastActivity,
      ...Object.fromEntries(['teamId', 'isLocked', 'isReadOnly', 'isAnnouncementOnly'].flatMap<[string, string | boolean]>(key => {
        const value = room[key as keyof MessageRoom] ?? (!authoritative ? previous?.[key as keyof MessageRoom] : undefined);
        return key === 'teamId' ? chatId(value) ? [[key, value]] : [] : typeof value === 'boolean' ? [[key, value]] : [];
      })) };
    this.roomMetadataCache.delete(room.id); this.roomMetadataCache.set(room.id, metadata);
    if (this.roomMetadataCache.size > ROOM_METADATA_LIMIT) {
      const pinned = new Set(this.rooms.map(item => item.id)); if (this.room) pinned.add(this.room.id);
      for (const id of this.roomMetadataCache.keys()) {
        if (!pinned.has(id)) { this.roomMetadataCache.delete(id); break; }
      }
    }
    return this.displayRoom(metadata);
  }
  private selectedMetadata(): void {
    if (!this.room) return;
    const cached = this.roomMetadataCache.get(this.room.id);
    this.room = this.rooms.find(room => room.id === this.room!.id) ?? (cached ? this.displayRoom(cached) : this.room);
  }
  mergeRooms(items: MessageRoom[]): void {
    if (this.closed || this.invalidationLimit) return;
    const rooms = new Map(this.rooms.map(room => [room.id, room]));
    for (const room of items) {
      if (this.blockedRooms.has(room.id)) continue;
      rooms.set(room.id, this.roomMetadata(room));
    }
    this.rooms = recentRooms([...rooms.values()]).slice(0, ROOM_LIMIT);
    if (this.rooms.length >= ROOM_LIMIT) {
      this.roomsNext = undefined; this.moreRooms = false;
      this.notice = ROOM_LIMIT_NOTICE;
    }
    this.selectedMetadata();
    this.emit();
  }
  renameRoomTitle(roomId: string, title: string): void {
    if (this.closed || this.isRevoked(roomId) || !safeSpaceTitle(title) || !this.rooms.some(room => room.id === roomId)) return;
    this.rooms = this.rooms.map(room => room.id === roomId ? { ...room, title } : room);
    const cached = this.roomMetadataCache.get(roomId);
    if (cached) this.roomMetadataCache.set(roomId, { ...cached, title });
    if (this.room?.id === roomId) this.room = { ...this.room, title };
    this.roomTitleFence?.set(roomId, title);
    this.emit();
  }
  async loadRooms(more = false): Promise<boolean> {
    if (this.closed || this.invalidationLimit || this.loadingRooms || more && !this.roomsNext) return false;
    const titleFence = this.roomTitleFence = new Map<string, string>();
    this.loadingRooms = true; this.roomsStatus = 'loading'; this.emit();
    try {
      const cursor = more ? this.roomsNext : undefined;
      const page = await this.api.rooms(cursor);
      if (this.closed || this.invalidationLimit) return false;
      if (!more) this.roomsCursors.clear();
      if (cursor) this.roomsCursors.add(cursor);
      const rooms = new Map((more ? this.rooms : []).map(room => [room.id, room]));
      const before = rooms.size;
      page.items.filter(room => !this.blockedRooms.has(room.id)).forEach(room => rooms.set(room.id,
        this.roomMetadata(titleFence.has(room.id) ? { ...room, title: titleFence.get(room.id)! } : room, true)));
      const stalled = (more && rooms.size === before) || (!!page.next && this.roomsCursors.has(page.next));
      this.rooms = recentRooms([...rooms.values()]).slice(0, ROOM_LIMIT);
      this.roomsNext = this.rooms.length < ROOM_LIMIT && !stalled ? page.next : undefined;
      this.selectedMetadata();
      this.moreRooms = !!this.roomsNext; this.notice = this.rooms.length >= ROOM_LIMIT ? ROOM_LIMIT_NOTICE
        : stalled ? 'Space pagination stopped: the provider returned no progress or a repeated cursor. Refresh explicitly to retry.' : '';
      this.roomsStatus = stalled ? 'failed' : 'ready';
      return true;
    } catch (error) { if (!this.closed) { this.roomsStatus = 'failed'; this.notice = this.error(error); } }
    finally {
      if (this.roomTitleFence === titleFence) this.roomTitleFence = undefined;
      if (!this.closed && this.roomsStatus === 'loading') this.roomsStatus = 'failed';
      this.loadingRooms = false; this.emit();
    }
    return false;
  }
  private activity(roomId: string, messages: ChatMessage[]): void {
    const room = this.roomMetadataCache.get(roomId) ?? this.rooms.find(room => room.id === roomId) ?? (this.room?.id === roomId ? this.room : undefined);
    if (!room) return;
    const latest = messages.reduce((value, message) => activityTime(message.created) > activityTime(value) ? message.created : value, room.lastActivity);
    if (latest === room.lastActivity) return;
    const updated = this.roomMetadata({ ...room, lastActivity: latest });
    this.rooms = recentRooms(this.rooms.map(item => item.id === roomId ? updated : item));
    if (this.room?.id === roomId) this.room = updated;
  }
  private rememberLatest(messages: ChatMessage[]): void {
    for (const message of messages) if (!this.latestMessage || chronological(message, this.latestMessage) >= 0) this.latestMessage = message;
    this.latestMessageId = this.latestMessage?.id;
  }
  private mergeMessages(items: ChatMessage[], revision = this.revision): number {
    const messages = new Map(this.messages.map(message => [message.id, message]));
    const additions = new Map<string, ChatMessage>();
    for (const incoming of items) {
      if (this.deleted.has(JSON.stringify([this.room?.id, incoming.id]))) continue;
      let item = incoming;
      const previous = messages.get(item.id);
      if (previous?.images && item.images) item = { ...item, images: item.images.map(image =>
        image.state === 'pending' ? previous.images!.find(known => known.id === image.id && known.state !== 'pending') ?? image : image) };
      if (previous?.attachments && item.attachments) item = { ...item, attachments: item.attachments.map(file =>
        file.name === undefined ? previous.attachments!.find(known => known.id === file.id) ?? file : file) };
      if (previous) {
        if (revision === this.revision && !sameMessage(previous, item)) messages.set(item.id, item);
      } else additions.set(item.id, item);
    }
    const available = Math.max(0, MESSAGE_LIMIT - messages.size), sorted = [...additions.values()].sort(chronological);
    // Keep every loaded anchor. Admit the nearest older/newest additions only
    // while space remains; the known latest endpoint is tracked independently.
    const admitted = available ? sorted.slice(-available) : [];
    for (const message of admitted) messages.set(message.id, message);
    const next = [...messages.values()].sort(chronological);
    if (next.length !== this.messages.length || next.some((item, index) => item !== this.messages[index])) this.messages = next;
    this.historyAtLimit = this.messages.length >= MESSAGE_LIMIT;
    return admitted.length;
  }
  async select(id: string, reload = false): Promise<void> {
    const room = this.rooms.find(room => room.id === id); if (this.closed || this.invalidationLimit || !room) return;
    if (!reload && this.room?.id === id && (this.ready || this.loading)) return;
    this.destinationAbort.abort(); this.destinationAbort = new AbortController();
    this.imageAbort?.abort();
    this.attachmentAbort?.abort();
    this.imageRequests.clear();
    this.metadataRequests.clear();
    this.abort?.abort(); clearTimeout(this.timer); this.epoch++;
    this.room = room; this.messages = []; this.historyNext = undefined; this.moreHistory = false;
    this.historyCursors.clear(); this.historyInitialized = false; this.historyExhausted = false; this.historyStalled = false;
    this.latestMessage = undefined; this.latestMessageId = undefined; this.historyAtLimit = false;
    this.reconciliationCursor = 0;
    this.loading = false; this.ready = false; this.notice = ''; this.emit(); await this.refresh();
  }
  async loadAttachmentMetadata(room: string, messageId: string): Promise<void> {
    const message = this.messages.find(item => item.id === messageId);
    if (this.closed || this.attachmentLoading || this.room?.id !== room || !this.ready || !message?.attachments || !this.api.attachmentMetadata) return;
    const ids = message.attachments.filter(file => file.name === undefined && !this.metadataRequests.has(file.id)).map(file => file.id);
    if (!ids.length || this.metadataRequests.size + ids.length > 64) return;
    ids.forEach(id => this.metadataRequests.add(id));
    const epoch = this.epoch, signal = this.destinationAbort.signal;
    this.attachmentLoading = true;
    let settled!: () => void;
    this.metadataSettled = new Promise<void>(resolve => { settled = resolve; });
    try {
      const files = await this.api.attachmentMetadata(ids, signal);
      if (this.closed || signal.aborted || epoch !== this.epoch || this.room?.id !== room) return;
      this.messages = this.messages.map(item => item.id === messageId ? { ...item, attachments: item.attachments?.map(file =>
        files.find(known => known.id === file.id && ids.includes(known.id)) ?? file) } : item);
      this.emit();
    } catch { /* Passive labels fail quietly; no body download or automatic retry. */ }
    finally { this.attachmentLoading = false; this.metadataSettled = undefined; settled(); }
  }
  async loadImages(room: string, messageId: string): Promise<void> {
    const message = this.messages.find(item => item.id === messageId);
    if (this.closed || this.imageLoading || this.room?.id !== room || !this.ready || !message?.images?.some(image => image.state === 'pending') || !this.api.previews) return;
    const pending = message.images.filter(image => image.state === 'pending');
    if (pending.some(image => this.imageRequests.has(image.id))) return;
    if (this.imageRequests.size + pending.length > 16) {
      this.messages = this.messages.map(item => item === message ? { ...item, images: item.images!.map(image => image.state === 'pending' ? { id: image.id, state: 'unavailable' as const } : image) } : item);
      this.emit(); return;
    }
    pending.forEach(image => this.imageRequests.add(image.id));
    const epoch = this.epoch, abort = this.imageAbort = new AbortController();
    const ids = message.images.map(image => image.id);
    this.imageLoading = true;
    try {
      const images = await this.api.previews(ids, abort.signal);
      if (this.closed || epoch !== this.epoch || abort.signal.aborted || this.room?.id !== room) return;
      this.messages = this.messages.map(item => item.id === messageId && JSON.stringify(item.images?.map(image => image.id)) === JSON.stringify(ids) ? { ...item, images } : item);
      this.emit();
    } finally { this.imageLoading = false; }
  }
  async openImage(room: string, messageId: string, imageId: string): Promise<OpenedImage> {
    const admitted = () => !this.closed && this.room?.id === room && this.ready
      && this.messages.some(item => item.id === messageId && (item.images?.some(image => image.id === imageId)
        || item.attachments?.some(file => file.id === imageId)));
    if (!admitted() || this.imageLoading || !this.api.openImage) throw new MessagingError('failed', 'Image is not available in the loaded space, or another image read is active.');
    const epoch = this.epoch, abort = this.imageAbort = new AbortController();
    this.imageLoading = true;
    try {
      const image = await this.api.openImage(imageId, abort.signal);
      if (abort.signal.aborted || epoch !== this.epoch || !admitted() || image.id !== imageId) throw new MessagingError('canceled', 'Image opening canceled.');
      return image;
    } finally { this.imageLoading = false; }
  }
  async openAttachment(room: string, messageId: string, attachmentId: string): Promise<OpenedAttachment> {
    const admitted = () => !this.closed && this.room?.id === room && this.ready
      && this.messages.some(item => item.id === messageId && item.attachments?.some(file => file.id === attachmentId));
    if (!admitted() || this.attachmentLoading || !this.api.openAttachment) throw new MessagingError('failed', 'Attachment is not available in the loaded space, or another attachment read is active.');
    const epoch = this.epoch, abort = this.attachmentAbort = new AbortController();
    this.attachmentLoading = true;
    try {
      const attachment = await this.api.openAttachment(attachmentId, abort.signal);
      if (abort.signal.aborted || epoch !== this.epoch || !admitted() || attachment.id !== attachmentId) throw new MessagingError('canceled', 'Attachment opening canceled.');
      return attachment;
    } catch (error) {
      if (error instanceof MessagingError) throw error;
      throw new MessagingError('failed', 'Attachment unavailable. Check access and the 6 MB limit. Retry explicitly.');
    } finally { this.attachmentLoading = false; }
  }
  /** A closure captures the destination epoch, not just an equal room ID. */
  attachmentOwner(room: string, messageId: string, attachmentId: string): () => boolean {
    const epoch = this.epoch;
    return () => !this.closed && epoch === this.epoch && this.room?.id === room && this.ready
      && this.messages.some(item => item.id === messageId && item.attachments?.some(file => file.id === attachmentId));
  }
  get contentAdmission() { return this.api.contentAdmission; }
  conversationOwner(room: string): () => boolean {
    const epoch = this.epoch;
    return () => !this.closed && epoch === this.epoch && this.room?.id === room && this.ready && this.rooms.some(item => item.id === room);
  }
  isRevoked(room: string): boolean { return this.invalidationLimit || this.blockedRooms.has(room); }
  revokeRoom(room: string): void {
    if (this.closed) return;
    if (this.blockedRooms.size < 1000) this.blockedRooms.add(room);
    else if (!this.blockedRooms.has(room)) this.stopInvalidations();
    this.rooms = this.rooms.filter(item => item.id !== room);
    if (this.room?.id === room) {
      this.destinationAbort.abort(); this.abort?.abort(); this.imageAbort?.abort(); this.attachmentAbort?.abort();
      clearTimeout(this.timer); this.epoch++; this.ready = false; this.loading = false;
      if (!this.invalidationLimit) this.notice = 'Membership unavailable/left. Drafts retained; stale metadata cannot restore authority in this session.';
    }
    this.emit();
  }
  acceptExternalMessage(room: MessageRoom, message: ChatMessage): void {
    if (this.closed || this.blockedRooms.has(room.id)) return;
    this.mergeRooms([room]);
    if (this.room?.id === room.id && this.ready) {
      this.revision++; this.rememberLatest([message]); this.mergeMessages([message]);
    }
    this.onMessages(room.id, [message]); this.activity(room.id, [message]); this.emit();
  }
  demoConversation(action: string, input: Record<string, unknown>): Promise<unknown> {
    if (this.mode !== 'demo' || !this.api.demoConversation) throw new MessagingError('failed', 'Demo conversation operation unavailable.');
    return this.api.demoConversation(action, input);
  }
  reconcileMutation(room: string, id: string, item?: ChatMessage): void {
    if (this.closed || this.room?.id !== room) return;
    this.revision++;
    if (!item) this.rememberDeletion(room, id);
    else this.onMessages(room, [item]);
    // Keep the canonical receipt endpoint unchanged. If deleted, historyLatest
    // stays false until explicit latest-endpoint revalidation.
    this.messages = item ? this.messages.map(message => message.id === id ? { ...item, edited: true } : message)
      : this.messages.filter(message => message.id !== id);
    this.emit();
  }
  /** Remote deletion evidence never creates a mutation context or new authority. */
  observeDeletion(room: string, id: string): void {
    if (this.closed || this.deleted.has(JSON.stringify([room, id]))) return;
    if (this.room?.id === room) this.reconcileMutation(room, id);
    else this.rememberDeletion(room, id);
  }
  private rememberDeletion(room: string, id: string): void {
    this.onMessageDeleted(room, id);
    const key = JSON.stringify([room, id]);
    if (this.deleted.size < 1000) this.deleted.add(key);
    else if (!this.deleted.has(key)) this.stopInvalidations();
  }
  private stopInvalidations(): void {
    if (this.invalidationLimit) return;
    this.invalidationLimit = true; this.ready = false; this.loading = false; this.epoch++;
    this.destinationAbort.abort(); this.abort?.abort(); this.imageAbort?.abort(); this.attachmentAbort?.abort();
    clearTimeout(this.timer);
    this.notice = 'Reconciliation identity budget reached. Drafts retained; reconnect explicitly before further operations.';
    this.emit();
  }
  private async reconcileLoaded(page: ChatMessage[], room: string, epoch: number, revision: number, signal: AbortSignal): Promise<void> {
    if (!this.api.getMessage || this.mode !== 'live' || signal.aborted || !this.ready) return;
    const present = new Set(page.map(item => item.id));
    const candidates = this.messages.filter(item => !present.has(item.id));
    if (!candidates.length) return;
    // One extra read per normal polling cycle, serial with history. Missing
    // canonical endpoint first; otherwise bounded round-robin over loaded IDs.
    const target = candidates.find(item => item.id === this.latestMessageId) ?? candidates[this.reconciliationCursor++ % candidates.length]!;
    // Only this extra-read path needs an interim publication. Keep ordinary
    // selection/loading/result transitions unchanged for all other consumers.
    this.emit();
    try {
      const item = await this.api.getMessage(room, target.id, signal);
      if (signal.aborted || this.closed || this.epoch !== epoch || this.revision !== revision
        || this.room?.id !== room || !this.ready || !this.messages.some(item => item.id === target.id)) return;
      if (item && (item.id !== target.id || item.created !== target.created || sameMessage(target, item)
        || target.updated && (!item.updated || item.updated <= target.updated))) return;
      this.reconcileMutation(room, target.id, item);
    } catch {
      // A timeout/denial/malformed response is not a tombstone or retry trigger.
      if (!signal.aborted && !this.closed && this.epoch === epoch) this.notice = 'Some loaded message changes could not be revalidated; existing text retained.';
    }
  }
  demoMessageAction(room: string, id: string, action: 'get' | 'edit' | 'delete', content?: string, format?: 'plain' | 'markdown'): Promise<unknown> {
    if (this.mode !== 'demo' || !this.api.demoMessageAction) throw new MessagingError('failed', 'Demo action unavailable.');
    return this.api.demoMessageAction(room, id, action, content, format);
  }
  async resolveAttachment(room: string, messageId: string, attachmentId: string, options: AttachmentResolveOptions, parent: AbortSignal,
    lease?: import('./content-admission.js').ContentLease): Promise<ResolvedAttachment> {
    const epoch = this.epoch;
    // Wait for passive metadata bookkeeping as well as physical I/O, never retry the content read.
    if (this.metadataSettled) await this.metadataSettled;
    const admitted = () => !this.closed && this.room?.id === room && this.ready
      && this.messages.some(item => item.id === messageId && item.attachments?.some(file => file.id === attachmentId));
    if (epoch !== this.epoch || !admitted() || parent.aborted || this.attachmentLoading || !this.api.resolveAttachment) throw new MessagingError('failed', 'Attachment destination is unavailable or busy.');
    const abort = this.attachmentAbort = new AbortController();
    const signal = AbortSignal.any([parent, abort.signal]); this.attachmentLoading = true;
    try {
      const opened = await this.api.resolveAttachment(attachmentId, options, signal, lease);
      if (signal.aborted || epoch !== this.epoch || !admitted() || opened.meta.id !== attachmentId) throw new MessagingError('canceled', 'Attachment opening canceled.');
      return opened;
    } catch (error) {
      if (error instanceof MessagingError) throw error;
      throw new MessagingError('failed', 'Attachment unavailable or busy. Check format, access and original/image limits. Retry explicitly.');
    } finally { this.attachmentLoading = false; }
  }
  async refresh(older = false): Promise<void> {
    if (this.closed || this.invalidationLimit || !this.room || this.blockedRooms.has(this.room.id) || this.loading || older && (!this.historyNext || this.historyExhausted || this.historyAtLimit)) return;
    clearTimeout(this.timer);
    const epoch = this.epoch, room = this.room.id, revision = this.revision;
    const abort = this.abort = new AbortController(); this.loading = true; this.emit();
    try {
      const cursor = older ? this.historyNext : undefined;
      const page = await this.api.history(room, cursor, abort.signal);
      if (this.closed || epoch !== this.epoch) return;
      this.rememberLatest(page.items);
      const added = this.mergeMessages(page.items, revision);
      this.activity(room, page.items);
      if (cursor) this.historyCursors.add(cursor);
      const stalled = older && (added === 0 || (!!page.next && this.historyCursors.has(page.next)));
      if (!this.historyInitialized || older) {
        this.historyInitialized = true;
        this.historyStalled = stalled;
        this.historyExhausted = !page.next || stalled;
        this.historyNext = !this.historyExhausted && !this.historyAtLimit ? page.next : undefined;
      }
      if (this.historyAtLimit) this.historyNext = undefined;
      this.moreHistory = !!this.historyNext;
      this.notice = this.historyAtLimit ? 'History limit: 500. Loaded messages were retained; latest messages are not loaded.'
        : this.historyStalled ? 'History pagination stopped: the provider returned no progress or a repeated cursor. Switch spaces and back to retry.' : '';
      this.ready = true;
      this.onMessages(room, page.items.filter(item => !this.deleted.has(JSON.stringify([room, item.id]))));
      if (!older) await this.reconcileLoaded(page.items, room, epoch, revision, abort.signal);
    } catch (error) {
      if (!this.closed && error instanceof MessagingError && error.status === 403) {
        // A positive denial names THIS request's room, not whatever the user
        // selected while it was in flight. Token expiry (401) is not this proof.
        this.revokeRoom(room); this.onAccessLost(room);
      } else if (!this.closed && epoch === this.epoch && !abort.signal.aborted) {
        this.notice = this.error(error); if (error instanceof MessagingError && error.reason === 'denied') this.ready = false;
      }
    }
    finally {
      if (epoch === this.epoch) {
        this.loading = false; this.emit();
        if (!this.closed && !this.invalidationLimit && this.pollMs > 0) this.timer = setTimeout(() => { void this.refresh(); }, this.pollMs);
      }
    }
  }
  async send(requestId: string, room: string, text: string, parentId?: string): Promise<void> {
    return this.sendBound(requestId, room, text, parentId);
  }
  async sendPrepared(requestId: string, room: string, text: string, parentId: string | undefined, prepared: PreparedMessage): Promise<void> {
    return this.sendBound(requestId, room, text, parentId, prepared);
  }
  projectSent(value: unknown, room: string): ChatMessage | undefined {
    return this.api.projectMessage ? this.api.projectMessage(value, room) : parseMessage(value, room);
  }
  demoUploadMessage(room: string, text: string, parentId?: string): Promise<ChatMessage> {
    if (this.mode !== 'demo') throw new MessagingError('failed', 'Local sandbox operation unavailable.');
    return this.api.send(room, text, parentId);
  }
  demoRichMessage(room: string, markdown: string, parentId?: string): Promise<ChatMessage> {
    if (this.mode !== 'demo' || !this.api.demoRichMessage) throw new MessagingError('failed', 'Local sandbox operation unavailable.');
    return this.api.demoRichMessage(room, markdown, parentId);
  }
  private async sendBound(requestId: string, room: string, text: string, parentId?: string, prepared?: PreparedMessage): Promise<void> {
    if (this.closed) return;
    const previous = this.requests.get(requestId);
    if (previous) {
      if (previous.roomId !== room || previous.text !== text || previous.parentId !== parentId || previous.identity !== prepared?.identity) throw new MessagingError('failed', 'Request ID already belongs to another message/target. Nothing was resent.');
      if (previous.result) this.onDelivery(previous.result); return;
    }
    if (this.requests.size >= 64) throw new MessagingError('failed', 'Delivery request limit reached for this session. Evidence retained; nothing was queued or resent.');
    const request = { roomId: room, text, ...(parentId !== undefined ? { parentId } : {}),
      ...(prepared ? { ...(prepared.attachmentId ? { attachmentId: prepared.attachmentId } : {}),
        draftId: prepared.draftId, ...(prepared.format ? { format: prepared.format } : {}) } : {}) };
    const identity = prepared ? { identity: prepared.identity } : {};
    this.requests.set(requestId, { ...request, ...identity });
    const finish = (status: Delivery['status'], message: string, messageId?: string) => {
      const result = { requestId, ...request, status, message, ...(status === 'sent' && chatId(messageId) ? { messageId } : {}) };
      this.requests.set(requestId, { ...request, ...identity, result }); if (!this.closed) this.onDelivery(result);
    };
    const parent = this.messages.find(item => item.id === parentId);
    const invalidParent = parentId !== undefined && (!chatId(parentId) || !!parent?.parentId
      || !parent && !this.messages.some(item => item.parentId === parentId));
    if (this.sending || this.blockedRooms.has(room) || this.room?.id !== room || !this.ready || !(chatText(text) || prepared && text === '') || invalidParent || this.uncertain.has(room)) {
      finish('failed', this.uncertain.has(room) ? 'Delivery unresolved. Check history, then :delivery.resolve before any explicit retry.' : 'Not sent: destination changed, busy, or draft invalid.'); return;
    }
    // A history/event echo arriving during this POST is not a reused identity.
    const knownMessages = new Set(this.messages.map(item => item.id));
    this.sending = true; const epoch = this.epoch; this.emit();
    try {
      const item = prepared ? await prepared.send() : await this.api.send(room, text, parentId);
      if (item.parentId !== parentId) throw new MessagingError('unknown', 'Delivery UNKNOWN: reply acknowledgment did not match. Check history; nothing was retried.');
      if (knownMessages.has(item.id)
        || [...this.requests.values()].some(known => known.result?.status === 'sent' && known.result.messageId === item.id)) {
        throw new MessagingError('unknown', 'Delivery UNKNOWN: acknowledgment reused a known message identity. Check history; nothing was replayed.');
      }
      if (this.closed) return;
      if (this.epoch === epoch) {
        this.revision++; this.rememberLatest([item]); this.mergeMessages([item]);
        if (this.historyAtLimit) {
          this.historyNext = undefined; this.moreHistory = false;
          this.notice = 'History limit: 500. Loaded messages were retained; latest messages are not loaded.';
        }
      }
      this.activity(room, [item]);
      this.onMessages(room, [item]);
      finish('sent', this.mode === 'demo' ? 'Sent locally · DEMO only. Nothing was sent to Webex.' : 'Sent to the selected Webex space.', item.id);
    } catch (error) {
      const unknown = !(error instanceof MessagingError) || error.reason === 'unknown' || error.reason === 'canceled';
      if (unknown) this.uncertain.add(room);
      finish(unknown ? 'unknown' : 'failed', this.error(error));
    } finally { this.sending = false; this.emit(); }
  }
  resolveDelivery(): void { if (this.room) this.uncertain.delete(this.room.id); this.emit(); }
  close(): void {
    if (this.closed) return;
    this.destinationAbort.abort();
    this.closed = true; clearTimeout(this.timer); this.abort?.abort(); this.epoch++; this.api.close();
    this.imageAbort?.abort();
    this.attachmentAbort?.abort();
    this.rooms = []; this.messages = []; this.requests.clear(); this.uncertain.clear(); this.roomMetadataCache.clear();
    this.roomsCursors.clear(); this.historyCursors.clear(); this.latestMessage = undefined; this.latestMessageId = undefined;
  }
}
