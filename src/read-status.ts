import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AccessCredentials } from './auth-protocol.js';
import { validRoomReadStatus, validReadStatusHealth, validReadStatusFailure, validMessageCreated, validReadChange, MESSAGE_EVENT_LIMITS, type ReadChange, type MessageCreated, type RoomReadStatus, type ReadStatusHealth, type ReadStatusFailure } from './read-status-protocol.js';
import { ReactionReadError, validReactionReadFailure, validReactionCommand, validReactionBatch, reactionBatchMatches, validReactionSnapshot, validReactionDetails, validReactionWrite, type ReactionCommand, type ReactionBatch, type ReactionProgress } from './reaction-contracts.js';
import { validReaderTarget, validMessageReaders, type ReaderTarget, type MessageReaders } from './message-readers.js';
import { validJoinedMeetings, type JoinedMeetingsSnapshot } from './joined-meetings.js';

export interface ReadStatusSource {
  onRooms: (rooms: RoomReadStatus[]) => void;
  onFailure: (reason?: ReadStatusFailure) => void;
  onHealth?: (health: ReadStatusHealth) => void;
  onMessages?: (messages: MessageCreated[]) => void;
  onChanges?: (changes: ReadChange[]) => void;
  onJoinedMeetings?: (snapshot: JoinedMeetingsSnapshot) => void;
  discoverJoinedMeetings?(): void;
  start(credentials: AccessCredentials, preview?: boolean, senderNames?: boolean): Promise<void>;
  markRead(roomId: string, messageId: string, check?: () => void): Promise<void>;
  reaction?(command:ReactionCommand):Promise<unknown>;
  reactions?(batch:ReactionBatch, progress?:ReactionProgress):Promise<unknown>;
  readers?(target: ReaderTarget): Promise<MessageReaders>;
  close(): void;
}
/** A separate process confines SDK dependencies, logs, storage and credentials. */
export class ReadStatusWorker implements ReadStatusSource {
  onRooms = (_: RoomReadStatus[]) => {};
  onFailure = (_?: ReadStatusFailure) => {};
  onHealth = (_: ReadStatusHealth) => {};
  onMessages = (_: MessageCreated[]) => {};
  onChanges = (_: ReadChange[]) => {};
  onJoinedMeetings = (_: JoinedMeetingsSnapshot) => {};
  private joinedMeetingsEnabled = false;
  private child?: ChildProcess;
  private closed = false;
  private ready = false;
  private sequence = 0;
  private startup?: { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private reading?: { id: number; sent: boolean; resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private reacting?: { id:number; writing:boolean; command?:ReactionCommand; batch?:ReactionBatch; progress?:ReactionProgress; seen?:Set<string>; resolve(value:unknown):void; reject(error:Error):void; timer:ReturnType<typeof setTimeout> };
  private inspecting?: { id: number; target: ReaderTarget; settled: Promise<void>; resolve(value: MessageReaders): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private watchdog?: ReturnType<typeof setTimeout>;
  private previews = false;
  private senderNames = false;
  constructor(private worker = fileURLToPath(new URL('../dist/read-status-worker.js', import.meta.url)), private timeoutMs = 40_000) {}
  async start(credentials: AccessCredentials, preview = false, senderNames = false): Promise<void> {
    if (this.child || this.closed) throw new Error('Read-status session is not reusable.');
    this.previews = preview === true;
    this.senderNames = this.previews && senderNames === true;
    // Do not inherit debug logging, service URL overrides, preload scripts or credentials.
    const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
    const child = this.child = fork(this.worker, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], env });
    child.on('message', value => this.receive(value));
    child.on('error', () => this.fail('worker-error')); child.on('exit', () => this.fail('worker-exit'));
    const pending = new Promise<void>((resolve, reject) => {
      this.startup = { resolve, reject, timer: setTimeout(() => this.fail('startup-timeout'), this.timeoutMs) };
    });
    child.send({ type: 'start', credentials, ...(this.previews ? { preview: true } : {}),
      ...(this.senderNames ? { senderNames: true } : {}) }, error => { if (error) this.fail('worker-error'); });
    return pending;
  }
  private heartbeat(): void {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.fail('heartbeat-timeout'), 100_000);
  }
  private receive(value: unknown): void {
    if (this.closed || !value || typeof value !== 'object') return;
    const message = value as Record<string, unknown>;
    if (message.type === 'snapshot') {
      if (!Array.isArray(message.rooms) || message.rooms.length > 500 || !message.rooms.every(validRoomReadStatus)
        || new Set(message.rooms.map(room => room.id)).size !== message.rooms.length) { this.fail('invalid-data'); return; }
      this.heartbeat(); this.onRooms(message.rooms);
    } else if (message.type === 'messages' && this.ready && Object.keys(message).length === 2
      && Array.isArray(message.messages) && message.messages.length > 0 && message.messages.length <= MESSAGE_EVENT_LIMITS.batch
      && message.messages.every(validMessageCreated)
      && message.messages.every(item => this.previews || !('preview' in item))
      && message.messages.every(item => this.senderNames || !('senderId' in item))
      && new Set(message.messages.map(item => JSON.stringify([item.roomId, item.id]))).size === message.messages.length) {
      this.heartbeat(); this.onMessages(message.messages);
    } else if (message.type === 'changes' && (this.ready || !!this.startup) && Object.keys(message).length === 2
      && Array.isArray(message.changes) && message.changes.length > 0 && message.changes.length <= MESSAGE_EVENT_LIMITS.batch
      && message.changes.every(validReadChange)
      && new Set(message.changes.map(item => JSON.stringify([item.kind, item.roomId, item.kind === 'message-deleted' ? item.id : '']))).size === message.changes.length) {
      this.heartbeat(); this.onChanges(message.changes);
    } else if (message.type === 'joined-meetings' && this.ready && this.joinedMeetingsEnabled
      && Object.keys(message).length === 2 && validJoinedMeetings(message.snapshot)) {
      this.onJoinedMeetings(structuredClone(message.snapshot));
    } else if (message.type === 'health' && this.ready && Object.keys(message).length === 2 && validReadStatusHealth(message.status)) {
      this.heartbeat(); this.onHealth(message.status);
    } else if (message.type === 'ready' && this.startup) {
      const startup = this.startup; this.startup = undefined; clearTimeout(startup.timer);
      this.ready = true; this.heartbeat(); startup.resolve();
    } else if (message.type === 'reaction-progress' && this.reacting?.batch && this.reacting.progress && message.id === this.reacting.id
      && Object.keys(message).length === 3 && validReactionSnapshot(message.snapshot)
      && message.snapshot.roomId === this.reacting.batch.roomId && this.reacting.batch.messageIds.includes(message.snapshot.messageId)
      && !message.snapshot.groups.some(group => group.own !== undefined) && !this.reacting.seen!.has(message.snapshot.messageId)) {
      this.reacting.seen!.add(message.snapshot.messageId);
      this.heartbeat(); this.reacting.progress?.(structuredClone(message.snapshot));
    } else if (this.reacting && message.type === (this.reacting.batch ? 'reactions' : 'reaction') && message.id === this.reacting.id
      && (Object.keys(message).length === 3 && message.failed === true
        || Object.keys(message).length === 4 && message.failed === true && !this.reacting.writing && validReactionReadFailure(message.reason)
        || Object.keys(message).length === 3 && (this.reacting.batch ? reactionBatchMatches(message.result,this.reacting.batch)
          : this.reacting.command?.details ? validReactionDetails(message.result)
            && message.result.snapshot.roomId === this.reacting.command.roomId && message.result.snapshot.messageId === this.reacting.command.messageId
          : this.reacting.writing ? validReactionWrite(message.result) : validReactionSnapshot(message.result)))) {
      const pending = this.reacting; this.reacting = undefined; clearTimeout(pending.timer);
      message.failed ? pending.reject(new ReactionReadError(validReactionReadFailure(message.reason) ? message.reason : 'worker:unavailable')) : pending.resolve(message.result);
    } else if (message.type === 'readers' && this.inspecting && message.id === this.inspecting.id && Object.keys(message).length === 3
      && (message.failed === true || validMessageReaders(message.result)
        && message.result.roomId === this.inspecting.target.roomId && message.result.messageId === this.inspecting.target.messageId)) {
      const pending = this.inspecting; this.inspecting = undefined; clearTimeout(pending.timer);
      this.heartbeat();
      message.failed ? pending.reject(new Error('Read receipts unavailable. Nothing was acknowledged.'))
        : pending.resolve(message.result as MessageReaders);
    } else if (message.type === 'read' && this.reading?.sent && message.id === this.reading.id && typeof message.ok === 'boolean') {
      const reading = this.reading; this.reading = undefined; clearTimeout(reading.timer);
      if (message.ok) reading.resolve();
      else { reading.reject(new Error('Read receipt failed; nothing was retried.')); this.fail('receipt'); }
    } else if (message.type === 'failed' && Object.keys(message).length === 2 && validReadStatusFailure(message.reason)) {
      this.fail(message.reason);
    } else { this.fail('invalid-data'); }
  }
  async markRead(roomId: string, messageId: string, check: () => void = () => {}): Promise<void> {
    if (this.closed || !this.ready || !this.child?.connected) throw new Error('Webex read status is unavailable.');
    if (this.reading || this.reacting?.writing) throw new Error('An SDK operation is still pending; nothing was retried.');
    const id = ++this.sequence;
    return new Promise<void>((resolve, reject) => {
      this.reading = { id, sent: false, resolve, reject, timer: setTimeout(() => this.fail('receipt'), this.timeoutMs) };
      const reading = this.reading;
      const send = () => {
        if (this.reading !== reading) return;
        try {
          check();
        } catch {
          this.reading = undefined; clearTimeout(reading.timer);
          reject(new Error('Read receipt target/source changed before submission. Nothing was sent.'));
          return;
        }
        try {
          reading.sent = true;
          this.child!.send({ type: 'read', id, roomId, messageId }, error => { if (error) this.fail('worker-error'); });
        } catch { this.fail('worker-error'); }
      };
      // Reserve one receipt, but never overlap the read-only inspection or retry a POST.
      if (this.inspecting) void this.inspecting.settled.then(send); else send();
    });
  }
  discoverJoinedMeetings(): void {
    if (!this.ready || this.closed || !this.child?.connected) return;
    this.joinedMeetingsEnabled = true;
    this.child.send({ type: 'joined-meetings' }, error => { if (error) this.fail('worker-error'); });
  }
  async reaction(command:ReactionCommand):Promise<unknown> {
    const failure = (reason:'worker:unavailable'|'worker:busy'|'admission:unverified'):never => {
      throw command.action === 'summary' ? new ReactionReadError(reason) : new Error('Reaction worker unavailable or occupied');
    };
    if (!validReactionCommand(command)) failure('admission:unverified');
    if (!this.ready || this.closed || !this.child?.connected) failure('worker:unavailable');
    if (this.inspecting || this.reacting || this.reading && command.action !== 'summary') failure('worker:busy');
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      this.reacting = { id,writing:command.action !== 'summary',command:{...command},resolve,reject,timer:setTimeout(()=>this.fail('sdk-error'),this.timeoutMs) };
      this.child!.send({ type:'reaction',id,command },error=>{ if (error) this.fail('worker-error'); });
    });
  }
  async reactions(batch:ReactionBatch, progress?:ReactionProgress):Promise<unknown> {
    if (!validReactionBatch(batch)) throw new ReactionReadError('admission:unverified');
    if (!this.ready || this.closed || !this.child?.connected) throw new ReactionReadError('worker:unavailable');
    if (this.reacting || this.inspecting) throw new ReactionReadError('worker:busy');
    return new Promise((resolve,reject)=>{
      const id = ++this.sequence;
      this.reacting = { id,writing:false,batch:structuredClone(batch),progress,seen:new Set(),resolve,reject,timer:setTimeout(()=>this.fail('sdk-error'),this.timeoutMs) };
      this.child!.send({ type:'reactions',id,batch,...(progress ? {progressive:true} : {}) },error=>{ if (error) this.fail('worker-error'); });
    });
  }
  async readers(target: ReaderTarget): Promise<MessageReaders> {
    if (!validReaderTarget(target) || !this.ready || this.closed || !this.child?.connected)
      throw new Error('Read receipts unavailable.');
    if (this.inspecting || this.reacting || this.reading) throw new Error('An SDK operation is still pending; nothing was queued.');
    let finish!: () => void;
    const settled = new Promise<void>(resolve => { finish = resolve; });
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.inspecting = { id, target: { ...target }, settled,
        resolve: value => { resolve(value); finish(); }, reject: error => { reject(error); finish(); },
        timer: setTimeout(() => this.fail('sdk-error'), this.timeoutMs) };
      this.child!.send({ type: 'readers', id, ...target }, error => { if (error) this.fail('worker-error'); });
    });
  }
  private fail(reason: ReadStatusFailure): void {
    if (this.closed) return;
    this.close(); this.onFailure(reason);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.ready = false; clearTimeout(this.watchdog);
    for (const pending of [this.startup, this.reading, this.inspecting]) {
      if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Webex read status stopped. Reconnect explicitly.')); }
    }
    if (this.reacting) {
      clearTimeout(this.reacting.timer);
      this.reacting.reject(this.reacting.writing ? new Error('Webex read status stopped. Reconnect explicitly.') : new ReactionReadError('worker:unavailable'));
    }
    this.startup = undefined; this.reading = undefined; this.reacting = undefined; this.inspecting = undefined;
    const child = this.child;
    if (child) {
      if (child.connected) child.send({ type: 'stop' }, () => {});
      const kill = setTimeout(() => { child.kill('SIGKILL'); }, 1500);
      child.once('exit', () => clearTimeout(kill));
      if (child.exitCode !== null || child.signalCode !== null) clearTimeout(kill);
    }
  }
}
