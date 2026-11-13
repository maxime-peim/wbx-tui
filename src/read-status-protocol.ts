import { chatId } from './chat-protocol.js';
import { validAccess, type AccessCredentials } from './auth-protocol.js';
import { peopleId } from './identity-contracts.js';
import { validReactionCommand, validReactionBatch, type ReactionCommand, type ReactionBatch } from './reaction-contracts.js';
import { validReaderTarget, type ReaderTarget } from './message-readers.js';

export interface RoomReadStatus {
  id: string; title: string; type: 'direct' | 'group'; lastActivity: string; lastSeen: string; notifications?:boolean;
}
/** Exact normalized fields, never ID/length-only evidence that a result is unchanged. */
export const sameRoomReadStatus = (a: RoomReadStatus | undefined, b: RoomReadStatus): boolean => !!a && a.id === b.id
  && a.title === b.title && a.type === b.type && a.lastActivity === b.lastActivity && a.lastSeen === b.lastSeen && a.notifications === b.notifications;
/** The registered device owns the internal UUID; public events use PEOPLE IDs. */
export function readStatusSelfId(id:unknown,fallback?:unknown):unknown {
  return typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
    ? Buffer.from(`ciscospark://us/PEOPLE/${id}`).toString('base64') : fallback;
}
/** Only compare canonical public PEOPLE IDs in the same namespace. Unknown ID
 * forms, encodings or regions cannot prove that an actor is another person. */
function publicPerson(value: unknown): { region: string; subject: string } | undefined {
  if (!chatId(value)) return;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')) return;
  const match = /^ciscospark:\/\/([a-z0-9-]{1,32})\/PEOPLE\/([A-Za-z0-9_-]{1,128})$/.exec(bytes.toString('utf8'));
  return match ? { region: match[1]!, subject: match[2]! } : undefined;
}
/** Pinned public memberships.seen identifies the reader as actor AND member.
 * Never use this for membership creation/deletion, room or message events. */
export function irrelevantMembershipSeen(event: unknown, selfId: unknown): boolean {
  if (!object(event) || !object(event.data) || event.resource !== 'memberships' || event.event !== 'seen'
    || event.createdBy !== selfId || !chatId(event.data.roomId) || event.data.personId !== event.actorId) return false;
  const self = publicPerson(selfId), actor = publicPerson(event.actorId);
  return !!self && !!actor && self.region === actor.region && self.subject.toLowerCase() !== actor.subject.toLowerCase();
}
/** Notification evidence only. Never a room read-status observation or receipt authority. */
export interface MessageCreated { id: string; roomId: string; created: string; self: boolean; preview?: string; senderId?: string }
/** Private invalidation evidence only; never sent as a creation or read status. */
export type ReadChange = { kind: 'message-deleted'; roomId: string; id: string } | { kind: 'room-revoked' | 'readers-changed'; roomId: string };
export function validReadChange(value: unknown): value is ReadChange {
  return object(value) && chatId(value.roomId)
    && (value.kind === 'message-deleted' && chatId(value.id) && Object.keys(value).every(key => ['kind', 'roomId', 'id'].includes(key))
      || (value.kind === 'room-revoked' || value.kind === 'readers-changed') && Object.keys(value).every(key => ['kind', 'roomId'].includes(key)));
}
export function parseReadChange(event: unknown, selfId: unknown): ReadChange | undefined {
  const self = publicPerson(selfId);
  if (!object(event) || !object(event.data) || !self || event.createdBy !== selfId || !chatId(event.data.roomId)) return;
  if (event.resource === 'memberships' && event.event === 'seen' && event.data.personId === event.actorId
    && publicPerson(event.actorId)?.region === self.region && chatId(event.data.lastSeenId))
    return { kind: 'readers-changed', roomId: event.data.roomId };
  if (event.event !== 'deleted' || !chatId(event.data.id)) return;
  if (event.resource === 'messages') return { kind: 'message-deleted', roomId: event.data.roomId, id: event.data.id };
  // The actor may be a moderator removing US. Only the public member field,
  // never the actor or an incomplete room list, proves self-membership loss.
  if (event.resource === 'memberships' && event.data.personId === selfId) return { kind: 'room-revoked', roomId: event.data.roomId };
}
export const MESSAGE_EVENT_LIMITS = { batch: 64, retained: 64, seen: 1000, ageMs: 30_000, futureMs: 5000, previewChars: 160, previewInput: 2048 } as const;
export type ReadStatusHealth = 'live' | 'polling' | 'room-unavailable' | 'refresh-unavailable' | 'rate-limited';
const startupPhases = ['sdk-load', 'sdk-ready', 'device-register', 'initial-snapshot'] as const;
const startupProblems = ['failed', 'deadline', 'denied', 'rate-limited', 'service', 'network', 'tls', 'dependency'] as const;
export type ReadStatusStartupPhase = typeof startupPhases[number];
type ReadStatusStartupProblem = typeof startupProblems[number];
export type ReadStatusFailure = 'startup' | 'startup-timeout' | 'heartbeat-timeout' | 'worker-exit' | 'worker-error' | 'invalid-data' | 'sdk-error' | 'receipt'
  | `${ReadStatusStartupPhase}:${ReadStatusStartupProblem}`;
