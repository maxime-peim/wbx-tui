/** Pinned internal adapter, used ONLY inside the already-authorized messaging
 * metadata worker on explicit reaction requests. No device/register/listen here. */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fenceReaction, ReactionTransportError } from './reaction-transport.js';
import { reactionLabel, REACTION_LIMITS, ReactionReadError, validReactionBatch, reactionName, reactionRecord as object, type Reaction, type ReactionCommand, type ReactionReadPhase, type ReactionReadFailure, type ReactionBatch, type ReactionBatchResult,
  type ReactionSnapshot, type ReactionGroup, type ReactionWrite, type ReactionProgress, type ReactionDetails, type ReactionActor } from './reaction-contracts.js';
import { senderName } from './identity-contracts.js';
const uuid = (v:unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
function actorId(value:unknown):string|undefined {
  if (!object(value) || value.objectType !== 'person') return;
  const id = value.entryUUID ?? value.id;
  return uuid(id) && (value.id === undefined || value.id === id) ? id : undefined;
}
function readFailure(phase:ReactionReadPhase,error:unknown):ReactionReadError {
  if (error instanceof ReactionReadError) return error;
  const value = object(error) ? error : {}, response = object(value.response) ? value.response : {};
  const status = value.statusCode ?? value.status ?? response.statusCode ?? response.status;
  const problem = [401,403,'401','403'].includes(status as number) ? 'denied'
    : [404,'404'].includes(status as number) ? 'not-found' : [429,'429'].includes(status as number) ? 'rate-limited'
    : [408,504,'408','504'].includes(status as number) || value.code === 'ETIMEDOUT' ? 'timeout'
    : ['ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH'].includes(String(value.code)) ? 'network' : 'unavailable';
  return new ReactionReadError(`${phase}:${problem}`);
}

export class SDKReactions {
  private active = false;
  private writing = false;
  private handles = new Map<string,{ room:string; message:string; id:string; reaction:Reaction }>();
  private readonly common:any;
  private readonly transport:any;
  busy():boolean { return this.active; }
  mutating():boolean { return this.active && this.writing; }
  constructor(private sdk:any,private deadlineMs:number = REACTION_LIMITS.operationMs) {
    const require = createRequire(new URL('../optional/read-status-sdk/package.json',import.meta.url));
    for (const name of ['common','webex-core','http-core','internal-plugin-conversation','internal-plugin-encryption'])
      if (require(`@webex/${name}/package.json`).version !== '3.13.0') throw new Error('Unreviewed reaction SDK');
    if (require('request/package.json').version !== '2.88.2') throw new Error('Unreviewed reaction transport');
    this.common = require('@webex/common'); this.transport = require('@webex/http-core/dist/request/request.js').default;
  }
  private identity(id:string,type:'ROOM'|'MESSAGE') {
    const value = this.common.deconstructHydraId(id);
    if (value.type !== type || !uuid(value.id) || typeof value.cluster !== 'string' || !/^[a-z0-9-]{1,32}$/.test(value.cluster)
      || this.common.constructHydraId(type,value.id,value.cluster).replace(/=+$/,'') !== id.replace(/=+$/,'')) throw new ReactionReadError('identity:unverified');
    return value as { id:string; type:string; cluster:string };
  }
  private async target(command:ReactionCommand,check:()=>void,stage:(phase:ReactionReadPhase)=>void,shared?:()=>Promise<unknown>) {
    stage('identity');
    const room = this.identity(command.roomId,'ROOM'), message = this.identity(command.messageId,'MESSAGE');
    if (room.cluster !== message.cluster) throw new ReactionReadError('identity:unverified');
    stage('actor');
    if (!uuid(this.sdk.internal.device.userId)) throw new ReactionReadError('actor:unverified');
    // Only the passive, exact-loaded-target viewport path supplies shared
    // metadata. Its canonical message/room mapping is checked again against
    // the decrypted parent below. Do not duplicate the already-loaded public
    // message GET. Explicit details/preparation/mutations retain that lookup.
    if (!shared) {
      stage('message');
      const publicMessage = await this.sdk.messages.get(command.messageId); check();
      if (!object(publicMessage) || publicMessage.id !== command.messageId || publicMessage.roomId !== command.roomId) throw new ReactionReadError('message:unverified');
    }
    stage('conversation');
    const c = this.sdk.internal.conversation;
    const url = c.getConvoUrl({ id:room.id,cluster:room.cluster });
    const conversation = await (shared ? shared() : c.get({ url })); check();
    if (!object(conversation) || conversation.id !== room.id) throw new ReactionReadError('conversation:unverified');
    if (command.action !== 'summary' && (typeof conversation.defaultActivityEncryptionKeyUrl !== 'string'
      || typeof conversation.kmsResourceObjectUrl !== 'string')) throw new Error('Reaction encryption unavailable');
    stage('parent');
    // Match getReactionSummaryByParentId's actual caller contract. A bare parent
    // GET need not contain children, so it cannot discover other people's labels.
    const response = await c.request({ method:'GET',url:`${url}/activities/${message.id}`,
      qs:{ activityType:'reactionSummary',includeChildren:true } }); check();
    const parent = response.body;
    if (!object(parent) || parent.id !== message.id || !object(parent.target) || parent.target.id !== room.id
      || typeof parent.encryptionKeyUrl !== 'string' || !['post','share'].includes(String(parent.verb))) throw new ReactionReadError('parent:unverified');
    return { c,url,conversation:{ ...conversation,url },parent,room:room.id,cluster:room.cluster,message:message.id,self:this.sdk.internal.device.userId as string };
  }
  private ownActivity(value:any,t:{ room:string; message:string; self:string }): value is { id:string; object:{ displayName:Reaction } } {
    return object(value) && uuid(value.id) && value.id !== t.message && value.objectType === 'activity' && value.verb === 'add'
      && actorId(value.actor) === t.self
      && object(value.target) && value.target.objectType === 'conversation' && value.target.id === t.room
      && object(value.parent) && value.parent.type === 'reaction' && value.parent.id === t.message
      && object(value.object) && value.object.objectType === 'reaction2' && reactionName(value.object.displayName);
  }
  private async freshOwn(t:Awaited<ReturnType<SDKReactions['target']>>,id:string,check:()=>void) {
    const response = await t.c.request({method:'GET',url:`${t.url}/activities/${id}`}); check();
    return this.ownActivity(response.body,t) && response.body.id === id ? response.body : undefined;
  }
  private async snapshot(command:ReactionCommand,t:Awaited<ReturnType<SDKReactions['target']>>,check:()=>void,mode:'explicit'|'passive',actors?:ReactionActor[],
    failure?:{reason?:ReactionReadFailure}):Promise<ReactionSnapshot> {
    const groups = new Map<Reaction,ReactionGroup>(), hydrated = new Set<Reaction>(); let unknown = false, selfSummary = false;
    // Only an aggregate's explicit safe count is a total; self-summary counts,
    // repeated labels and absent fields must never manufacture a total.
    if (Array.isArray(t.parent.children)) for (const child of t.parent.children.slice(0,64)) {
      if (!object(child) || !['reactionSummary','reactionSelfSummary'].includes(String(child.type))) continue;
      // SDK decryptActivity explicitly traverses child.activity, not child.object.
      const activity = child.activity;
      if (!object(activity) || activity.objectType !== 'activity'
        || activity.parent !== undefined && (!object(activity.parent) || activity.parent.id !== t.message)
        || activity.target !== undefined && (!object(activity.target) || activity.target.id !== t.room)) { unknown = true; continue; }
      const value = activity.object;
      if (!object(value) || String(value.objectType).toLowerCase() !== (child.type === 'reactionSummary' ? 'reaction2summary' : 'reaction2selfsummary')
         || !Array.isArray(value.reactions) || value.reactions.length > 64) { unknown = true; continue; }
      if (child.type === 'reactionSelfSummary' && activity.actor !== undefined
        && (!object(activity.actor) || actorId({ ...activity.actor,objectType:activity.actor.objectType ?? 'person' }) !== t.self)) { unknown = true; continue; }
      if (child.type === 'reactionSelfSummary') selfSummary = true;
      for (const row of value.reactions) {
        if (object(row) && reactionName(row.displayName)) {
          if (child.type === 'reactionSummary' && row.count !== undefined
            && !(typeof row.count === 'number' && Number.isSafeInteger(row.count) && row.count >= 0)) unknown = true;
          const previous = groups.get(row.displayName);
          groups.set(row.displayName,{ ...previous, reaction:row.displayName,label:reactionLabel(row.displayName),
            ...(child.type === 'reactionSummary' && typeof row.count === 'number' && Number.isSafeInteger(row.count) && row.count >= 0 ? { count:row.count } : {}),
            ...(child.type === 'reactionSelfSummary' ? { mine:true as const } : {}) });
        }
        else unknown = true;
      }
    } else unknown = true;
    if (mode === 'explicit' || !selfSummary) try {
      // The service caps child pages at 10, independently of the 64-target cache.
      const page = await t.c.listChildActivitiesByParentId(t.url,t.message,'reaction',{ limit:REACTION_LIMITS.actors }); check();
      if (!object(page.body) || !Array.isArray(page.body.items) || page.body.items.length > REACTION_LIMITS.actors) throw new ReactionReadError('summary:unverified');
      for (let value of page.body.items) {
        if (actors || mode === 'passive') {
          // The exact parent collection binds omitted fields; contradictory fields never do.
          if (!object(value) || !uuid(value.id) || value.id === t.message || value.objectType !== 'activity' || value.verb !== 'add'
            || !actorId(value.actor)
            || value.target !== undefined && (!object(value.target) || value.target.objectType !== 'conversation' || value.target.id !== t.room)
            || value.parent !== undefined && (!object(value.parent) || value.parent.type !== 'reaction' || value.parent.id !== t.message)
            || !object(value.object) || value.object.objectType !== 'reaction2' || !reactionName(value.object.displayName)) { unknown = true; continue; }
          const reaction = value.object.displayName;
          if (actorId(value.actor) === t.self) groups.set(reaction,{ ...groups.get(reaction),reaction,label:reactionLabel(reaction),mine:true });
          if (actors) {
            const personId = this.common.constructHydraId('PEOPLE',actorId(value.actor),t.cluster);
            const name = senderName((value.actor as Record<string,unknown>).displayName);
            if (!actors.some(a=>a.reaction === reaction && a.personId === personId))
              actors.push({ reaction,personId,...(name ? {name} : {}) });
          }
          if (!groups.has(reaction)) groups.set(reaction,{ reaction,label:reactionLabel(reaction) });
          continue; // Display actors cannot mint or weaken own-removal handles.
        }
        if (!this.ownActivity(value,t) && object(value) && object(value.actor)
          && this.ownActivity({...value,target:value.target ?? {id:t.room,objectType:'conversation'},
            parent:value.parent ?? {id:t.message,type:'reaction'}},t)) {
          // Collection-bound partial rows only select an exact GET, never grant removal.
          const reaction = (value.object as {displayName:Reaction}).displayName;
          if (hydrated.has(reaction)) continue;
          hydrated.add(reaction);
          value = await this.freshOwn(t,value.id as string,check);
          if (!value) { unknown = true; continue; }
        }
        if (!this.ownActivity(value,t)) continue;
        let handle = [...this.handles].find(([,h]) => h.room === command.roomId && h.message === command.messageId && h.id === value.id)?.[0];
        if (!handle) {
          if (this.handles.size >= REACTION_LIMITS.targets) continue;
          handle = randomBytes(16).toString('hex');
          this.handles.set(handle,{ room:command.roomId,message:command.messageId,id:value.id,reaction:value.object.displayName });
        }
        const reaction = value.object.displayName;
        groups.set(reaction,{ ...groups.get(reaction),reaction,label:reactionLabel(reaction),mine:true,own:handle });
      }
    } catch (error) {
      check(); // A deadline is not a successfully completed partial observation.
      if (failure) failure.reason = readFailure('summary',error).reason;
      unknown = true; // Own-activity failure cannot erase verified aggregate labels.
    }
    const disclosed = [...groups.values()];
    if (disclosed.length > REACTION_LIMITS.groups) {
      unknown = true;
      disclosed.sort((a,b)=>Number(!!b.own)-Number(!!a.own));
      disclosed.length = REACTION_LIMITS.groups;
    }
    if (actors) actors.splice(0,actors.length,...actors.filter(a=>disclosed.some(g=>g.reaction===a.reaction)));
    return { roomId:command.roomId,messageId:command.messageId,observedAt:Date.now(),partial:true,unknown,groups:disclosed };
  }
  /** One bounded viewport operation, existing SDK only. At most three read
   * chains; share conversation metadata. Missing self summaries use one bounded
   * display-only activity page, never removal handles or automatic pagination.
   * No bulk service endpoint, write, additional SDK/device or history scan. */
  async summaries(batch:ReactionBatch, progress?:ReactionProgress):Promise<ReactionBatchResult> {
    if (!validReactionBatch(batch)) throw new ReactionReadError('admission:unverified');
    batch = { roomId:batch.roomId,messageIds:[...batch.messageIds] };
    if (this.active) throw new ReactionReadError('worker:busy');
    this.active = true; this.writing = false;
    const abort = new AbortController();
    const check = () => { if (abort.signal.aborted) throw new ReactionReadError('summary:timeout'); };
    let next = 0, conversation:Promise<unknown>|undefined, timer:ReturnType<typeof setTimeout>;
    const items:ReactionBatchResult['items'] = new Array(batch.messageIds.length);
    // Publish detached normalized observations only. Late physical completions
    // may update private work slots, never an already-returned viewport result.
    const result = ():ReactionBatchResult => ({ roomId:batch.roomId,items:batch.messageIds.map((messageId,index)=>
      structuredClone(items[index] ?? { messageId,reason:'summary:timeout' as const })) });
    const reader = async () => {
      while (!abort.signal.aborted) {
        const index = next++;
        if (index >= batch.messageIds.length) return;
        const messageId = batch.messageIds[index]!;
        let phase:ReactionReadPhase = 'identity';
        try {
          check();
          const command:ReactionCommand = { roomId:batch.roomId,messageId,action:'summary' };
          const t = await this.target(command,check,value=>{ phase=value; },()=>conversation ??= this.sdk.internal.conversation.get({
            url:this.sdk.internal.conversation.getConvoUrl({ ...this.identity(batch.roomId,'ROOM') }),
          }));
          phase = 'summary';
          const snapshot = await this.snapshot(command,t,check,'passive');
          check(); items[index] = snapshot;
          progress?.(structuredClone(snapshot));
        } catch (error) { items[index] = { messageId,reason:readFailure(phase,error).reason }; }
      }
    };
    const work = Promise.all(Array.from({ length:Math.min(REACTION_LIMITS.readers,batch.messageIds.length) },reader))
      .then(result);
    // A logical timeout must not free any unfinished physical read chain.
    void work.finally(()=>{ this.active=false; clearTimeout(timer); }).catch(()=>{});
    const expired = new Promise<ReactionBatchResult>(resolve=>{
      timer=setTimeout(()=>{ abort.abort(); resolve(result()); },this.deadlineMs);
    });
    return Promise.race([work,expired]);
  }
  async perform(command:ReactionCommand):Promise<ReactionSnapshot|ReactionWrite|ReactionDetails> {
    if (this.active) throw new ReactionReadError('worker:busy');
    this.active = true;
    this.writing = command.action !== 'summary';
    const abort = new AbortController(); let attempted = false, timer:ReturnType<typeof setTimeout>, phase:ReactionReadPhase = 'worker';
    const check = () => { if (abort.signal.aborted) throw new Error('Reaction deadline'); };
    const work = (async () => {
      let fence:ReturnType<typeof fenceReaction>|undefined;
      try {
        const t = await this.target(command,check,value=>{ phase = value; });
        if (command.action === 'summary') {
          phase = 'summary';
          const actors:ReactionActor[]|undefined = command.details ? [] : undefined;
          const failure:{reason?:ReactionReadFailure} = {};
          const snapshot = await this.snapshot(command,t,check,'explicit',actors,failure);
          return actors ? {snapshot,actors,partial:true as const,...(failure.reason ? {activityReadFailure:failure.reason} : {})} : snapshot;
        }
        if (!command.reaction) throw new Error('Missing reaction');
        let own:string|undefined;
        if (command.action === 'remove') {
          const bound = this.handles.get(command.own!);
          if (!bound || bound.room !== command.roomId || bound.message !== command.messageId || bound.reaction !== command.reaction) throw new Error('Own reaction unavailable');
          const activity = await this.freshOwn(t,bound.id,check);
          if (!activity || activity.object.displayName !== command.reaction) throw new Error('Own reaction no longer verified');
          own = bound.id;
        }
        check();
        fence = fenceReaction(t.c,this.transport,{ endpoint:`${t.url}/activities`,room:t.room,actor:t.self,parent:t.message,
          action:command.action,reaction:command.reaction,...(own ? { own } : {}) },abort.signal);
        const result = command.action === 'add' ? await t.c.addReaction(t.conversation,command.reaction,t.parent)
          : await t.c.deleteReaction(t.conversation,own);
        check();
        const common = object(result) && uuid(result.id) && result.objectType === 'activity'
          && actorId(result.actor) === t.self
          && object(result.target) && result.target.objectType === 'conversation' && result.target.id === t.room;
        const confirmed = common && (command.action === 'add' ? this.ownActivity(result,t) && result.object.displayName === command.reaction
          : result.verb === 'delete' && object(result.object) && result.object.id === own && result.object.verb === 'tombstone'
            && object(result.object.parent) && result.object.parent.type === 'reaction' && result.object.parent.id === t.message);
        if (!confirmed) return { status:'unknown' as const };
        if (command.own) this.handles.delete(command.own);
        return { status:'changed' as const };
      } catch (error) {
        attempted = fence?.attempted() ?? false;
        if (command.action === 'summary') throw readFailure(phase,error);
        return { status:attempted && !(error instanceof ReactionTransportError && error.refused) ? 'unknown' as const : 'failed' as const };
      } finally { fence?.restore(); }
    })();
    // Retain physical admission after the logical deadline, including stalled
    // preparation. The aborted fence prevents any later mutation submission.
    void work.finally(() => { this.active = false; clearTimeout(timer); }).catch(()=>{});
    const expired = new Promise<ReactionWrite>((resolve,reject) => {
      timer = setTimeout(() => { abort.abort(); command.action === 'summary' ? reject(new ReactionReadError(`${phase}:timeout` as ReactionReadFailure))
        : resolve({ status:'unknown' }); },this.deadlineMs);
    });
    return Promise.race([work,expired]);
  }
}
