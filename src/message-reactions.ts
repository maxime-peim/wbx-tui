import { randomBytes } from 'node:crypto';
import { reactionLabel, reactionName, REACTION_LIMITS, ReactionReadError, validReactionBatch, reactionBatchMatches, validReactionSnapshot, validReactionDetails, validReactionWrite, type Reaction, type ReactionAction, type ReactionBatch, type ReactionBatchResult,
  type ReactionCommand, type ReactionContext, type ReactionOutcome, type ReactionSnapshot, type ReactionProgress } from './reaction-contracts.js';
export class ReactionInspectionRequired extends Error {}

/** Exact loaded-target controller. Only unresolved writes require inspection;
 * no persistent authority, startup replay or fresh-session absence inference. */
export class MessageReactions {
  private contexts = new Map<string,{ value:ReactionContext; valid:()=>boolean; snapshot:ReactionSnapshot; own?:string }>();
  private unknown = new Map<string,string>();
  private outcomes = new Map<string,{ context:string; result:ReactionOutcome }>();
  private active: 'summary'|'write'|undefined;
  private epoch = 0;
  constructor(private provider:(command:ReactionCommand)=>Promise<unknown>, private now=Date.now,
    private batchProvider?:(batch:ReactionBatch, progress?:ReactionProgress)=>Promise<unknown>) {}
  private key(room:string,message:string) { return JSON.stringify([room,message]); }
  reset():void { this.epoch++; this.contexts.clear(); }
  busy():boolean { return this.active === 'write'; }
  target(contextId:string,requestId:string):{ roomId:string; messageId:string } | undefined {
    const previous = this.outcomes.get(requestId);
    const value = previous ? previous.context === contextId ? previous.result : undefined : this.contexts.get(contextId)?.value;
    return value && { roomId:value.roomId,messageId:value.messageId };
  }
  discard(contextId:string):void { this.contexts.delete(contextId); }
  private async run<T>(kind:'summary'|'write',work:()=>Promise<T>):Promise<T> {
    if (this.active) throw kind === 'summary' ? new ReactionReadError('worker:busy') : new Error('Reaction operation busy');
    this.active = kind;
    try { return await work(); } finally { this.active = undefined; }
  }
  async summary(room:string,message:string,valid:()=>boolean):Promise<ReactionSnapshot> {
    const epoch = this.epoch;
    return this.run('summary',async () => {
      if (!valid()) throw new ReactionReadError('context:unverified');
      const value = await this.provider({ roomId:room,messageId:message,action:'summary' });
      if (epoch !== this.epoch || !valid()) throw new ReactionReadError('context:unverified');
      if (!validReactionSnapshot(value) || value.roomId !== room || value.messageId !== message) throw new ReactionReadError('summary:unverified');
      return structuredClone(value);
    });
  }
  async details(room:string,message:string,valid:()=>boolean) {
    const epoch = this.epoch;
    return this.run('summary',async()=>{
      if (!valid()) throw new ReactionReadError('context:unverified');
      const value = await this.provider({roomId:room,messageId:message,action:'summary',details:true});
      if (epoch !== this.epoch || !valid()) throw new ReactionReadError('context:unverified');
      if (!validReactionDetails(value) || value.snapshot.roomId !== room || value.snapshot.messageId !== message)
        throw new ReactionReadError('summary:unverified');
      return structuredClone(value);
    });
  }
  async summaries(batch:ReactionBatch,valid:()=>boolean,progress?:ReactionProgress):Promise<ReactionBatchResult> {
    const epoch = this.epoch;
    return this.run('summary',async()=>{
      if (!validReactionBatch(batch) || !valid()) throw new ReactionReadError('context:unverified');
      batch = { roomId:batch.roomId,messageIds:[...batch.messageIds] };
      if (!this.batchProvider) throw new ReactionReadError('worker:unavailable');
      const seen = new Set<string>();
      let invalid = false;
      const value = await this.batchProvider(batch, progress ? snapshot => {
        if (epoch !== this.epoch || !valid()) return;
        if (!validReactionSnapshot(snapshot) || snapshot.roomId !== batch.roomId || !batch.messageIds.includes(snapshot.messageId)
          || snapshot.groups.some(group => group.own !== undefined)) { invalid = true; return; }
        if (seen.has(snapshot.messageId)) return;
        seen.add(snapshot.messageId); progress(structuredClone(snapshot));
      } : undefined);
      if (epoch !== this.epoch || !valid()) throw new ReactionReadError('context:unverified');
      if (invalid || !reactionBatchMatches(value,batch)) throw new ReactionReadError('summary:unverified');
      return structuredClone(value);
    });
  }
  inspect(room:string,message:string,requestId?:string):void {
    const key = this.key(room,message);
    if (this.active || this.unknown.has(key) && this.unknown.get(key) !== requestId) throw new Error('Reaction inspection unavailable');
    for (const [id,c] of this.contexts) if (c.value.roomId === room && c.value.messageId === message) this.contexts.delete(id);
    this.unknown.delete(key);
  }
  async prepare(room:string,message:string,action:ReactionAction,reaction:Reaction,valid:()=>boolean):Promise<ReactionContext> {
    if (!reactionName(reaction)) throw new Error('Invalid reaction');
    const key = this.key(room,message);
    if (this.unknown.has(key)) throw new ReactionInspectionRequired('Inspect this exact message in Webex, then use WebexReactionResolve before writing');
    const epoch = this.epoch, snapshot = await this.summary(room,message,valid);
    for (const [id,c] of this.contexts) if (c.value.expiresAt <= this.now()) this.contexts.delete(id);
    const group = snapshot.groups.find(g => g.reaction === reaction);
    if (epoch !== this.epoch || !valid() || this.unknown.has(key)
      || this.contexts.size >= REACTION_LIMITS.targets || action === 'remove' && !group?.own || action === 'add' && group?.own
      || this.now()-snapshot.observedAt < 0 || this.now()-snapshot.observedAt >= REACTION_LIMITS.freshMs) throw new Error('Fresh own reaction unavailable');
    const value:ReactionContext = { contextId:randomBytes(16).toString('hex'),roomId:room,messageId:message,action,reaction,
      label:reactionLabel(reaction),expiresAt:this.now()+REACTION_LIMITS.freshMs };
    this.contexts.set(value.contextId,{ value,valid,snapshot, ...(action === 'remove' ? { own:group!.own } : {}) });
    return { ...value };
  }
  async submit(contextId:string,requestId:string,valid:()=>boolean,observed?:ReactionProgress):Promise<ReactionOutcome> {
    const previous = this.outcomes.get(requestId);
    if (previous) {
      if (previous.context !== contextId) throw new Error('Conflicting reaction request');
      return { ...previous.result };
    }
    const context = this.contexts.get(contextId), value = context?.value;
    if (!context || !value || !context.valid() || !valid() || value.expiresAt <= this.now() || this.outcomes.size >= REACTION_LIMITS.outcomes
      || this.unknown.has(this.key(value.roomId,value.messageId))) throw new Error('Reaction context unavailable');
    return this.run('write',async () => {
      const key = this.key(value.roomId,value.messageId);
      const result:ReactionOutcome = { contextId,requestId,roomId:value.roomId,messageId:value.messageId,action:value.action,status:'unknown',
        notice:'Reaction UNKNOWN. Inspect the exact message in Webex, then resolve explicitly; nothing was retried.' };
      this.outcomes.set(requestId,{ context:contextId,result }); this.unknown.set(key,requestId);
      try {
        const response = await this.provider({ roomId:value.roomId,messageId:value.messageId,action:value.action,reaction:value.reaction,
          ...(context.own ? { own:context.own } : {}) });
        if (context.valid() && valid() && validReactionWrite(response)) result.status = response.status;
      } catch { /* IPC loss after admission is possible-write uncertainty. */ }
      if (result.status !== 'unknown') this.unknown.delete(key);
      if (result.status === 'changed' && observed) {
        const snapshot = structuredClone(context.snapshot);
        const previous = snapshot.groups.find(group=>group.reaction === value.reaction);
        snapshot.groups = snapshot.groups.filter(group=>group.reaction !== value.reaction);
        if (value.action === 'add') {
          let count = previous?.count;
          if (count !== undefined && !previous?.mine && !previous?.own)
            count = count < Number.MAX_SAFE_INTEGER ? count+1 : undefined;
          snapshot.groups.push({ reaction:value.reaction,label:value.label,mine:true,...(count === undefined ? {} : { count }) });
        }
        else if ((previous?.count ?? 0) > 1) snapshot.groups.push({ reaction:value.reaction,label:value.label });
        // Adjust the last known count only; an ACK cannot freshen other observations.
        snapshot.partial = true; snapshot.unknown = true;
        try { observed(snapshot); } catch { /* Cache failure cannot change a verified write outcome. */ }
      }
      result.notice = result.status === 'changed' ? 'Reaction confirmed. No message was sent.'
        : result.status === 'failed' ? 'Reaction refused/unavailable before confirmation. Nothing was retried.' : result.notice;
      this.contexts.delete(contextId);
      return { ...result };
    });
  }
}
