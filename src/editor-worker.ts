import { EditorEngine, EditorError } from './editor-engine.js';
import { EventEmitter } from 'node:events';
import { EditorMeetings } from './editor-meetings.js';
import { EDITOR_PROTOCOL_VERSION, EditorLines, EditorProtocolError, parseEditorOperation, parseEditorRequest, type EditorRequest } from './editor-protocol.js';
import { editorOutput, type EditorWrite } from './editor-output.js';
import { ATTACHMENT_TRANSFER } from './attachment-transfer.js';
import { editorStateLane } from './state-output.js';
import { editorFeatures } from './editor-features.js';
export class EditorRPC extends EventEmitter {
  private hello = false;
  private closed = false;
  private inflight = new Map<number, Promise<object>>();
  private completed = new Map<number, { request: string; response: object }>();
  private scheduled = false;
  private pendingState?: ReturnType<EditorEngine['snapshot']>;
  private pendingStateLane?: string;
  private highWater = 0;
  private shutdownId?: number;
  private readerEvents = false;
  private closing?: Promise<void>;
  constructor(readonly engine: EditorEngine, readonly meetings: EditorMeetings, private write: EditorWrite) {
    super();
    meetings.authorization = path => engine.meetingAuthorization(path);
    engine.on('state', state => {
      if (this.closed) return;
      const lane = editorStateLane(state);
      // Preserve control/authority/evidence transitions even inside one turn.
      // Only the latest presentation within the same lane replaces its predecessor.
      if (this.pendingState && (lane === undefined || lane !== this.pendingStateLane)) this.notify('state', this.pendingState);
      this.pendingState = state;
      this.pendingStateLane = lane;
      if (this.scheduled) return;
      this.scheduled = true; queueMicrotask(() => {
        this.scheduled = false;
        const latest = this.pendingState; this.pendingState = undefined; this.pendingStateLane = undefined;
        if (!this.closed && latest) this.notify('state', latest);
      });
    });
    engine.on('delivery', delivery => this.notify('delivery', delivery));
    engine.on('upload.progress', progress => this.notify('upload.progress', progress));
    engine.on('uploads.invalidated', value => this.notify('uploads.invalidated', value));
    engine.on('direct.delivery', value => this.notify('direct.delivery', value));
    engine.on('room.revoked', value => this.notify('room.revoked', value));
    engine.on('messages.readersChanged', value => { if (this.readerEvents) this.notify('messages.readersChanged', value); });
    meetings.on('state', state => this.notify('meeting', state));
    meetings.on('event', event => this.notify('meeting.event', event));
    meetings.on('notice', message => this.notify('notice', { message }));
  }
  private notify(method: string, params: object): void { if (!this.closed && this.hello) this.write({ jsonrpc: '2.0', method, params }); }
  async receive(line: string): Promise<void> {
    if (this.closed) return;
    let request: EditorRequest;
    try { request = parseEditorRequest(line); }
    catch { this.write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid bounded JSON-RPC request.' } }); return; }
    const previous = this.completed.get(request.id);
    if (previous) {
      if (previous.request === line) this.write(previous.response);
      else this.write({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'Request ID was already used.' } });
      return;
    }
    if (this.inflight.has(request.id)) { this.write({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'Request ID is already pending.' } }); return; }
    if (request.id <= this.highWater) { this.write({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'Expired/reused request ID. IDs must increase.' } }); return; }
    this.highWater = request.id;
    if (this.inflight.size >= 32) { this.write({ jsonrpc: '2.0', id: request.id, error: { code: -32002, message: 'Too many pending requests.' } }); return; }
    const pending = this.dispatch(request).then(result => ({ jsonrpc: '2.0', id: request.id, result: result ?? null }), error => ({
      jsonrpc: '2.0', id: request.id, error: { code: error instanceof EditorError || error instanceof EditorProtocolError ? error.code : -32603,
        message: error instanceof EditorError || error instanceof EditorProtocolError ? error.message : 'Backend operation failed. Provider details were not logged.' },
    }));
    this.inflight.set(request.id, pending);
    const response = await pending; this.inflight.delete(request.id);
    if (!this.closed) {
      // Do not retain up to 64 multi-megabyte image results. Replays never fetch
      // again; an explicit new request is required after the one-shot response.
      const retained = ['messages.imageOpen', 'messages.attachmentOpen', 'messages.attachmentResolve', 'messages.attachmentChunk'].includes(request.method) && 'result' in response ? { jsonrpc: '2.0', id: request.id,
        error: { code: -32002, message: `${request.method === 'messages.imageOpen' ? 'Image' : 'Attachment'} opening response was one-shot. Request it explicitly with a new ID.` } } : response;
      this.completed.set(request.id, { request: line, response: retained });
      if (this.completed.size > 64) this.completed.delete(this.completed.keys().next().value!);
      const result: any = 'result' in response ? response.result : undefined;
      const descriptor = request.method === 'messages.attachmentResolve' && result?.body?.payload?.mode === 'chunks' ? result.body.payload : undefined;
      const chunk = request.method === 'messages.attachmentChunk' && result?.transferId ? result : undefined;
      const control = request.method === 'messages.attachmentComplete';
      if (descriptor || chunk || control) {
        const transfer = descriptor ?? chunk;
        const completed = (error?: Error) => {
          if (!transfer) return;
          if (error) this.engine.cancelAttachment(transfer.requestId);
          else this.engine.attachmentSent(transfer.requestId, transfer.transferId, descriptor ? -1 : chunk.seq);
        };
        if (this.write.record) this.write.record(response, { maxBytes: chunk ? ATTACHMENT_TRANSFER.recordBytes : ATTACHMENT_TRANSFER.controlBytes, completed });
        else { this.write(response); completed(); } // In-memory/custom sinks acknowledge synchronously.
      } else this.write(response);
      if (request.id === this.shutdownId) await this.close();
    }
  }
  private async dispatch(request: EditorRequest): Promise<unknown> {
    if (request.method !== 'hello' && !this.hello) throw new EditorError(-32001, 'Perform the versioned hello handshake first.');
    let operation: ReturnType<typeof parseEditorOperation>;
    try { operation = parseEditorOperation(request); }
    catch (error) {
      if (['messages.attachmentChunk', 'messages.attachmentComplete'].includes(request.method)) this.engine.rejectAttachmentTransfer(request.params);
      throw error;
    }
    const { method, params: p } = operation;
    // Admission is synchronous: leave may wait, but nothing may start behind it.
    // Keep read-only inspection and the final shutdown response available.
    if (this.shutdownId !== undefined && method !== 'state.get') throw new EditorError(-32002, 'Backend is shutting down. No new operation was admitted.');
    switch (method) {
      case 'hello':
        this.hello = true; return { version: EDITOR_PROTOCOL_VERSION, backend: 'wbx-tui',
          ...editorFeatures(), state: this.engine.snapshot(), meeting: this.meetings.snapshot() };
      case 'session.start':
        await this.engine.startSession(p);
        return this.engine.snapshot();
      case 'session.stop': this.engine.stop(); return null;
      case 'state.get': return this.engine.snapshot();
      case 'drafts.open': return this.engine.openLocalDrafts();
      case 'drafts.save': return this.engine.saveLocalDrafts(p.profile, p.revision, p.items);
      case 'people.lookup': return this.engine.lookupPeople();
      case 'people.spaces': this.engine.setPeopleSpaces(p.roomIds); return null;
      case 'people.viewport': this.engine.setPeopleViewport(p.roomIds); return null;
      case 'people.search': return this.engine.searchDirectory(p.query, p.more, p.revision);
      case 'people.profile': return this.engine.personProfile(p.personId);
      case 'messages.thread': return this.engine.queryThread(p.roomId, p.messageId, p.more, p.revision);
      case 'messages.mentions': return this.engine.queryMentions(p.roomId, p.more, p.revision);
      case 'meetings.upcoming': return this.engine.refreshUpcoming();
      case 'spaces.cacheClear': await this.engine.clearCachedSpaces(); return null;
      case 'sections.edit': return this.engine.editSections(p.edit, p.revision);
      case 'sections.preferences': return this.engine.sectionPreferences(p.action, p.revision);
      case 'uploads.stage': return this.engine.stageUpload(p.path, p);
      case 'uploads.remove': this.engine.removeUpload(p.attachmentId, p); return null;
      case 'uploads.cancel': this.engine.cancelUpload(p.draftId, p.phase); return null;
      case 'uploads.send': await this.engine.sendUpload(p.requestId, p.text, p.attachmentId, p, {
        ...(p.format ? { format: p.format } : {}),
        ...(p.mentionsAccepted !== undefined ? { mentionsAccepted: p.mentionsAccepted } : {}),
        ...(p.allAccepted !== undefined ? { allAccepted: p.allAccepted } : {}),
      }); return null;
      case 'messages.actionPrepare': return this.engine.prepareMessageAction(p.roomId, p.messageId, p.action);
      case 'messages.actionSubmit': return this.engine.mutateMessage(p);
      case 'messages.actionResolve': this.engine.resolveMutation(p.roomId, p.messageId); return null;
      case 'messages.actionDiscard': this.engine.discardMessageContext(p.contextId); return null;
      case 'messages.readBy':
        if (p.watch) this.readerEvents = true;
        return this.engine.messageReaders(p.roomId, p.messageId);
      case 'messages.reactions': {
        if (p.details) return this.engine.reactionDetails(p.roomId,p.messageId);
        const value = await this.engine.reactionSummary(p.roomId,p.messageId);
        if (!p.selfSummary) for (const group of value.groups) delete group.mine;
        return value;
      }
      case 'messages.reactionsBatch': {
        const value = await this.engine.reactionSummaries({ roomId:p.roomId,messageIds:p.messageIds },p.progressive ? snapshot => {
          if (!p.selfSummary) for (const group of snapshot.groups) delete group.mine;
          this.notify('messages.reactionProgress',{ requestId:request.id,snapshot });
        } : undefined);
        if (!p.selfSummary) for (const item of value.items) if ('groups' in item) for (const group of item.groups) delete group.mine;
        return value;
      }
      case 'messages.reactionPrepare': return this.engine.prepareReaction(p.roomId,p.messageId,p.action,p.reaction);
      case 'messages.reactionSubmit': return this.engine.submitReaction(p.contextId,p.requestId,p.roomId,p.messageId);
      case 'messages.reactionResolve': this.engine.inspectReactions(p.roomId,p.messageId,p.requestId); return null;
      case 'messages.reactionDiscard': this.engine.discardReaction(p.contextId); return null;
      case 'messages.sendRich': await this.engine.sendRich(p.requestId, p.text, p, {
        ...(p.mentionsAccepted !== undefined ? { mentionsAccepted: p.mentionsAccepted } : {}),
        ...(p.allAccepted !== undefined ? { allAccepted: p.allAccepted } : {}),
      }); return null;
      case 'members.list': return this.engine.roomMembers(p.more);
      case 'members.visibility': return this.engine.memberVisibility(p.roomId);
      case 'direct.prepare': return this.engine.prepareDirect(p.person);
      case 'direct.send': return this.engine.sendDirect(p.requestId, p.targetId, p.draftId, p.text, {
        ...(p.format ? { format: p.format } : {}), ...(p.attachmentId ? { attachmentId: p.attachmentId } : {}),
      });
      case 'direct.resolve': this.engine.resolveDirect(p.targetId); return null;
      case 'direct.discard': this.engine.discardDirect(p.targetId); return null;
      case 'rooms.create': return this.engine.createSpace(p.requestId, p.title);
      case 'rooms.rename': return this.engine.renameSpace(p.requestId, p.roomId, p.expectedTitle, p.title);
      case 'rooms.descriptionPrepare': return this.engine.prepareSpaceDescription(p.roomId);
      case 'rooms.describe': return this.engine.describeSpace(p.requestId, p.roomId, p.expectedTitle, p.expectedDescription, p.description);
      case 'rooms.descriptionClear': return this.engine.clearSpaceDescription(p.requestId, p.roomId, p.expectedTitle, p.expectedDescription);
      case 'rooms.lock': return this.engine.setSpaceLocked(p.requestId, p.roomId, p.expectedTitle, p.expectedLocked, p.locked);
      case 'rooms.announcement': return this.engine.setSpaceAnnouncementOnly(p.requestId, p.roomId, p.expectedTitle, p.expectedAnnouncementOnly, p.announcementOnly);
      case 'members.action': return this.engine.membershipAction(p.requestId, p.action, p.roomId, p.target);
      case 'conversations.resolve': await this.engine.recoverConversationAction(p.action, 'teamId' in p ? p.teamId : p.roomId, p.requestId); return null;
      case 'teams.descriptionPrepare': return this.engine.prepareTeamDescription(p.teamId, p.revision);
      case 'teams.describe': return this.engine.describeTeam(p.requestId, p.teamId, p.revision, p.expectedName, p.expectedDescription, p.description);
      case 'teams.renamePrepare': return this.engine.prepareTeamRename(p.teamId, p.revision);
      case 'teams.rename': return this.engine.renameTeam(p.requestId, p.teamId, p.revision, p.expectedName, p.name);
      case 'teams.list': return this.engine.serverTeams(p.more);
      case 'teams.joined': return this.engine.joinedTeams(p.more, p.revision);
      case 'meeting.joinUpcoming': return this.meetings.start({ mode: 'live', meeting: this.engine.upcomingJoinTarget(p.meetingId, p.revision),
        config: this.engine.config, display: p.display, fallback: p.fallback, headless: false });
      case 'auth.refresh': await this.engine.refreshAuth(); return null;
      case 'rooms.list': await this.engine.rooms(p.more); return null;
      case 'rooms.select': if (p.reload) await this.engine.select(p.roomId, true); else await this.engine.select(p.roomId); return null;
      case 'rooms.read': await this.engine.markRead(p.roomId, p.messageId); return null;
      case 'messages.images': await this.engine.images(p.roomId, p.messageId); return null;
      case 'messages.attachmentMetadata': await this.engine.attachmentMetadata(p.roomId, p.messageId); return null;
      case 'messages.imageOpen': return this.engine.openImage(p.roomId, p.messageId, p.imageId);
      case 'messages.attachmentOpen': return this.engine.openAttachment(p.roomId, p.messageId, p.attachmentId);
      case 'messages.attachmentResolve': return this.engine.resolveAttachment(request.id, p.roomId, p.messageId, p.attachmentId, { action: p.action, selectors: p.selectors }, p.transfer);
      case 'messages.attachmentChunk': return this.engine.attachmentChunk(p);
      case 'messages.attachmentComplete': return this.engine.completeAttachment(p);
      case 'messages.attachmentCancel': this.engine.cancelAttachment(p.requestId); return null;
      case 'messages.list': await this.engine.history(p.older); return null;
      case 'messages.send':
        if (p.parentId !== undefined) await this.engine.send(p.requestId, p.roomId, p.text, p.parentId);
        else await this.engine.send(p.requestId, p.roomId, p.text);
        return null;
      case 'delivery.resolve': this.engine.resolveDelivery(); return null;
      case 'delivery.resolveBound': return this.engine.resolveBoundDelivery(p.roomId);
      case 'meeting.start': return this.meetings.start(p);
      case 'meeting.present': return this.meetings.present(p.display, p.fallback);
      case 'meeting.control': if (p.action === 'quit') await this.meetings.leave(); else await this.meetings.action(p.action); return null;
      case 'meeting.pane': return this.meetings.paneAction(p.session, p.intent);
      case 'meeting.reconnect': return this.meetings.reconnect(p.session);
      case 'meeting.leave': await this.meetings.leave(); return null;
      case 'shutdown': this.shutdownId = request.id; this.engine.stop(); if (p.leaveMeeting) await this.meetings.leave(true); return null;
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.pendingState = undefined;
    this.pendingStateLane = undefined;
    this.closing = Promise.resolve().then(async () => { this.engine.stop(); await this.meetings.close(); this.completed.clear(); this.emit('closed'); });
    return this.closing;
  }
}
export async function runEditorWorker(args: string[]): Promise<void> {
  if (args.length) throw new Error('editor-worker takes no arguments; use the private versioned protocol.');
  let stopped!: () => void;
  const done = new Promise<void>(resolve => { stopped = resolve; });
  const output = editorOutput(process.stdout, () => { void close(); });
  const rpc = new EditorRPC(new EditorEngine(), new EditorMeetings(), output);
  const close = async () => { output.close(); await rpc.close(); stopped(); };
  rpc.once('closed', stopped);
  const lines = new EditorLines(line => { void rpc.receive(line); });
  const collect = (chunk: Buffer) => { try { lines.push(chunk); } catch { void close(); } };
  const eof = () => { void close(); };
  process.stdin.on('data', collect); process.stdin.once('end', eof); process.stdout.on('error', eof);
  process.once('SIGINT', eof); process.once('SIGTERM', eof); process.once('SIGHUP', eof);
  try { process.stdin.resume(); await done; await output.flush(); }
  finally {
    output.close();
    process.stdin.off('data', collect); process.stdin.off('end', eof); process.stdin.pause(); process.stdout.off('error', eof);
    process.off('SIGINT', eof); process.off('SIGTERM', eof); process.off('SIGHUP', eof); await rpc.close();
  }
}
