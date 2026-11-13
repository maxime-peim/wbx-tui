/** Experimental pinned-internal messaging reactions; no SDK objects cross IPC/RPC. */
import { chatId } from './chat-protocol.js';
import { peopleId, validSenderName } from './identity-contracts.js';
export const REACTIONS = Object.freeze({
  thumbsup: 'Thumbs up', heart: 'Heart', celebrate: 'Celebrate', smiley: 'Smile',
  haha: 'Laugh', confused: 'Confused', sad: 'Sad',
});
export type Reaction = string;
export const REACTION_LIMITS = Object.freeze({ targets:64, groups:16, actors:10, names:8, outcomes:256, batch:8, readers:3, requestMs:8000, operationMs:20000, freshMs:30000 });
export type ReactionAction = 'add' | 'remove';
export const REACTION_READ_PHASES = ['admission','context','worker','identity','actor','message','conversation','parent','summary'] as const;
export const REACTION_READ_PROBLEMS = ['busy','unverified','denied','not-found','rate-limited','network','timeout','unavailable'] as const;
export type ReactionReadPhase = typeof REACTION_READ_PHASES[number];
export type ReactionReadFailure = `${ReactionReadPhase}:${typeof REACTION_READ_PROBLEMS[number]}`;
export function validReactionReadFailure(value:unknown):value is ReactionReadFailure {
  if (typeof value !== 'string') return false;
  const [phase,problem,extra] = value.split(':');
  return extra === undefined && REACTION_READ_PHASES.some(v=>v === phase) && REACTION_READ_PROBLEMS.some(v=>v === problem);
}
/** Fixed local reason only; no provider error/body/URL may cross the boundary. */
export class ReactionReadError extends Error {
  constructor(readonly reason:ReactionReadFailure) { super(`Reaction summary unavailable (${reason}).`); }
}
/** mine is display evidence only; own is a separately verified removal handle. */
export interface ReactionGroup { reaction:Reaction; label:string; count?:number; mine?:true; own?:string }
export interface ReactionSnapshot { roomId:string; messageId:string; observedAt:number; partial:boolean; unknown:boolean; groups:ReactionGroup[] }
/** Explicit read only; never automatic progress, persistence or removal authority. */
export interface ReactionActor { reaction:Reaction; personId:string; name?:string }
export interface ReactionDetails { snapshot:ReactionSnapshot; actors:ReactionActor[]; partial:true; activityReadFailure?:ReactionReadFailure }
export type ReactionProgress = (snapshot: ReactionSnapshot) => void;
export interface ReactionBatch { roomId:string; messageIds:string[] }
export interface ReactionBatchResult { roomId:string; items:(ReactionSnapshot | { messageId:string; reason:ReactionReadFailure })[] }
export interface ReactionCommand { roomId:string; messageId:string; action:'summary' | ReactionAction; reaction?:Reaction; own?:string; details?:true }
export interface ReactionWrite { status:'changed' | 'failed' | 'unknown' }
export interface ReactionContext { contextId:string; roomId:string; messageId:string; action:ReactionAction; reaction:Reaction; label:string; expiresAt:number }
export interface ReactionOutcome extends ReactionWrite { contextId:string; requestId:string; roomId:string; messageId:string; action:ReactionAction; notice:string }
export const reactionRecord = (v:unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const emoji = new RegExp('^(?:\\p{RGI_Emoji}|\\p{Emoji})$','v');
export const reactionName = (v:unknown): v is Reaction => typeof v === 'string' && v.length <= 64
  && (Object.hasOwn(REACTIONS,v) || emoji.exec(v)?.[0] === v && !/^[0-9#*\p{Emoji_Modifier}\p{Regional_Indicator}]$/u.test(v));
export const reactionLabel = (reaction:Reaction):string => Object.hasOwn(REACTIONS,reaction)
  ? REACTIONS[reaction as keyof typeof REACTIONS] : reaction;
export const reactionHandle = (v:unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export function validReactionCommand(v:unknown): v is ReactionCommand {
  return reactionRecord(v) && Object.keys(v).every(k => ['roomId','messageId','action','reaction','own','details'].includes(k))
    && chatId(v.roomId) && chatId(v.messageId) && (v.action === 'summary' ? v.reaction === undefined && v.own === undefined
      && (v.details === undefined || v.details === true)
      : (v.action === 'add' || v.action === 'remove') && reactionName(v.reaction) && v.details === undefined
        && (v.action === 'add' ? v.own === undefined : reactionHandle(v.own)));
}
export function validReactionDetails(v:unknown):v is ReactionDetails {
  if (!reactionRecord(v) || !Object.keys(v).every(k=>['snapshot','actors','partial','activityReadFailure'].includes(k))
    || v.activityReadFailure !== undefined && !validReactionReadFailure(v.activityReadFailure)
    || v.partial !== true || !validReactionSnapshot(v.snapshot)
    || v.snapshot.groups.some(g=>g.own !== undefined) || !Array.isArray(v.actors) || v.actors.length > REACTION_LIMITS.actors) return false;
  const groups = v.snapshot.groups;
  return v.actors.every(a=>reactionRecord(a) && Object.keys(a).every(k=>['reaction','personId','name'].includes(k))
    && reactionName(a.reaction) && groups.some(g=>g.reaction === a.reaction) && peopleId(a.personId)
    && (a.name === undefined || validSenderName(a.name)))
    && new Set(v.actors.map(a=>JSON.stringify([a.reaction,a.personId]))).size === v.actors.length;
}
export function validReactionSnapshot(v:unknown): v is ReactionSnapshot {
  return reactionRecord(v) && Object.keys(v).every(k => ['roomId','messageId','observedAt','partial','unknown','groups'].includes(k))
    && chatId(v.roomId) && chatId(v.messageId) && typeof v.observedAt === 'number' && Number.isSafeInteger(v.observedAt) && v.observedAt >= 0
    && typeof v.partial === 'boolean' && typeof v.unknown === 'boolean' && Array.isArray(v.groups) && v.groups.length <= REACTION_LIMITS.groups
    && v.groups.every(g => reactionRecord(g) && Object.keys(g).every(k => ['reaction','label','count','mine','own'].includes(k))
      && reactionName(g.reaction) && g.label === reactionLabel(g.reaction)
       && (g.count === undefined || typeof g.count === 'number' && Number.isSafeInteger(g.count) && g.count >= 0)
       && (g.mine === undefined || g.mine === true)
      && (g.own === undefined || reactionHandle(g.own)))
    && new Set(v.groups.map(g => g.reaction)).size === v.groups.length;
}
export const validReactionWrite = (v:unknown): v is ReactionWrite => reactionRecord(v) && Object.keys(v).length === 1
  && typeof v.status === 'string' && ['changed','failed','unknown'].includes(v.status);
export function validReactionBatch(v:unknown):v is ReactionBatch {
  return reactionRecord(v) && Object.keys(v).length === 2 && chatId(v.roomId) && Array.isArray(v.messageIds)
    && v.messageIds.length > 0 && v.messageIds.length <= REACTION_LIMITS.batch && v.messageIds.every(chatId)
    && new Set(v.messageIds).size === v.messageIds.length;
}
export function validReactionBatchResult(v:unknown):v is ReactionBatchResult {
  return reactionRecord(v) && Object.keys(v).length === 2 && chatId(v.roomId) && Array.isArray(v.items)
    && v.items.length > 0 && v.items.length <= REACTION_LIMITS.batch
    && v.items.every(item=>validReactionSnapshot(item) ? item.roomId === v.roomId
      : reactionRecord(item) && Object.keys(item).length === 2 && chatId(item.messageId) && validReactionReadFailure(item.reason))
    && new Set(v.items.map(item=>item.messageId)).size === v.items.length;
}
export function reactionBatchMatches(v:unknown,target:ReactionBatch):v is ReactionBatchResult {
  return validReactionBatchResult(v) && v.roomId === target.roomId && v.items.length === target.messageIds.length
    && v.items.every((item,index)=>item.messageId === target.messageIds[index]);
}
