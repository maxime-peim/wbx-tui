/** Explicit public conversation/member actions. No bulk/admin/Team-member/room-delete operations. */
import { randomBytes, createHash } from 'node:crypto';
import { chatId, type ChatMessage } from './chat-protocol.js';
import { peopleId, senderName } from './identity-contracts.js';
import { PublicProblem, definitelyNotWritten, type ActionREST } from './public-rest.js';
import { RoomMembers, member } from './room-members.js';
import { validRichText, actionRequestId, CONVERSATION_LIMITS, DESCRIPTION_LIMITS, validDirectOptions, safeSpaceTitle,
  safeSpaceDescription, personChoice, type MessageAccess, type DescriptionSnapshot, type DirectOptions } from './action-contracts.js';
export { CONVERSATION_LIMITS, DESCRIPTION_LIMITS, validDirectOptions, safeSpaceTitle, safeSpaceDescription,
  personChoice, type DescriptionSnapshot, type DirectOptions } from './action-contracts.js';
import type { MessageRoom } from './messaging-api.js';
import { richMentions } from './rich-messages.js';
import { Uploads, UploadFailure, UPLOAD_LIMITS, uploadId, type UploadSource } from './uploads.js';
import { webexAttachment } from './message-images.js';
import { readTeamRenameProof, type TeamRenameSnapshot, type TeamDescriptionSnapshot } from './server-teams.js';
import { OperationSlot } from './operation-slot.js';
export interface DirectFiles {
  uploads: Uploads;
  knownMessage?(roomId: string, messageId: string): boolean;
  post(source: UploadSource, target: { roomId: string } | { toPersonId: string }, text: string, options: DirectOptions,
    token: string, signal: AbortSignal, submitted: () => void): Promise<unknown>;
}
export interface RecipientDraft { targetId: string; personId: string; label: string; expiresAt: number; roomId?: string }
interface RecipientContext { value: RecipientDraft; self: string }
export interface ConversationOutcome { requestId: string; action: 'create' | 'invite' | 'remove' | 'leave' | 'direct' | 'rename' | 'describe' | 'lock' | 'announcement' | 'description-clear' | 'team-rename' | 'team-describe';
  status: 'changed' | 'failed' | 'unknown' | 'conflict'; notice: string; roomId?: string; messageId?: string; targetId?: string; draftId?: string;
  format?: 'markdown'; attachmentId?: string; text?: string; expectedTitle?: string; title?: string;
  expectedDescription?: string; description?: string; expectedLocked?: boolean; locked?: boolean;
  expectedAnnouncementOnly?: boolean; announcementOnly?: boolean; teamId?: string; expectedName?: string; name?: string }
