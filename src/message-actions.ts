/** Own-message mutation contexts/results, deliberately distinct from new-message delivery. */
import { createHash, randomBytes } from 'node:crypto';
import { chatId } from './chat-protocol.js';
import { peopleId } from './identity-contracts.js';
import { type ActionREST, PublicProblem, definitelyNotWritten } from './public-rest.js';
import { RoomMembers, authenticatedSelf } from './room-members.js';
import { richMentions, validateMentions } from './rich-messages.js';
import { OperationSlot } from './operation-slot.js';
import { MESSAGE_ACTION_LIMITS, contextId, actionRequestId, validRichText, type MessageFormat, type MessageAction,
  type MessageAccess, type EditContext, type MutationIntent, type MutationOutcome } from './action-contracts.js';
export { MESSAGE_ACTION_LIMITS, contextId, actionRequestId, validRichText, type MessageFormat, type MessageAction,
  type MessageAccess, type EditContext, type MutationIntent, type MutationOutcome } from './action-contracts.js';
interface Context { value: EditContext; fingerprint: string; self: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function source(raw: unknown, room: string, id: string, self: string, action: MessageAction) {
  if (!object(raw) || raw.id !== id || raw.roomId !== room || raw.personId !== self || 'errors' in raw
    || typeof raw.created !== 'string' || raw.created.length > 128 || !Number.isFinite(Date.parse(raw.created))
    || raw.updated !== undefined && raw.updated !== null && (typeof raw.updated !== 'string' || raw.updated.length > 128 || !Number.isFinite(Date.parse(raw.updated)))
    || raw.parentId !== undefined && raw.parentId !== null && (!chatId(raw.parentId) || raw.parentId === id)
    || raw.files !== undefined && !Array.isArray(raw.files) || raw.attachments !== undefined && !Array.isArray(raw.attachments)) throw new PublicProblem('failed');
  const format: MessageFormat = typeof raw.markdown === 'string' && raw.markdown ? 'markdown' : 'plain';
  const content = format === 'markdown' ? raw.markdown : raw.text;
  if (action === 'edit' && (!validRichText(content) || (raw.files as unknown[] | undefined)?.length || (raw.attachments as unknown[] | undefined)?.length)) throw new PublicProblem('failed');
  // Fingerprint exact bounded raw fields rather than a lossy rendered body.
  const fingerprint = digest([id, room, self, raw.created, raw.updated, raw.parentId, raw.text, raw.markdown, raw.html, raw.files, raw.attachments]);
  return { format, content: action === 'edit' && typeof content === 'string' ? content : '', fingerprint,
    created: new Date(raw.created).toISOString(), parentId: raw.parentId ?? undefined,
    updated: typeof raw.updated === 'string' ? new Date(raw.updated).toISOString() : undefined };
}
export class MessageActions {
  private contexts = new Map<string, Context>();
  private requests = new Map<string, { identity: string; result?: MutationOutcome }>();
  private uncertain = new Set<string>();
  private edits = new Map<string, number>();
  private epoch = 0;
  private readonly operations = new OperationSlot();
  constructor(readonly rest: ActionREST, private access: () => MessageAccess | undefined, readonly members = new RoomMembers()) {}
  reset(): void { this.epoch++; this.operations.cancel(); this.contexts.clear(); this.requests.clear(); this.uncertain.clear(); this.edits.clear(); }
  busy(): boolean { return this.operations.busy() || this.rest.busy(); }
  target(id: string, request?: string): { roomId: string; messageId: string } | undefined {
    const value = this.contexts.get(id)?.value ?? (request ? this.requests.get(request)?.result : undefined);
    return value?.contextId === id ? { roomId: value.roomId, messageId: value.messageId } : undefined;
  }
  discard(id: string): void {
    if (!contextId(id) || this.busy()) throw new PublicProblem('failed');
    this.contexts.delete(id);
  }
  private credentials(): MessageAccess {
    const access = this.access();
    if (!access || Date.now() >= access.expiresAt || !['spark:people_read', 'spark:messages_read', 'spark:messages_write']
      .every(scope => access.scopes.includes(scope) || access.scopes.includes('spark:all'))) throw new PublicProblem('failed');
    return access;
  }
  private async run<T>(valid: () => boolean, work: (signal: AbortSignal, check: () => MessageAccess) => Promise<T>): Promise<T> {
    if (this.busy() || !valid()) throw new PublicProblem('failed');
    const epoch = this.epoch, abort = this.operations.acquire();
    const timer = setTimeout(() => abort.abort(), MESSAGE_ACTION_LIMITS.operationMs); timer.unref?.();
    const check = () => {
      if (epoch !== this.epoch || abort.signal.aborted || !valid()) throw new PublicProblem('failed');
      return this.credentials();
    };
    try { check(); return await work(abort.signal, check); }
    finally { clearTimeout(timer); this.operations.release(abort); }
  }
  private async self(signal: AbortSignal, check: () => MessageAccess): Promise<string> {
    return authenticatedSelf(this.rest, signal, () => check().token);
  }
  prepare(room: string, id: string, action: MessageAction, valid: () => boolean): Promise<EditContext> {
    if (!chatId(room) || !chatId(id) || !['edit', 'delete'].includes(action)) return Promise.reject(new PublicProblem('failed'));
    return this.run(valid, async (signal, check) => {
      for (const [key, context] of this.contexts) if (context.value.expiresAt <= Date.now()) this.contexts.delete(key);
      if (this.contexts.size >= MESSAGE_ACTION_LIMITS.contexts || this.uncertain.has(JSON.stringify([room, id]))) throw new PublicProblem('failed');
      const self = await this.self(signal, check);
      const result = await this.rest.call('/v1/messages/' + encodeURIComponent(id), 'GET', check().token, signal);
      check();
      const parsed = source(result.value, room, id, self, action);
      const value: EditContext = { contextId: randomBytes(16).toString('hex'), roomId: room, messageId: id, action,
        content: parsed.content, format: parsed.format, expiresAt: Date.now() + MESSAGE_ACTION_LIMITS.lifetimeMs };
      this.contexts.set(value.contextId, { value, fingerprint: parsed.fingerprint, self });
      return { ...value };
    });
  }
  async submit(intent: MutationIntent, valid: () => boolean): Promise<{ outcome: MutationOutcome; raw?: unknown }> {
    if (!contextId(intent.contextId) || !actionRequestId(intent.requestId) || intent.conflictAccepted !== true
      || !['edit', 'delete'].includes(intent.action) || !Number.isSafeInteger(intent.revision) || intent.revision < 0
      || intent.action === 'edit' && (!validRichText(intent.content) || !['plain', 'markdown'].includes(intent.format ?? ''))
      || intent.action === 'delete' && (intent.content !== undefined || intent.format !== undefined)) throw new PublicProblem('failed');
    const identity = digest(intent), previous = this.requests.get(intent.requestId);
    if (previous) {
      if (previous.identity !== identity || !previous.result) throw new PublicProblem('failed');
      return { outcome: { ...previous.result } };
    }
    const context = this.contexts.get(intent.contextId), value = context?.value;
    if (!context || !value || value.action !== intent.action || value.expiresAt <= Date.now()
      || this.requests.size >= MESSAGE_ACTION_LIMITS.requests || this.uncertain.has(JSON.stringify([value.roomId, value.messageId]))) throw new PublicProblem('failed');
    return this.run(valid, async (signal, check) => {
      this.requests.set(intent.requestId, { identity });
      let dispatched = false, raw: unknown;
      const result = (status: MutationOutcome['status']): MutationOutcome => ({
        requestId: intent.requestId, contextId: intent.contextId, roomId: value.roomId, messageId: value.messageId,
        action: intent.action, revision: intent.revision, status,
        notice: status === 'changed' ? 'Confirmed. No new message was created.'
          : status === 'conflict' ? 'Message changed since preparation. Nothing was overwritten. Reopen explicitly.'
          : status === 'unknown' ? 'Mutation UNKNOWN. Check Webex, then resolve explicitly. Nothing was replayed.'
          : 'Mutation refused/unavailable. Nothing was retried.',
      });
      let outcome: MutationOutcome;
      const key = JSON.stringify([value.roomId, value.messageId]);
      try {
        const self = await this.self(signal, check);
        if (self !== context.self) throw new PublicProblem('failed');
        if (intent.action === 'edit' && intent.format === 'markdown') {
          const access = check(), targets = richMentions(intent.content!);
          if ((targets.people.length || targets.all) && !access.scopes.some(scope => ['spark:all', 'spark:memberships_read'].includes(scope))) throw new PublicProblem('failed');
          await validateMentions(this.rest, this.members, value.roomId, intent.content!, intent, signal, () => check().token);
        }
        const fresh = await this.rest.call('/v1/messages/' + encodeURIComponent(value.messageId), 'GET', check().token, signal);
        check();
        const parsed = source(fresh.value, value.roomId, value.messageId, self, intent.action);
        if (parsed.fingerprint !== context.fingerprint) outcome = result('conflict');
        else {
          if (intent.action === 'edit' && (this.edits.get(key) ?? 0) >= MESSAGE_ACTION_LIMITS.edits) throw new PublicProblem('failed');
          const token = check().token;
          dispatched = true;
          const response = await this.rest.call('/v1/messages/' + encodeURIComponent(value.messageId),
            intent.action === 'edit' ? 'PUT' : 'DELETE', token, signal,
            intent.action === 'edit' ? { roomId: value.roomId, [intent.format === 'markdown' ? 'markdown' : 'text']: intent.content } : undefined);
          check();
          if (intent.action === 'edit') {
            const updated = source(response.value, value.roomId, value.messageId, self, 'edit');
            if (updated.format !== intent.format || updated.content !== intent.content || updated.created !== parsed.created
              || updated.parentId !== parsed.parentId || parsed.updated && (!updated.updated || updated.updated < parsed.updated)) throw new PublicProblem('unknown');
            this.edits.set(key, (this.edits.get(key) ?? 0) + 1); raw = response.value;
          } else if (response.value !== undefined) throw new PublicProblem('unknown');
          outcome = result('changed');
        }
      } catch (error) {
        const unknown = !definitelyNotWritten(error) && dispatched
          && (!(error instanceof PublicProblem) || error.reason === 'unknown' || !error.status || signal.aborted || !valid());
        outcome = result(unknown ? 'unknown' : 'failed');
        if (unknown && this.contexts.get(intent.contextId) === context) this.uncertain.add(key);
      }
      if (this.contexts.get(intent.contextId) === context) {
        this.requests.set(intent.requestId, { identity, result: outcome });
        if (outcome.status === 'changed' || outcome.status === 'conflict') this.contexts.delete(intent.contextId);
      }
      return { outcome, ...(raw ? { raw } : {}) };
    });
  }
  resolve(room: string, id: string): void { this.uncertain.delete(JSON.stringify([room, id])); }
}