export const validReadStatusHealth = (value: unknown): value is ReadStatusHealth => typeof value === 'string' && ['live', 'polling', 'room-unavailable', 'refresh-unavailable', 'rate-limited'].includes(value);
export function validReadStatusFailure(value: unknown): value is ReadStatusFailure {
  if (typeof value !== 'string') return false;
  if (['startup', 'startup-timeout', 'heartbeat-timeout', 'worker-exit', 'worker-error', 'invalid-data', 'sdk-error', 'receipt'].includes(value)) return true;
  const [phase, problem, extra] = value.split(':');
  return extra === undefined && startupPhases.some(item => item === phase) && startupProblems.some(item => item === problem);
}
export type ReadStatusRequest = { type: 'start'; credentials: AccessCredentials; preview?: boolean; senderNames?: true }
  | ({ type: 'readers'; id: number } & ReaderTarget)
  | { type: 'reaction'; id:number; command:ReactionCommand }
  | { type: 'reactions'; id:number; batch:ReactionBatch; progressive?:true }
  | { type: 'joined-meetings' }
  | { type: 'read'; id: number; roomId: string; messageId: string } | { type: 'stop' };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export class ReadStatusDeadline extends Error {}
/** Map only fixed status/code values. Never expose SDK messages, bodies, URLs or stacks. */
export function readStatusStartupFailure(phase: ReadStatusStartupPhase, error: unknown): ReadStatusFailure {
  let problem: ReadStatusStartupProblem = error instanceof ReadStatusDeadline ? 'deadline' : 'failed';
  if (object(error)) {
    const response = object(error.response) ? error.response : {};
    const status = error.statusCode ?? error.status ?? response.statusCode ?? response.status;
    if ([401, 403, '401', '403'].some(code => code === status)) problem = 'denied';
    else if (status === 429 || status === '429') problem = 'rate-limited';
    else if ([500, 502, 503, 504, '500', '502', '503', '504'].some(code => code === status)) problem = 'service';
    else if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH'].some(code => code === error.code)) problem = 'network';
    else if (['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].some(code => code === error.code)) problem = 'tls';
    else if (['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].some(code => code === error.code)) problem = 'dependency';
  }
  return `${phase}:${problem}`;
}
/** SDK headers may be a Headers instance or a plain object. Never shorten server backoff. */
export function readStatusRetryAt(error: unknown, now: number): number | undefined {
  if (readStatusStartupFailure('initial-snapshot', error) !== 'initial-snapshot:rate-limited' || !object(error)) return;
  const response = object(error.response) ? error.response : {};
  const headers = error.headers ?? response.headers;
  const raw = object(headers) ? typeof headers.get === 'function' ? headers.get('retry-after')
    : headers['retry-after'] ?? headers['Retry-After'] : undefined;
  const header = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : raw;
  const delay = typeof header === 'string' && /^\d+$/.test(header) ? Number(header) * 1000
    : typeof header === 'string' ? Date.parse(header) - now : NaN;
  return delay === Infinity ? Number.MAX_SAFE_INTEGER
    : Math.min(Number.MAX_SAFE_INTEGER, now + Math.max(60_000, Number.isFinite(delay) ? delay : 0));
}
export const timestamp = (value: unknown): string => typeof value === 'string' && value.length <= 128 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const previewUnsafe = /[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;
export function notificationExcerpt(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.slice(0, MESSAGE_EVENT_LIMITS.previewInput).replace(/[\ud800-\udfff]/gu, '').replace(previewUnsafe, ' ').replace(/\s+/gu, ' ').trim();
  return Array.from(text).slice(0, MESSAGE_EVENT_LIMITS.previewChars).join('').trimEnd();
}
export function parseMessageCreated(event: unknown, selfId?: unknown, preview = false, senderNames = false): MessageCreated | undefined {
  if (!object(event) || !object(event.data)) return;
  const data = event.data, created = timestamp(data.created);
  if (!chatId(data.id) || !chatId(data.roomId) || !created) return;
  const excerpt = preview ? notificationExcerpt(data.text) : '';
  return { id: data.id, roomId: data.roomId, created,
    ...(preview && senderNames && peopleId(data.personId) ? { senderId: data.personId } : {}),
    self: chatId(selfId) && (data.personId === selfId || event.actorId === selfId), ...(excerpt ? { preview: excerpt } : {}) };
}
export function validMessageCreated(value: unknown): value is MessageCreated {
  return object(value) && chatId(value.id) && chatId(value.roomId) && typeof value.self === 'boolean'
    && !!timestamp(value.created) && timestamp(value.created) === value.created
    && (value.preview === undefined || typeof value.preview === 'string' && value.preview.length > 0 && value.preview === notificationExcerpt(value.preview))
    && (value.senderId === undefined || peopleId(value.senderId))
    && Object.keys(value).every(key => ['id', 'roomId', 'created', 'self', 'preview', 'senderId'].includes(key));
}
export function parseRoomReadStatus(value: unknown): RoomReadStatus | undefined {
  if (!object(value) || !chatId(value.id) || !['direct', 'group'].includes(String(value.type))) return;
  const lastActivity = timestamp(value.lastActivityDate), lastSeen = timestamp(value.lastSeenActivityDate);
  // The pinned SDK returns lastSeenActivityDate, NOT the lastSeenDate in its prose docs.
  // Missing dates are unknown, never evidence that the space has been read.
  if (!lastActivity || !lastSeen) return;
  return { id: value.id, type: value.type as 'direct' | 'group', lastActivity, lastSeen,
    ...(typeof value.notifications === 'boolean' ? {notifications:value.notifications} : {}),
    title: typeof value.title === 'string' ? value.title.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 80) : '' };
}
export function validRoomReadStatus(value: unknown): value is RoomReadStatus {
  return object(value) && chatId(value.id) && typeof value.title === 'string' && value.title.length <= 80
    && !/[\x00-\x1f\x7f-\x9f]/.test(value.title) && ['direct', 'group'].includes(String(value.type))
    && !!timestamp(value.lastActivity) && timestamp(value.lastActivity) === value.lastActivity
    && !!timestamp(value.lastSeen) && timestamp(value.lastSeen) === value.lastSeen
    && (value.notifications === undefined || typeof value.notifications === 'boolean')
    && Object.keys(value).every(key => ['id', 'title', 'type', 'lastActivity', 'lastSeen', 'notifications'].includes(key));
}
export function validReadStatusRequest(value: unknown): value is ReadStatusRequest {
  if (!object(value)) return false;
  if (value.type === 'start') return Object.keys(value).every(key => ['type', 'credentials', 'preview', 'senderNames'].includes(key)) && validAccess(value.credentials)
    && (value.preview === undefined || typeof value.preview === 'boolean') && (value.senderNames === undefined || value.senderNames === true && value.preview === true);
  if (value.type === 'stop') return Object.keys(value).length === 1;
  if (value.type === 'joined-meetings') return Object.keys(value).length === 1;
  if (value.type === 'readers') return Object.keys(value).length === 4 && Number.isSafeInteger(value.id) && (value.id as number) > 0
    && validReaderTarget({ roomId: value.roomId, messageId: value.messageId });
  if (value.type === 'reaction') return Object.keys(value).length === 3 && typeof value.id === 'number'
    && Number.isSafeInteger(value.id) && value.id > 0 && validReactionCommand(value.command);
  if (value.type === 'reactions') return Object.keys(value).every(key=>['type','id','batch','progressive'].includes(key)) && typeof value.id === 'number'
    && Number.isSafeInteger(value.id) && value.id > 0 && validReactionBatch(value.batch)
    && (value.progressive === undefined || value.progressive === true);
  return value.type === 'read' && Object.keys(value).length === 4 && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0
    && chatId(value.roomId) && chatId(value.messageId);
}
