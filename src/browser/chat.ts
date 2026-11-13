import { CHAT_HISTORY_LIMIT, CHAT_ROOM_LIMIT, CHAT_TEXT_LIMIT, chatId, emptyChat, validChatRequest,
  type ChatMessage, type ChatProblem, type ChatRequest, type ChatResult, type ChatRoom, type ChatSnapshot } from '../chat-protocol.js';

/** Public @webex/plugin-rooms / plugin-messages API, not meeting chat. */
export interface MessagingSDK {
  rooms?: { list(options: { max: number }): Promise<{ items: unknown[] }> };
  messages?: {
    list(options: { roomId: string; max: number }): Promise<{ items: unknown[] }>;
    create(options: { roomId: string; text: string }): Promise<unknown>;
  };
}
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, ' ').slice(0, max) : '';
function message(raw: unknown, roomId: string): ChatMessage | undefined {
  if (!raw || typeof raw !== 'object') return;
  const v = raw as Record<string, unknown>;
  if (!chatId(v.id) || v.roomId !== roomId) return;
  return { id: v.id, author: text(v.personEmail, 80) || text(v.personId, 80) || 'Participant',
    created: typeof v.created === 'string' && Number.isFinite(Date.parse(v.created)) ? new Date(v.created).toISOString() : '',
    text: text(v.text, CHAT_TEXT_LIMIT) || '[Attachment / non-text message]' };
}
const failure = (error: unknown): ChatProblem => error && typeof error === 'object' && 'statusCode' in error
  && [401, 403].includes(Number(error.statusCode)) ? 'denied' : 'failed';
