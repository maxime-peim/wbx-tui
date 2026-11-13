import { chatId } from './chat-protocol.js';
import { createReadStatusSDK, type ReadStatusSDK } from './read-status-sdk.js';
import { readStatusSelfId, irrelevantMembershipSeen, sameRoomReadStatus, parseRoomReadStatus, parseMessageCreated, parseReadChange, MESSAGE_EVENT_LIMITS, validReadStatusRequest, ReadStatusDeadline, readStatusStartupFailure, readStatusRetryAt, type ReadChange, type MessageCreated, type RoomReadStatus, type ReadStatusFailure, type ReadStatusHealth, type ReadStatusStartupPhase } from './read-status-protocol.js';
import { readStatusOutput } from './state-output.js';
import { SDKReactions } from './reactions-sdk.js';
import { ReactionReadError } from './reaction-contracts.js';
import { readMessageReaders } from './readers-sdk.js';
import { SDKJoinedMeetings } from './joined-meetings-sdk.js';

// Private IPC only. STDOUT/STDERR are discarded by the owner, never editor RPC.
let sdk: ReadStatusSDK | undefined, stopping = false, started = false, ready = false, draining = false, marking = false;
let reactions:SDKReactions|undefined;
let inspecting = false;
let joinedMeetings: SDKJoinedMeetings | undefined;
let credentialsExpireAt = 0;
let rooms = new Map<string, RoomReadStatus>();
const pending = new Set<string>();
let inFlight: { id: string; dirty: boolean } | undefined;
const metadataLimit = 64;
const messageBatch = new Map<string, MessageCreated>();
const changeBatch = new Map<string, ReadChange>();
let changePublication: ReturnType<typeof setTimeout> | undefined;
let messagePublication: ReturnType<typeof setTimeout> | undefined;
let messagesSince = 0;
let messagePreviews = false;
let senderNames = false;
let reconcile: ReturnType<typeof setTimeout> | undefined;
let reconciliationDue = false;
let publication: ReturnType<typeof setTimeout> | undefined, eventDrain: ReturnType<typeof setTimeout> | undefined;
let publishedHealth: ReadStatusHealth | undefined;
const metadataInterval = 25;
let liveEvents = false, roomUnavailable = false, refreshUnavailable = false;
let retryAt = 0;
const cooling = () => Date.now() < retryAt;
const output = readStatusOutput((value, complete) => {
  if (process.connected && process.send) process.send(value, complete);
  else complete(new Error('IPC closed.'));
}, () => { void stop(); });
const send = (value: object) => { if (!stopping && process.connected) output(value); };
const health = () => {
  if (!ready || stopping) return;
  const status = cooling() ? 'rate-limited' : refreshUnavailable ? 'refresh-unavailable' : !liveEvents ? 'polling' : roomUnavailable ? 'room-unavailable' : 'live';
  if (status !== publishedHealth) { publishedHealth = status; send({ type: 'health', status }); }
};
const publish = () => {
  clearTimeout(publication); publication = undefined;
  // Metadata/ready must never overtake invalidation evidence observed during
  // listener startup or while a native read was in flight.
  publishChanges();
  send({ type: 'snapshot', rooms: [...rooms.values()] }); health();
};
const publishSoon = () => {
  // Fixed from the first change, not a trailing debounce: continuous events
  // cannot postpone publication forever. Full snapshots remain the IPC contract.
  if (!publication && !stopping) publication = setTimeout(publish, metadataInterval);
};
const fail = (reason: ReadStatusFailure) => { send({ type: 'failed', reason }); void stop(); };
async function wait<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ReadStatusDeadline('SDK deadline.')), 30_000); })]); }
  finally { clearTimeout(timer!); }
}
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true; clearTimeout(reconcile); clearTimeout(publication); clearTimeout(eventDrain); clearTimeout(messagePublication); clearTimeout(changePublication); pending.clear(); inFlight = undefined; messageBatch.clear(); changeBatch.clear();
  joinedMeetings?.close();
  // The owner also enforces a hard, bounded process teardown for hung SDK I/O.
  const deadline = setTimeout(() => process.exit(0), 1000);
  try {
    sdk?.rooms.stopListening(); sdk?.memberships.stopListening(); sdk?.messages.stopListening();
    await sdk?.internal.mercury.disconnect(); await sdk?.internal.device.unregister();
  } catch { /* never expose SDK errors or invalidate the owner's OAuth grant */ }
  await output.flush(); output.close();
  clearTimeout(deadline); process.exit(0);
}
async function full(): Promise<void> {
  const page = await wait(sdk!.rooms.listWithReadStatus());
  if (!Array.isArray(page.items) || page.items.length > 1000) throw new Error('Invalid read status.');
  const parsed = page.items.flatMap(value => { const room = parseRoomReadStatus(value); return room ? [room] : []; });
  const next = parsed.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)).slice(0, 500);
  if (stopping) return;
  refreshUnavailable = false; roomUnavailable = parsed.length < page.items.length;
  rooms = new Map(next.map(room => [room.id, room])); publish();
}
async function refresh(): Promise<void> {
  try { await full(); }
  catch (error) {
    // A deadline is NOT a settled inaccessible room. Propagate it to the fatal
    // worker boundary: the still-running native request must lose admission,
    // rather than being orphaned while another polling cycle starts.
    if (error instanceof ReadStatusDeadline) throw error;
    if (stopping) return;
    // Read-only discovery may recover next cycle. Never leave stale data looking
    // current, retry a receipt, reauthorize or reregister the SDK device here.
    retryAt = Math.max(retryAt, readStatusRetryAt(error, Date.now()) ?? 0);
    rooms.clear(); refreshUnavailable = true; publish();
  }
}
async function reconcileFull(): Promise<void> {
  reconciliationDue = false;
  await refresh();
  schedule();
}
async function drain(): Promise<void> {
  if (draining || stopping || !sdk || cooling()) return;
  clearTimeout(eventDrain); eventDrain = undefined;
  draining = true;
  try {
    // Keep every queued identity present until its actual native admission.
    // Events for a later member of this batch are already covered by that read.
    const batch = [...pending];
    for (const id of batch) {
      // A due full fetch has priority after ONE native lookup, not after this
      // entire batch. Otherwise sustained events can starve overflow recovery.
      if (reconciliationDue && !stopping) await reconcileFull();
      if (stopping || cooling()) return;
      pending.delete(id);
      const observation = inFlight = { id, dirty: false };
      let changed = false;
      try {
        const room = parseRoomReadStatus(await wait(sdk.rooms.getWithReadStatus(id)));
        if (!room || room.id !== id) throw new Error('Invalid read status.');
        if (stopping) return;
        changed = !sameRoomReadStatus(rooms.get(id), room);
        rooms.set(id, room);
      } catch (error) {
        if (error instanceof ReadStatusDeadline) throw error;
        if (stopping) return;
        retryAt = Math.max(retryAt, readStatusRetryAt(error, Date.now()) ?? 0);
        // A removed/inaccessible room or missing dates invalidate only that room,
        // not all other memberships. The next full fetch reconciles its status.
        changed = rooms.delete(id); roomUnavailable = true;
      }
      // An event received during native I/O may postdate its captured result.
      // Reserve one follow-up, not one per event. Deadline throws bypass this:
      // fatal teardown, not a timed-out waiter, releases native admission.
      inFlight = undefined;
      if (observation.dirty) queueRoom(id);
      if (rooms.size > 500) rooms = new Map([...rooms.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)).slice(0, 500).map(room => [room.id, room]));
      if (changed) publishSoon(); else health();
      if (cooling()) { schedule(); break; }
    }
    if (reconciliationDue && !stopping) await reconcileFull();
  } catch { fail('sdk-error'); }
  finally { draining = false; queueDrain(); }
}
function queueDrain(): void {
  if (draining || stopping || cooling()) return;
  if (reconciliationDue) { void drain(); return; }
  if (pending.size && !eventDrain) eventDrain = setTimeout(() => {
    eventDrain = undefined; void drain();
  }, metadataInterval);
}
function changed(event: unknown): void {
  if (stopping) return;
  const value = event as { data?: { roomId?: unknown; id?: unknown } };
  const id = value?.data?.roomId ?? value?.data?.id;
  if (chatId(id)) queueRoom(id);
}
function queueRoom(id: string): void {
  if (stopping) return;
  if (inFlight?.id === id) { inFlight.dirty = true; return; }
  // Counting the active room reserves its dirty follow-up slot even at capacity.
  // Unadmitted distinct overflow is still recovered by periodic full refresh.
  if (pending.size + (inFlight ? 1 : 0) < metadataLimit) pending.add(id);
  queueDrain();
}
function membershipSeen(event: unknown): void {
  const self = readStatusSelfId(sdk?.internal.device.userId,sdk?.internal.me?.id), change = parseReadChange(event,self);
  if (change?.kind === 'readers-changed') queueChange(change);
  if (!irrelevantMembershipSeen(event,self)) changed(event);
}
function messageCreated(event: unknown): void {
  changed(event);
  if (stopping || !ready) return;
  const message = parseMessageCreated(event, readStatusSelfId(sdk?.internal.device.userId,sdk?.internal.me?.id), messagePreviews, senderNames), now = Date.now();
  if (!message) return;
  const created = Date.parse(message.created);
  // Startup history/backlog and delayed reconnect replay are not new notifications.
  if (created < messagesSince || now - created > MESSAGE_EVENT_LIMITS.ageMs || created - now > MESSAGE_EVENT_LIMITS.futureMs) return;
  const key = JSON.stringify([message.roomId, message.id]);
  // A full batch is nonreplaceable evidence, not a reason to silently discard
  // the next message. IPC admission remains bounded and fails closed on excess.
  if (messageBatch.size >= MESSAGE_EVENT_LIMITS.batch && !messageBatch.has(key)) publishMessages();
  messageBatch.set(key, message);
  // Independent of unread metadata and its native lookup: an unchanged/read
  // snapshot must not discard a confirmed public SDK message-created event.
  if (!messagePublication) messagePublication = setTimeout(publishMessages, metadataInterval);
}
function publishMessages(): void {
  clearTimeout(messagePublication); messagePublication = undefined;
  if (messageBatch.size) send({ type: 'messages', messages: [...messageBatch.values()] });
  messageBatch.clear();
}
function queueChange(change: ReadChange | undefined): void {
  // Unlike creation notifications, invalidation evidence cannot be discarded
  // during startup. The parent fences its bounded pending set before REST rows.
  if (stopping) return;
  if (change) {
    const key = JSON.stringify(change);
    if (changeBatch.size >= MESSAGE_EVENT_LIMITS.batch && !changeBatch.has(key)) publishChanges();
    changeBatch.set(key, change);
    if (!changePublication) changePublication = setTimeout(publishChanges, metadataInterval);
  }
}
function removed(event: unknown): void {
  const change = parseReadChange(event, readStatusSelfId(sdk?.internal.device.userId,sdk?.internal.me?.id));
  if (change?.kind !== 'readers-changed') queueChange(change);
  if (change?.kind === 'room-revoked') {
    rooms.delete(change.roomId); pending.delete(change.roomId); publishSoon();
    return;
  }
  changed(event);
}
function publishChanges(): void {
  clearTimeout(changePublication); changePublication = undefined;
  if (changeBatch.size) send({ type: 'changes', changes: [...changeBatch.values()] });
  changeBatch.clear();
}
function schedule(): void {
  if (stopping) return;
  clearTimeout(reconcile);
  // Events handle normal updates; infrequent reconciliation covers missed events.
  // Once due, stay due until serviced. Busy event traffic must not restart the
  // 60-second timer. The active lookup's existing 30-second deadline bounds the
  // wait for admission; a native deadline remains fatal rather than overlapping.
  reconcile = setTimeout(() => {
    reconcile = undefined;
    if (cooling()) {
      send({ type: 'health', status: 'rate-limited' }); schedule(); return;
    }
    reconciliationDue = true; queueDrain();
  }, cooling() ? Math.min(60_000, Math.max(1, retryAt - Date.now())) : 60_000);
}
process.on('message', async value => {
  if (!validReadStatusRequest(value)) { fail('invalid-data'); return; }
  if (value.type === 'stop') { void stop(); return; }
  if (value.type === 'start') {
    if (started || stopping || value.credentials.expiresAt <= Date.now()) { fail('invalid-data'); return; }
    started = true;
    credentialsExpireAt = value.credentials.expiresAt;
    messagePreviews = value.preview === true;
    senderNames = value.senderNames === true;
    draining = true;
    let phase: ReadStatusStartupPhase = 'sdk-load';
    try {
      sdk = createReadStatusSDK(value.credentials);
      phase = 'sdk-ready';
      sdk.on('error', () => { liveEvents = false; health(); });
      if (!sdk.ready) await wait(new Promise<void>(resolve => sdk!.on('ready', () => resolve())));
      if (stopping) return;
      phase = 'device-register';
      await wait(sdk.internal.device.register());
      if (stopping) return;
      phase = 'initial-snapshot';
      // Public room/membership events are sufficient. Never register a meeting.
      sdk.rooms.on('created', changed); sdk.rooms.on('updated', changed);
      sdk.memberships.on('created', changed); sdk.memberships.on('seen', membershipSeen); sdk.memberships.on('deleted', removed);
      sdk.messages.on('created', messageCreated); sdk.messages.on('deleted', removed);
      const listening = Promise.allSettled([() => sdk!.rooms.listen(), () => sdk!.memberships.listen(), () => sdk!.messages.listen()]
        .map(listen => wait(Promise.resolve().then(listen))))
        .then(results => {
          // A rejected listener must not hide another listener's still-pending
          // native operation/deadline through Promise.all's early rejection.
          for (const result of results) if (result.status === 'rejected' && result.reason instanceof ReadStatusDeadline) throw result.reason;
          if (!stopping) { liveEvents = results.every(result => result.status === 'fulfilled'); health(); }
        });
      const initial = full().catch(error => {
        const until = readStatusRetryAt(error, Date.now());
        if (until === undefined) throw error;
        retryAt = Math.max(retryAt, until); rooms.clear(); refreshUnavailable = true; publish();
      }).then(() => {
        if (!stopping) { messagesSince = Date.now(); ready = true; send({ type: 'ready' }); health(); }
      });
      // A usable read-state snapshot must not wait for three event listeners.
      // Event setup is concurrent, and a second snapshot closes its startup gap.
      await Promise.all([initial, listening]);
      if (stopping) return;
      if (!cooling()) await refresh();
      schedule();
    } catch (error) { fail(readStatusStartupFailure(phase, error)); }
    finally { draining = false; queueDrain(); }
    return;
  }
  if (value.type === 'joined-meetings') {
    if (!sdk || stopping || !ready || cooling()) {
      send({ type: 'joined-meetings', snapshot: { state: 'unavailable', partial: true, items: [] } }); return;
    }
    joinedMeetings ??= new SDKJoinedMeetings(sdk, snapshot => send({ type: 'joined-meetings', snapshot }),
      () => !stopping && ready && !cooling() && Date.now() < credentialsExpireAt);
    joinedMeetings.refresh();
    return;
  }
  if (value.type === 'readers') {
    if (!sdk || stopping || !ready || cooling() || inspecting || marking || reactions?.busy()) {
      send({ type: 'readers', id: value.id, failed: true }); return;
    }
    inspecting = true;
    try {
      const target = { roomId: value.roomId, messageId: value.messageId };
      const result = await wait(readMessageReaders(sdk, target, () => {
        if (stopping || cooling()) throw new Error('Read-through owner unavailable.');
      }));
      send({ type: 'readers', id: value.id, result });
    } catch (error) {
      send({ type: 'readers', id: value.id, failed: true });
      if (error instanceof ReadStatusDeadline) fail('sdk-error');
      else {
        const until = readStatusRetryAt(error, Date.now());
        if (until !== undefined) { retryAt = Math.max(retryAt, until); health(); schedule(); }
      }
    } finally { inspecting = false; }
    return;
  }
  if (value.type === 'reaction') {
    // Missing last-seen/read-status metadata is not a denial of an exact loaded
    // message read. The SDK adapter independently verifies the room and parent.
    // Mutations keep the original per-room metadata/receipt exclusion.
    if (!sdk || stopping || !ready || cooling() || inspecting || value.command.action !== 'summary' && (marking || !rooms.has(value.command.roomId))) {
      send({ type:'reaction',id:value.id,failed:true,...(value.command.action === 'summary' && cooling() ? { reason:'worker:rate-limited' } : {}) }); return;
    }
    try {
      reactions ??= new SDKReactions(sdk);
      const result = await reactions.perform(value.command);
      send({ type:'reaction',id:value.id,result });
    } catch (error) { send({ type:'reaction',id:value.id,failed:true,
      ...(value.command.action === 'summary' ? { reason:error instanceof ReactionReadError ? error.reason : 'worker:unavailable' } : {}) }); }
    return;
  }
  if (value.type === 'reactions') {
    try {
      if (cooling()) throw new ReactionReadError('worker:rate-limited');
      if (inspecting) throw new ReactionReadError('worker:busy');
      if (!sdk || stopping || !ready) throw new ReactionReadError('worker:unavailable');
      reactions ??= new SDKReactions(sdk);
      send({ type:'reactions',id:value.id,result:await reactions.summaries(value.batch,
        value.progressive ? snapshot => send({ type:'reaction-progress',id:value.id,snapshot }) : undefined) });
    } catch (error) {
      send({ type:'reactions',id:value.id,failed:true,reason:error instanceof ReactionReadError ? error.reason : 'worker:unavailable' });
    }
    return;
  }
  if (!sdk || stopping || !ready || cooling() || inspecting || marking || reactions?.mutating()) { send({ type: 'read', id: value.id, ok: false }); return; }
  marking = true;
  try {
    // One explicit receipt, never retried. No message body is sent through SDK.
    await wait(sdk.memberships.updateLastSeen({ id: value.messageId, roomId: value.roomId }));
    if (stopping) return;
    queueRoom(value.roomId);
    // Receipt completion/uncertainty is never held behind the metadata timer.
    // Flush already-observed status first, without inventing a server read date.
    if (publication) publish();
    send({ type: 'read', id: value.id, ok: true });
  } catch { send({ type: 'read', id: value.id, ok: false }); void stop(); }
  finally { marking = false; }
});
process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
process.on('uncaughtException', () => { fail('sdk-error'); });
process.on('unhandledRejection', () => { fail('sdk-error'); });