interface TeamRenameIntent extends TeamRenameSnapshot { name: string }
interface TeamDescriptionIntent extends TeamDescriptionSnapshot { description: string }
interface RenameIntent { roomId: string; expectedTitle: string; title: string }
interface DescriptionIntent extends DescriptionSnapshot { description: string }
type DescriptionClearIntent = DescriptionSnapshot;
interface LockIntent { roomId: string; expectedTitle: string; expectedLocked: boolean; locked: boolean }
interface AnnouncementIntent { roomId: string; expectedTitle: string; expectedAnnouncementOnly: boolean; announcementOnly: boolean }
interface Result { outcome: ConversationOutcome; room?: MessageRoom; message?: ChatMessage; file?: string; replayed?: true }
interface RequestEvidence {
  identity: string; epoch: number; result?: Result;
  /** Set only at metadata dispatch using fresh self proof. Retired evidence is never replayable. */
  partition?: string; key?: string; resolved?: true;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const spaceScopes = ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:rooms_write'];
const teamScopes = ['spark:people_read', 'spark:teams_read', 'spark:team_memberships_read', 'spark:teams_write'];
const standaloneRoom = (v: unknown, id: string): v is Record<string, unknown> & { title: string; isLocked: boolean } =>
  object(v) && !('errors' in v) && v.id === id && v.type === 'group' && !('teamId' in v)
  && safeSpaceTitle(v.title) && typeof v.isLocked === 'boolean' && v.isReadOnly !== true
  && ['isReadOnly', 'isAnnouncementOnly', 'isPublic'].every(key => v[key] === undefined || typeof v[key] === 'boolean');
const moderationRoom = (v: unknown, id: string): v is Record<string, unknown> & { title: string; isLocked: boolean } =>
  standaloneRoom(v, id) && Object.hasOwn(v, 'isLocked') && Object.hasOwn(v, 'isPublic') && v.isPublic === false
  && Object.hasOwn(v, 'isAnnouncementOnly') && v.isAnnouncementOnly === false;
const announcementRoom = (v: unknown, id: string): v is Record<string, unknown> & { title: string; isAnnouncementOnly: boolean } =>
  standaloneRoom(v, id) && Object.hasOwn(v, 'isLocked') && v.isLocked === true
  && Object.hasOwn(v, 'isPublic') && v.isPublic === false
  && Object.hasOwn(v, 'isAnnouncementOnly') && typeof v.isAnnouncementOnly === 'boolean';
export class ConversationActions {
  private epoch = 0;
  private readonly operations = new OperationSlot();
  private requests = new Map<string, RequestEvidence>();
  /** Disjoint retired section of the request ledger; moved on reset, never copied/replayed. */
  private retired = new Map<string, RequestEvidence>();
  private uncertain = new Map<string, string>();
  private recipients = new Map<string, RecipientContext>();
  private sent = new Set<string>();
  constructor(readonly rest: ActionREST, readonly members: RoomMembers, private access: () => MessageAccess | undefined,
    private selfIdentity: (signal: AbortSignal, token: () => string) => Promise<string>, private files?: DirectFiles,
    private partition?: (authenticatedSelf: string) => string) {}
  busy(): boolean { return this.operations.busy() || this.rest.busy(); }
  reset(): void {
    this.epoch++; this.operations.cancel();
    for (const [id, evidence] of this.requests)
      if (evidence.partition && evidence.result?.outcome.status === 'unknown') this.retired.set(id, evidence);
    this.requests.clear();
    this.uncertain.clear(); this.recipients.clear(); this.sent.clear();
  }
  /** Explicit recovery alone can use retired evidence, after fresh same-partition proof. */
  async recover(key: string, requestId: string | undefined, valid: () => boolean): Promise<void> {
    const evidence = requestId ? this.requests.get(requestId) ?? this.retired.get(requestId) : undefined;
    if (!evidence || evidence.epoch === this.epoch && !evidence.resolved) return this.resolve(key, requestId);
    if (!evidence.partition || evidence.key !== key || evidence.result?.outcome.status !== 'unknown')
      throw new PublicProblem('failed');
    await this.read(key.startsWith('team-') ? teamScopes : spaceScopes, valid, async (signal, token) => {
      const self = await this.selfIdentity(signal, token); token();
      if ((this.requests.get(requestId!) ?? this.retired.get(requestId!)) !== evidence || this.partition?.(self) !== evidence.partition
        || this.metadataUncertain(key, evidence.partition!, evidence))
        throw new PublicProblem('failed');
    }, false, CONVERSATION_LIMITS.operationMs, true);
    if (!valid() || (this.requests.get(requestId!) ?? this.retired.get(requestId!)) !== evidence) throw new PublicProblem('failed');
    this.credentials(key.startsWith('team-') ? teamScopes : spaceScopes);
    evidence.resolved = true; // No target publication, role grant, retry or mutation.
  }
  resolve(key: string, requestId?: string): void {
    const evidence = requestId ? this.requests.get(requestId) : undefined;
    if (evidence && (evidence.epoch !== this.epoch || evidence.resolved)) throw new PublicProblem('failed');
    if (key.startsWith('team-rename:') || key.startsWith('team-describe:')) {
      const outcome = requestId ? this.requests.get(requestId)?.result?.outcome : undefined;
      if (this.busy() || !requestId || this.uncertain.get(key) !== requestId || !outcome
        || !['team-rename', 'team-describe'].includes(outcome.action)
        || outcome.status !== 'unknown' || key !== outcome.action + ':' + outcome.teamId) throw new PublicProblem('failed');
    }
    if (key.startsWith('rename:') || key.startsWith('describe:') || key.startsWith('lock:') || key.startsWith('announcement:') || key.startsWith('description-clear:')) {
      const outcome = requestId ? this.requests.get(requestId)?.result?.outcome : undefined;
      if (this.busy() || !requestId || this.uncertain.get(key) !== requestId || !outcome
        || !['rename', 'describe', 'lock', 'announcement', 'description-clear'].includes(outcome.action) || outcome.status !== 'unknown'
        || key !== outcome.action + ':' + outcome.roomId) throw new PublicProblem('failed');
    }
    this.uncertain.delete(key);
    if (evidence) evidence.resolved = true;
  }
  recipient(targetId: string): RecipientDraft | undefined {
    const value = this.recipients.get(targetId)?.value;
    return value ? { ...value } : undefined;
  }
  discardRecipient(targetId: string): void {
    if (this.busy()) throw new PublicProblem('failed');
    this.recipients.delete(targetId);
    this.files?.uploads.revokeRecipient(targetId);
  }
  private credentials(scopes: string[]): MessageAccess {
    const access = this.access();
    if (!access || Date.now() >= access.expiresAt || !scopes.every(scope => access.scopes.includes(scope) || access.scopes.includes('spark:all'))) throw new PublicProblem('failed');
    return access;
  }
  private spaceUncertain(roomId: string): boolean {
    return this.uncertain.has('rename:' + roomId) || this.uncertain.has('describe:' + roomId)
      || this.uncertain.has('lock:' + roomId) || this.uncertain.has('announcement:' + roomId) || this.uncertain.has('description-clear:' + roomId);
  }
  private teamUncertain(teamId: string): boolean {
    return this.uncertain.has('team-rename:' + teamId) || this.uncertain.has('team-describe:' + teamId);
  }
  private metadataUncertain(key: string, partition: string, except: RequestEvidence): boolean {
    for (const evidence of [...this.requests.values(), ...this.retired.values()])
      if (evidence !== except && evidence.partition === partition && !evidence.resolved
        && evidence.result?.outcome.status === 'unknown'
        && (evidence.key?.startsWith('team-') === key.startsWith('team-'))
        && evidence.key?.slice(evidence.key.indexOf(':') + 1) === key.slice(key.indexOf(':') + 1)) return true;
    return false;
  }
  private async read<T>(scopes: string[], valid: () => boolean,
    work: (signal: AbortSignal, token: () => string, hold: (pending: Promise<unknown>) => void) => Promise<T>,
    mutation = false, timeout: number = CONVERSATION_LIMITS.operationMs, logical = false): Promise<T> {
    if (this.busy() || !valid()) throw new PublicProblem('failed');
    const epoch = this.epoch, abort = this.operations.acquire(), timer = setTimeout(() => abort.abort(), timeout);
    const held: Promise<unknown>[] = [];
    timer.unref?.();
    const token = () => {
      if (epoch !== this.epoch || !valid() || abort.signal.aborted) throw new PublicProblem('failed');
      return this.credentials(scopes).token;
    };
    let cancel: (() => void) | undefined;
    try {
      token(); const pending = work(abort.signal, token, pending => held.push(pending));
      let value: T;
      if (logical && !mutation) {
        held.push(pending);
        const canceled = new Promise<never>((_, reject) => {
          cancel = () => reject(new PublicProblem('failed'));
          abort.signal.addEventListener('abort', cancel, { once: true }); if (abort.signal.aborted) cancel();
        });
        value = await Promise.race([pending, canceled]);
      } else value = await pending;
      if (!mutation) token(); return value;
    }
    finally {
      if (cancel) abort.signal.removeEventListener('abort', cancel);
      clearTimeout(timer);
      const release = async () => {
        await Promise.allSettled(held); await this.rest.settled?.();
        this.operations.release(abort);
      };
      if (logical && (abort.signal.aborted || this.rest.busy())) void release(); else await release();
    }
  }
  private async person(choice: string, signal: AbortSignal, token: () => string): Promise<{ id: string; label: string }> {
    if (!personChoice(choice)) throw new PublicProblem('failed');
    const email = choice.includes('@'), response = await this.rest.call(email ? '/v1/people?email=' + encodeURIComponent(choice) : '/v1/people/' + encodeURIComponent(choice), 'GET', token(), signal);
    token();
    const raw = email && object(response.value) && !('errors' in response.value) && !response.link
      && Array.isArray(response.value.items) && response.value.items.length === 1
      ? response.value.items[0] : email ? undefined : response.value;
    if (!object(raw) || !peopleId(raw.id) || 'errors' in raw || !email && raw.id !== choice
      || email && (!Array.isArray(raw.emails) || !raw.emails.some(value => typeof value === 'string' && value.toLowerCase() === choice.toLowerCase()))) throw new PublicProblem('failed');
    return { id: raw.id, label: senderName(raw.displayName) || 'Unnamed person' };
  }
  prepareDirect(choice: string, valid: () => boolean): Promise<RecipientDraft> {
    return this.read(['spark:people_read', 'spark:messages_write', 'spark:rooms_read'], valid, async (signal, token) => {
      for (const [key, value] of this.recipients) if (value.value.expiresAt <= Date.now()) {
        this.recipients.delete(key); this.files?.uploads.revokeRecipient(key);
      }
      if (this.recipients.size >= CONVERSATION_LIMITS.contexts) throw new PublicProblem('failed');
      const self = await this.selfIdentity(signal, token), person = await this.person(choice, signal, token);
      if (self === person.id) throw new PublicProblem('failed');
      const value: RecipientDraft = { targetId: randomBytes(16).toString('hex'), personId: person.id, label: person.label,
        expiresAt: Date.now() + CONVERSATION_LIMITS.contextMs };
      this.recipients.set(value.targetId, { value, self }); return { ...value };
    });
  }
  private async perform(requestId: string, action: ConversationOutcome['action'], identity: unknown, key: string,
    scopes: string[], valid: () => boolean,
    work: (signal: AbortSignal, token: () => string, dispatch: (self?: string) => void) => Promise<Omit<Result, 'outcome'> & Partial<ConversationOutcome>>,
    timeout: number = CONVERSATION_LIMITS.operationMs, logical = false, metadata?: RenameIntent | DescriptionIntent | LockIntent | AnnouncementIntent | DescriptionClearIntent | TeamRenameIntent | TeamDescriptionIntent): Promise<Result> {
    if (!actionRequestId(requestId)) throw new PublicProblem('failed');
    const hash = digest([action, identity]), previous = this.requests.get(requestId) ?? this.retired.get(requestId);
    if (previous) {
      if (previous.epoch !== this.epoch || previous.identity !== hash || !previous.result) throw new PublicProblem('failed');
      return { ...structuredClone(previous.result), replayed: true };
    }
    if (this.requests.size + this.retired.size >= CONVERSATION_LIMITS.requests || this.uncertain.has(key)) throw new PublicProblem('failed');
    if (metadata && 'roomId' in metadata && this.spaceUncertain(metadata.roomId)) throw new PublicProblem('failed');
    if (metadata && 'teamId' in metadata && this.teamUncertain(metadata.teamId)) throw new PublicProblem('failed');
    return this.read(scopes, valid, async (signal, token, hold) => {
      const epoch = this.epoch; let dispatched = false;
      const evidence: RequestEvidence = { identity: hash, epoch };
      this.requests.set(requestId, evidence);
      let result: Result;
      let cancel!: () => void;
      try {
        const pending = work(signal, token, self => {
          token();
          if (metadata && this.partition) {
            if (!self) throw new PublicProblem('failed');
            const partition = this.partition(self);
            if (this.metadataUncertain(key, partition, evidence)) throw new PublicProblem('failed');
            evidence.partition = partition; evidence.key = key;
            // Reset may occur while PUT is held: retain possible-write evidence now,
            // not a late old-session completion that could populate active state.
            evidence.result = { outcome: { ...metadata, requestId, action, status: 'unknown',
              notice: 'Outcome UNKNOWN. Check Webex, resolve explicitly, then choose any retry. Nothing was replayed.' } };
          }
          dispatched = true;
        });
        hold(pending);
        const aborted = new Promise<never>((_, reject) => {
          cancel = () => reject(new PublicProblem(dispatched ? 'unknown' : 'failed'));
          signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
        });
        void aborted.catch(() => {}); // Legacy actions wait for their physical work rather than racing abort.
        const value = await (logical ? Promise.race([pending, aborted]) : pending);
        token();
        const { room, message, file, ...fields } = value;
        const conflict = ['rename', 'describe', 'lock', 'announcement', 'description-clear', 'team-rename', 'team-describe'].includes(action) && fields.status === 'conflict';
        result = { outcome: { ...fields, ...metadata, requestId, action, status: conflict ? 'conflict' : 'changed', notice: conflict
          ? action === 'team-describe' ? 'Team name or description changed since preparation. Nothing was updated; prepare a new explicit intent.'
            : action === 'team-rename' ? 'Team name changed since consent. Nothing was updated; prepare a new explicit intent.'
            : 'Space metadata changed since consent. Nothing was updated; inspect it and choose a new explicit intent.'
          : action === 'create' ? 'Space created. Invitations are separate explicit operations.'
          : action === 'lock' ? 'Confirmed moderation transition only. Main flags/roles were not refreshed; later actions require fresh proof. Nothing was replayed.'
          : action === 'announcement' ? 'Confirmed announcement-mode transition only. Main state/roles were not refreshed; later actions require fresh proof. Nothing was replayed.'
          : action === 'description-clear' ? 'Description clear confirmed by explicit empty ACK only. Main state was not refreshed; native text/undo remain. Nothing was replayed.'
          : 'Confirmed. Nothing was automatically replayed.' },
          ...(room ? { room } : {}), ...(message ? { message } : {}), ...(file ? { file } : {}) };
        if (logical && Buffer.byteLength(JSON.stringify(result)) > CONVERSATION_LIMITS.resultBytes) throw new PublicProblem('unknown');
      } catch (error) {
        const refusal = error instanceof PublicProblem || error instanceof UploadFailure;
        const unknown = !definitelyNotWritten(error) && dispatched
          && (!refusal || error.reason === 'unknown' || !error.status || signal.aborted || !valid());
        result = { outcome: { ...metadata, requestId, action, status: unknown ? 'unknown' : 'failed',
          notice: unknown ? 'Outcome UNKNOWN. Check Webex, resolve explicitly, then choose any retry. Nothing was replayed.'
            : 'Operation unavailable/refused. Nothing was retried.' } };
        if (unknown && epoch === this.epoch) this.uncertain.set(key, requestId);
      } finally { if (cancel) signal.removeEventListener('abort', cancel); }
      if (epoch === this.epoch) evidence.result = structuredClone(result);
      return result;
    }, true, timeout, logical);
  }
  create(requestId: string, title: string, valid: () => boolean): Promise<Result> {
    if (!safeSpaceTitle(title)) return Promise.reject(new PublicProblem('failed'));
    return this.perform(requestId, 'create', { title }, 'create', ['spark:people_read', 'spark:rooms_write'], valid, async (signal, token, dispatch) => {
      await this.selfIdentity(signal, token); dispatch();
      const response = await this.rest.call('/v1/rooms', 'POST', token(), signal, { title });
      token(); const raw = response.value;
      if (!object(raw) || 'errors' in raw || !chatId(raw.id) || raw.type !== 'group' || typeof raw.title !== 'string' || raw.title !== title) throw new PublicProblem('unknown');
      return { roomId: raw.id, room: { id: raw.id, title, type: 'group', lastActivity: '' } };
    });
  }
  prepareTeamRename(teamId: string, valid: () => boolean): Promise<TeamRenameSnapshot> {
    if (!chatId(teamId) || this.teamUncertain(teamId)) return Promise.reject(new PublicProblem('failed'));
    return this.read(teamScopes, valid, async (signal, token) => {
      const self = await this.selfIdentity(signal, token);
      token();
      return readTeamRenameProof(this.rest, teamId, self, token, signal, safeSpaceTitle);
    }, false, CONVERSATION_LIMITS.operationMs, true);
  }
  renameTeam(requestId: string, teamId: string, expectedName: string, name: string, valid: () => boolean): Promise<Result> {
    if (!chatId(teamId) || !safeSpaceTitle(expectedName) || !safeSpaceTitle(name) || name === expectedName) return Promise.reject(new PublicProblem('failed'));
    const intent = { teamId, expectedName, name };
    return this.perform(requestId, 'team-rename', intent, 'team-rename:' + teamId, teamScopes, valid, async (signal, token, dispatch) => {
      const self = await this.selfIdentity(signal, token); token();
      const proof = await readTeamRenameProof(this.rest, teamId, self, token, signal, safeSpaceTitle, expectedName);
      token(); if (proof.expectedName !== expectedName) return { status: 'conflict' };
      dispatch(self);
      const response = await this.rest.call('/v1/teams/' + encodeURIComponent(teamId), 'PUT', token(), signal, { name });
      token(); const raw = response.value;
      if (response.link || !object(raw) || 'errors' in raw || raw.id !== teamId || raw.name !== name) throw new PublicProblem('unknown');
      return {};
    }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  readTeamDescription(teamId: string, valid: () => boolean): Promise<TeamDescriptionSnapshot> {
    if (!chatId(teamId) || this.teamUncertain(teamId)) return Promise.reject(new PublicProblem('failed'));
    return this.read(teamScopes, valid, async (signal, token) => {
      const self = await this.selfIdentity(signal, token); token();
      const proof = await readTeamRenameProof(this.rest, teamId, self, token, signal, safeSpaceTitle, undefined, { safe: safeSpaceDescription });
      if (Buffer.byteLength(JSON.stringify(proof)) > CONVERSATION_LIMITS.resultBytes) throw new PublicProblem('failed');
      return proof;
    }, false, CONVERSATION_LIMITS.operationMs, true);
  }
  describeTeam(requestId: string, teamId: string, expectedName: string, expectedDescription: string,
    description: string, valid: () => boolean): Promise<Result> {
    if (!chatId(teamId) || !safeSpaceTitle(expectedName) || !safeSpaceDescription(expectedDescription)
      || !safeSpaceDescription(description, true) || description === expectedDescription) return Promise.reject(new PublicProblem('failed'));
    const intent = { teamId, expectedName, expectedDescription, description };
    return this.perform(requestId, 'team-describe', intent, 'team-describe:' + teamId, teamScopes, valid, async (signal, token, dispatch) => {
      const self = await this.selfIdentity(signal, token); token();
      const proof = await readTeamRenameProof(this.rest, teamId, self, token, signal, safeSpaceTitle, expectedName,
        { safe: safeSpaceDescription, expected: expectedDescription });
      token();
      if (proof.expectedName !== expectedName || proof.expectedDescription !== expectedDescription) return { status: 'conflict' };
      dispatch(self);
      const response = await this.rest.call('/v1/teams/' + encodeURIComponent(teamId), 'PUT', token(), signal, { name: expectedName, description });
      token(); const raw = response.value;
      if (response.link || !object(raw) || 'errors' in raw || raw.id !== teamId || raw.name !== expectedName
        || !Object.hasOwn(raw, 'description') || raw.description !== description) throw new PublicProblem('unknown');
      return {};
    }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  rename(requestId: string, roomId: string, expectedTitle: string, title: string, valid: () => boolean): Promise<Result> {
    if (!chatId(roomId) || !safeSpaceTitle(expectedTitle) || !safeSpaceTitle(title) || title === expectedTitle) return Promise.reject(new PublicProblem('failed'));
    const intent = { roomId, expectedTitle, title };
    return this.perform(requestId, 'rename', intent, 'rename:' + roomId,
      spaceScopes, valid, async (signal, token, dispatch) => {
        const self = await this.selfIdentity(signal, token);
        const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal);
        token(); const raw = response.value;
        if (!standaloneRoom(raw, roomId)) throw new PublicProblem('failed');
        if (raw.title !== expectedTitle) return { status: 'conflict' };
        const own = await this.members.verify(this.rest, roomId, self, token(), signal);
        token();
        if (raw.isLocked && !own.moderator) throw new PublicProblem('failed');
        dispatch(self);
        const updated = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'PUT', token(), signal, { title });
        token();
        if (!object(updated.value) || 'errors' in updated.value || updated.value.id !== roomId
          || updated.value.type !== 'group' || updated.value.title !== title) throw new PublicProblem('unknown');
        return {};
      }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  readDescription(roomId: string, valid: () => boolean): Promise<DescriptionSnapshot> {
    if (!chatId(roomId) || this.spaceUncertain(roomId)) return Promise.reject(new PublicProblem('failed'));
    return this.read(spaceScopes, valid, async (signal, token) => {
      const self = await this.selfIdentity(signal, token);
      const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal);
      token(); const raw = response.value;
      if (!standaloneRoom(raw, roomId) || !Object.hasOwn(raw, 'description') || !safeSpaceDescription(raw.description)) throw new PublicProblem('failed');
      const own = await this.members.verify(this.rest, roomId, self, token(), signal);
      token(); if (raw.isLocked && !own.moderator) throw new PublicProblem('failed');
      const snapshot = { roomId, expectedTitle: raw.title, expectedDescription: raw.description };
      if (Buffer.byteLength(JSON.stringify(snapshot)) > CONVERSATION_LIMITS.resultBytes) throw new PublicProblem('failed');
      return snapshot;
    }, false, CONVERSATION_LIMITS.operationMs, true);
  }
  describe(requestId: string, roomId: string, expectedTitle: string, expectedDescription: string,
    description: string, valid: () => boolean): Promise<Result> {
    if (!chatId(roomId) || !safeSpaceTitle(expectedTitle) || !safeSpaceDescription(expectedDescription)
      || !safeSpaceDescription(description, true) || description === expectedDescription) return Promise.reject(new PublicProblem('failed'));
    const intent = { roomId, expectedTitle, expectedDescription, description };
    return this.perform(requestId, 'describe', intent, 'describe:' + roomId, spaceScopes, valid, async (signal, token, dispatch) => {
      const self = await this.selfIdentity(signal, token);
      const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal);
      token(); const raw = response.value;
      if (!standaloneRoom(raw, roomId) || !Object.hasOwn(raw, 'description') || !safeSpaceDescription(raw.description)) throw new PublicProblem('failed');
      if (raw.title !== expectedTitle || raw.description !== expectedDescription) return { status: 'conflict' };
      const own = await this.members.verify(this.rest, roomId, self, token(), signal);
      token(); if (raw.isLocked && !own.moderator) throw new PublicProblem('failed');
      dispatch(self);
      const updated = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'PUT', token(), signal, { title: expectedTitle, description });
      token(); const ack = updated.value;
      if (!object(ack) || 'errors' in ack || ack.id !== roomId || ack.type !== 'group'
        || ack.title !== expectedTitle || ack.description !== description) throw new PublicProblem('unknown');
      return {};
    }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  clearDescription(requestId: string, roomId: string, expectedTitle: string, expectedDescription: string,
    valid: () => boolean): Promise<Result> {
    if (!chatId(roomId) || !safeSpaceTitle(expectedTitle) || !safeSpaceDescription(expectedDescription, true)) return Promise.reject(new PublicProblem('failed'));
    const intent = { roomId, expectedTitle, expectedDescription };
    return this.perform(requestId, 'description-clear', intent, 'description-clear:' + roomId, spaceScopes, valid, async (signal, token, dispatch) => {
      const self = await this.selfIdentity(signal, token);
      const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal);
      token(); const raw = response.value;
      if (!moderationRoom(raw, roomId) || !Object.hasOwn(raw, 'description') || !safeSpaceDescription(raw.description, true)) throw new PublicProblem('failed');
      if (raw.title !== expectedTitle || raw.description !== expectedDescription) return { status: 'conflict' };
      const own = await this.members.verify(this.rest, roomId, self, token(), signal, true);
      token(); if (raw.isLocked && !own.moderator) throw new PublicProblem('failed');
      dispatch(self);
      const updated = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'PUT', token(), signal,
        { title: expectedTitle, description: ' ' }); // Documented input sentinel; never caller text or response proof.
      token(); const ack = updated.value;
      if (!moderationRoom(ack, roomId) || ack.title !== expectedTitle || ack.isLocked !== raw.isLocked
        || !Object.hasOwn(ack, 'description') || ack.description !== '') throw new PublicProblem('unknown');
      return {}; // Omitted/null/sentinel ACKs are unknown; no post-PUT read or fallback.
    }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  setLocked(requestId: string, roomId: string, expectedTitle: string, expectedLocked: boolean,
    locked: boolean, valid: () => boolean): Promise<Result> {
    if (!chatId(roomId) || !safeSpaceTitle(expectedTitle) || typeof expectedLocked !== 'boolean'
      || typeof locked !== 'boolean' || expectedLocked === locked) return Promise.reject(new PublicProblem('failed'));
    const intent = { roomId, expectedTitle, expectedLocked, locked };
    return this.perform(requestId, 'lock', intent, 'lock:' + roomId, spaceScopes, valid, async (signal, token, dispatch) => {
      const self = await this.selfIdentity(signal, token);
      const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal);
      token(); const raw = response.value;
      if (!moderationRoom(raw, roomId)) throw new PublicProblem('failed');
      if (raw.title !== expectedTitle || raw.isLocked !== expectedLocked) return { status: 'conflict' };
      if (locked && (!Object.hasOwn(raw, 'creatorId') || !peopleId(raw.creatorId) || raw.creatorId !== self)) throw new PublicProblem('failed');
      const own = await this.members.verify(this.rest, roomId, self, token(), signal, true);
      token();
      if (own.moderator !== expectedLocked) throw new PublicProblem('failed');
      dispatch(self);
      const updated = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'PUT', token(), signal, { title: expectedTitle, isLocked: locked });
      token(); const ack = updated.value;
      if (!moderationRoom(ack, roomId) || ack.title !== expectedTitle || ack.isLocked !== locked) throw new PublicProblem('unknown');
      return {};
    }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  setAnnouncementOnly(requestId: string, roomId: string, expectedTitle: string, expectedAnnouncementOnly: boolean,
    announcementOnly: boolean, valid: () => boolean): Promise<Result> {
    if (!chatId(roomId) || !safeSpaceTitle(expectedTitle) || typeof expectedAnnouncementOnly !== 'boolean'
      || typeof announcementOnly !== 'boolean' || expectedAnnouncementOnly === announcementOnly) return Promise.reject(new PublicProblem('failed'));
    const intent = { roomId, expectedTitle, expectedAnnouncementOnly, announcementOnly };
    return this.perform(requestId, 'announcement', intent, 'announcement:' + roomId, spaceScopes, valid, async (signal, token, dispatch) => {
      const self = await this.selfIdentity(signal, token);
      const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal);
      token(); const raw = response.value;
      if (!announcementRoom(raw, roomId)) throw new PublicProblem('failed');
      if (raw.title !== expectedTitle || raw.isAnnouncementOnly !== expectedAnnouncementOnly) return { status: 'conflict' };
      const own = await this.members.verify(this.rest, roomId, self, token(), signal, true);
      token(); if (!own.moderator) throw new PublicProblem('failed');
      dispatch(self);
      const updated = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'PUT', token(), signal,
        { title: expectedTitle, isAnnouncementOnly: announcementOnly });
      token(); const ack = updated.value;
      if (!announcementRoom(ack, roomId) || ack.title !== expectedTitle || ack.isAnnouncementOnly !== announcementOnly) throw new PublicProblem('unknown');
      return {};
    }, CONVERSATION_LIMITS.operationMs, true, intent);
  }
  membership(requestId: string, action: 'invite' | 'remove' | 'leave', roomId: string, target: string | undefined, valid: () => boolean): Promise<Result> {
    if (!chatId(roomId) || action === 'invite' && !personChoice(target) || action === 'remove' && !chatId(target)
      || action === 'leave' && target !== undefined) return Promise.reject(new PublicProblem('failed'));
    return this.perform(requestId, action, { roomId, target }, action + ':' + roomId,
      ['spark:people_read', 'spark:rooms_read', 'spark:memberships_read', 'spark:memberships_write'], valid, async (signal, token, dispatch) => {
        const self = await this.selfIdentity(signal, token);
        const response = await this.rest.call('/v1/rooms/' + encodeURIComponent(roomId), 'GET', token(), signal), raw = response.value;
        if (!object(raw) || 'errors' in raw || raw.id !== roomId || raw.type !== 'group') throw new PublicProblem('failed');
        const own = await this.members.verify(this.rest, roomId, self, token(), signal);
        if (action === 'invite') {
          if (!(raw.isLocked === false || raw.isLocked === true && own.moderator)) throw new PublicProblem('failed');
          const person = await this.person(target!, signal, token);
          if (person.id === self) throw new PublicProblem('failed');
          dispatch();
          const added = await this.rest.call('/v1/memberships', 'POST', token(), signal, { roomId, personId: person.id });
          token(); const value = member(added.value, roomId);
          if (!value || value.personId !== person.id || value.moderator) throw new PublicProblem('unknown');
          return { roomId };
        }
        let membership = own;
        if (action === 'remove') {
          if (!own.moderator) throw new PublicProblem('failed');
          const fresh = await this.rest.call('/v1/memberships/' + encodeURIComponent(target!), 'GET', token(), signal);
          const value = member(fresh.value, roomId);
          if (!value || value.id !== target || value.personId === self) throw new PublicProblem('failed');
          membership = value;
        }
        dispatch();
        const removed = await this.rest.call('/v1/memberships/' + encodeURIComponent(membership.id), 'DELETE', token(), signal);
        token(); if (removed.value !== undefined) throw new PublicProblem('unknown');
        return { roomId };
      }).then(result => ({ ...result, outcome: { ...result.outcome, roomId } }));
  }
  sendDirect(requestId: string, targetId: string, draftId: string, text: string, valid: () => boolean, options: DirectOptions = {}): Promise<Result> {
    const context = this.recipients.get(targetId);
    if (!context || context.value.expiresAt <= Date.now() || !/^[A-Za-z0-9_-]{1,64}$/.test(draftId)
      || !validDirectOptions(options) || !(validRichText(text) || text === '' && options.attachmentId && !options.format)) return Promise.reject(new PublicProblem('failed'));
    options = { ...(options.format ? { format: options.format } : {}), ...(options.attachmentId ? { attachmentId: options.attachmentId } : {}) };
    const intent = options, modern = !!(intent.format || intent.attachmentId);
    const current = () => valid() && this.recipients.get(targetId) === context && context.value.expiresAt > Date.now();
    return this.perform(requestId, 'direct', { targetId, draftId, text, ...intent }, 'direct:' + context.value.personId,
      ['spark:people_read', 'spark:messages_write', 'spark:rooms_read'], valid, async (signal, token, dispatch) => {
        const check = (active = signal) => {
          if (active.aborted || !current()) throw new PublicProblem('failed');
          return token();
        };
        const run = async (active: AbortSignal, source?: UploadSource, submitted = () => {}) => {
          const credential = () => check(active);
          const preflight = new AbortController(), timer = setTimeout(() => {
            preflight.abort(); if (source) this.files!.uploads.cancel(draftId, 'send');
          }, CONVERSATION_LIMITS.operationMs);
          timer.unref?.();
          const before = AbortSignal.any([active, preflight.signal]);
          let self: string, person: { id: string; label: string };
          const real = context.value.roomId;
          try {
            if (intent.format) {
              const targets = richMentions(text);
              if (targets.all || targets.people.length) throw new PublicProblem('failed');
            }
            const fresh = () => { check(before); return token(); };
            self = await this.selfIdentity(before, fresh);
            if (self !== context.self) throw new PublicProblem('failed');
            person = await this.person(context.value.personId, before, fresh);
            if (person.id === self) throw new PublicProblem('failed');
            if (real) {
              const current = await this.rest.call('/v1/rooms/' + encodeURIComponent(real), 'GET', fresh(), before);
              if (!object(current.value) || 'errors' in current.value || current.value.id !== real || current.value.type !== 'direct') throw new PublicProblem('failed');
            }
            fresh();
          } finally { clearTimeout(timer); preflight.abort(); await this.rest.settled?.(); }
          const target = real ? { roomId: real } : { toPersonId: person.id };
          const admit = () => { credential(); dispatch(); submitted(); };
          let raw: unknown;
          if (source) raw = await this.files!.post(source, target, text, intent, credential(), active, admit);
          else {
            admit();
            raw = (await this.rest.call('/v1/messages', 'POST', credential(), active,
              { ...target, ...(intent.format ? { markdown: text } : { text }) })).value;
          }
          credential();
          if (!object(raw) || 'errors' in raw || !chatId(raw.id) || !chatId(raw.roomId) || real && raw.roomId !== real
            || raw.personId !== self || raw.parentId !== undefined && raw.parentId !== null
            || typeof raw.created !== 'string' || raw.created.length > 128 || !Number.isFinite(Date.parse(raw.created))
            || (modern ? raw.toPersonId !== person.id : raw.toPersonId !== undefined && raw.toPersonId !== person.id)
            || modern && raw.roomType !== undefined && raw.roomType !== 'direct'
            || (intent.attachmentId ? !Array.isArray(raw.files) || raw.files.length !== 1 || !webexAttachment(raw.files[0])
              : raw.files !== undefined && (!Array.isArray(raw.files) || raw.files.length !== 0))
            || raw.attachments !== undefined && (!Array.isArray(raw.attachments) || raw.attachments.length !== 0)
            || (intent.format ? raw.markdown !== text : raw.text !== text && !(intent.attachmentId && text === '' && raw.text === undefined))
            || !intent.format && (raw.markdown !== undefined && raw.markdown !== '' || raw.html !== undefined && raw.html !== '')) throw new PublicProblem('unknown');
          const messageKey = JSON.stringify([raw.roomId, raw.id]);
          if (this.sent.has(messageKey) || modern && this.files?.knownMessage?.(raw.roomId, raw.id)) throw new PublicProblem('unknown');
          if (!real) {
            try {
              const room = await this.rest.call('/v1/rooms/' + encodeURIComponent(raw.roomId), 'GET', credential(), active);
              if (!object(room.value) || 'errors' in room.value || room.value.id !== raw.roomId || room.value.type !== 'direct') throw new PublicProblem('unknown');
            } catch { throw new PublicProblem('unknown'); } // The POST already succeeded; a GET refusal cannot undo it.
          }
          credential();
          const room: MessageRoom = { id: raw.roomId, type: 'direct', title: person.label, lastActivity: new Date(raw.created).toISOString() };
          const message: ChatMessage = { id: raw.id, author: 'You', authorId: self, created: room.lastActivity, text,
            ...(intent.format ? { markdown: text } : {}) };
          return { roomId: room.id, messageId: message.id, targetId, draftId, room, message,
            ...(modern ? { ...intent, text } : {}), ...(intent.attachmentId ? { file: (raw.files as string[])[0] } : {}) };
        };
        if (!intent.attachmentId) return run(signal);
        if (!this.files) throw new PublicProblem('failed');
        return this.files.uploads.send(intent.attachmentId, { targetId, draftId }, current,
          async (source, active, submitted) => {
            try { return await run(active, source, submitted); }
            finally { await this.rest.settled?.(); }
          }, signal);
      }, intent.attachmentId ? UPLOAD_LIMITS.sendMs : CONVERSATION_LIMITS.operationMs, modern).then(result => {
        if (result.outcome.status === 'changed' && current()) {
          this.sent.add(JSON.stringify([result.outcome.roomId, result.outcome.messageId]));
          context.value.roomId = result.outcome.roomId;
        }
        return { ...result, outcome: { ...result.outcome, targetId, draftId, ...(modern ? { ...intent, text } : {}) } };
      });
  }
}