export class SpaceChat {
  private snapshot: ChatSnapshot;
  private epoch = 0;
  private closed = false;
  private reading = false;
  private writing = false;
  private messageRevision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private results = new Map<string, ChatResult | undefined>();
  constructor(private sdk: MessagingSDK, private publish: (state: ChatSnapshot) => void,
    private result: (value: ChatResult) => void, private wait: <T>(pending: Promise<T>) => Promise<T>,
    private pollMs = 4000, mode: 'space' | 'demo' = 'space') { this.snapshot = emptyChat(mode); }
  private emit(patch: Partial<ChatSnapshot> = {}): void {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch, sending: this.writing };
    this.publish(this.snapshot);
  }
  private reset(): number {
    clearTimeout(this.timer); this.timer = undefined;
    this.epoch++; this.emit({ ...emptyChat(this.snapshot.mode) }); return this.epoch;
  }
  async handle(request: ChatRequest): Promise<void> {
    if (!validChatRequest(request) || this.closed) return;
    if (request.action === 'close') { this.reset(); return; }
    if (request.action === 'send') { await this.send(request); return; }
    if (!this.sdk.rooms || !this.sdk.messages) { this.emit({ state: 'failed', problem: 'unsupported' }); return; }
    if (this.reading) { this.emit({ problem: 'busy' }); return; }
    if (request.action === 'rooms') {
      const epoch = this.reset(); this.emit({ state: 'loading' });
      await this.read(async () => {
        const page = await this.sdk.rooms!.list({ max: CHAT_ROOM_LIMIT });
        const rooms = new Map<string, ChatRoom>();
        for (const raw of page.items.slice(0, CHAT_ROOM_LIMIT)) {
          if (raw && typeof raw === 'object' && 'id' in raw && chatId(raw.id)) rooms.set(raw.id,
            { id: raw.id, title: 'title' in raw ? text(raw.title, 80).replaceAll('\n', ' ') || 'Untitled space' : 'Untitled space' });
        }
        if (epoch === this.epoch && !this.closed) this.emit({ rooms: [...rooms.values()], state: 'ready', problem: undefined });
      }, epoch);
      return;
    }
    const room = this.snapshot.rooms.find(room => room.id === request.roomId);
    if (!room || (request.action === 'refresh' && this.snapshot.room?.id !== room.id)) { this.emit({ problem: 'failed' }); return; }
    const epoch = request.action === 'select' ? this.resetSelection(room) : this.epoch;
    await this.history(room, epoch);
  }
  private resetSelection(room: ChatRoom): number {
    clearTimeout(this.timer); this.epoch++;
    this.emit({ room, messages: [], state: 'loading', problem: undefined }); return this.epoch;
  }
  private async read(work: () => Promise<void>, epoch: number): Promise<void> {
    this.reading = true;
    // Retain raw admission after a deadline: a hung SDK request must not allow
    // repeated refreshes to accumulate unbounded native/network requests.
    const pending = work().finally(() => { this.reading = false; });
    try { await this.wait(pending); }
    catch (error) { if (!this.closed && epoch === this.epoch) this.emit({ state: 'failed', problem: failure(error) }); }
  }
  private async history(room: ChatRoom, epoch: number): Promise<void> {
    if (this.closed || epoch !== this.epoch || this.reading) return;
    clearTimeout(this.timer);
    const revision = this.messageRevision;
    await this.read(async () => {
      const page = await this.sdk.messages!.list({ roomId: room.id, max: CHAT_HISTORY_LIMIT });
      if (this.closed || epoch !== this.epoch) return;
      const unique = new Map<string, ChatMessage>();
      for (const raw of page.items.slice(0, CHAT_HISTORY_LIMIT).reverse()) {
        const item = message(raw, room.id); if (item) unique.set(item.id, item);
      }
      // An older GET must not erase a POST acknowledgment that arrived while
      // the read was in flight. The next selected-space poll reconciles it.
      if (revision === this.messageRevision) this.emit({ messages: [...unique.values()].sort((a, b) => a.created.localeCompare(b.created)), state: 'ready', problem: undefined });
      this.timer = setTimeout(() => { void this.history(room, epoch); }, this.pollMs);
    }, epoch);
  }
  private async send(request: Extract<ChatRequest, { action: 'send' }>): Promise<void> {
    if (this.results.has(request.requestId)) {
      const previous = this.results.get(request.requestId); if (previous) this.result(previous); return;
    }
    const finish = (status: ChatResult['status'], problem?: ChatProblem) => {
      const result: ChatResult = { type: 'chat-result', requestId: request.requestId, roomId: request.roomId, status, ...(problem ? { problem } : {}) };
      this.results.set(request.requestId, result); if (!this.closed) this.result(result);
    };
    if (this.results.size >= 64) this.results.delete(this.results.keys().next().value!);
    this.results.set(request.requestId, undefined);
    if (!this.sdk.messages) { finish('failed', 'unsupported'); return; }
    if (this.writing) { finish('failed', 'busy'); return; }
    if (this.snapshot.state !== 'ready' || this.snapshot.room?.id !== request.roomId) { finish('failed', 'not-connected'); return; }
    const epoch = this.epoch;
    this.writing = true; this.emit({ problem: undefined });
    let settled = false;
    const pending = Promise.resolve().then(() => {
      if (this.closed || epoch !== this.epoch) throw new Error('Canceled before transmission.');
      return this.sdk.messages!.create({ roomId: request.roomId, text: request.text });
    })
      .finally(() => { settled = true; this.writing = false; if (!this.closed) this.emit(); });
    try {
      const raw = await this.wait(pending);
      const item = message(raw, request.roomId);
      if (!item) { finish('unknown', 'unknown'); return; }
      if (!this.closed && epoch === this.epoch) {
        this.messageRevision++;
        this.emit({ messages: [...this.snapshot.messages.filter(old => old.id !== item.id), item].slice(-CHAT_HISTORY_LIMIT) });
      }
      finish('sent');
    } catch (error) {
      // A timeout or network error may follow a successful POST. Never retry it.
      const denied = failure(error) === 'denied';
      finish(denied ? 'failed' : 'unknown', denied ? 'denied' : 'unknown');
      if (!settled && !this.closed) this.emit({ problem: 'unknown' });
    }
  }
  close(): void {
    if (this.closed) return;
    clearTimeout(this.timer); this.epoch++;
    this.writing = false;
    this.emit({ ...emptyChat(this.snapshot.mode), state: 'closed' });
    this.closed = true; this.results.clear();
  }
}

/** Local-only messaging sandbox; never inserted into a real account. */
export function demoMessaging(): MessagingSDK {
  const items: Record<string, unknown>[] = [{ id: 'demo-welcome', roomId: 'demo-space', personEmail: 'Mock participant',
    created: new Date().toISOString(), text: 'MOCK space chat — messages stay local. This is not meeting chat.' }];
  let next = 0;
  return { rooms: { list: async () => ({ items: [{ id: 'demo-space', title: 'MOCK space · local-only chat' }] }) },
    messages: { list: async () => ({ items: [...items].reverse() }), create: async ({ roomId, text }) => {
      const item = { id: `demo-${++next}`, roomId, text, personEmail: 'You · MOCK', created: new Date().toISOString() };
      items.push(item); if (items.length > CHAT_HISTORY_LIMIT) items.shift(); return item;
    } } };
}
