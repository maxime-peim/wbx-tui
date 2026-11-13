import { StringDecoder } from 'node:string_decoder';
import { chatId } from './chat-protocol.js';
import { validAttachmentOptions, type AttachmentResolveOptions } from './attachment-policy.js';
import { transferIdentity, transferInteger, type AttachmentPull, type AttachmentComplete } from './attachment-transfer-contracts.js';
import { validSectionEdit, validLocalDrafts, type SectionEdit, type LocalDraft } from './local-context-contracts.js';
import { uploadId, uploadPath, validUploadBinding, validSnapshotBinding, snapshotBinding, uploadDraftId, validUploadSendOptions, type UploadBinding, type SnapshotBinding, type UploadSendOptions } from './upload-contracts.js';
import { contextId, actionRequestId, validRichText, personChoice, safeSpaceTitle, safeSpaceDescription, validDirectOptions,
  type MutationIntent, type MessageAction, type DirectOptions } from './action-contracts.js';
import type { MentionConsent } from './rich-messages.js';
import { nativePaneIntent, type NativePaneIntent } from './native-panes.js';
import { validDirectoryQuery, peopleId } from './identity-contracts.js';
import { reactionName, validReactionBatch, type Reaction, type ReactionAction, type ReactionBatch } from './reaction-contracts.js';

export const EDITOR_PROTOCOL_VERSION = 1;
export const MAX_EDITOR_REQUEST = 32_768;
export const MAX_EDITOR_EVENT = 8_388_608;
export interface EditorRequest { jsonrpc: '2.0'; id: number; method: string; params?: Record<string, unknown> }
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseEditorRequest(line: string): EditorRequest {
  if (Buffer.byteLength(line) > MAX_EDITOR_REQUEST) throw new Error('Oversized editor request.');
  const v: unknown = JSON.parse(line);
  if (!record(v) || v.jsonrpc !== '2.0' || typeof v.id !== 'number' || !Number.isSafeInteger(v.id) || v.id < 1 || v.id > 0x7fffffff
    || typeof v.method !== 'string' || !/^[a-z][a-zA-Z.]{1,63}$/.test(v.method)
    || v.params !== undefined && !record(v.params) || Object.keys(v).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key))) throw new Error('Invalid editor request.');
  return v as unknown as EditorRequest;
}

export class EditorProtocolError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}
type SessionMode = 'demo' | 'live';
type MeetingDisplay = 'auto' | 'kitty' | 'editor';
type MeetingFallback = 'editor' | 'error';
const meetingActions = ['microphone.toggle', 'video.toggle', 'screen.toggle', 'audio.toggle', 'camera.toggle', 'auth.refresh', 'quit'] as const;
export type EditorOperation =
  | { method: 'hello'; params: { version: typeof EDITOR_PROTOCOL_VERSION } }
  | { method: 'session.start'; params: { mode: SessionMode; config?: string; readStatus: boolean; peopleStatus: boolean; upcomingMeetings: boolean; spacesCache: boolean; notificationPreview?: true; senderNames?: true } }
  | { method: 'session.stop' | 'state.get' | 'auth.refresh' | 'delivery.resolve' | 'meeting.leave' | 'people.lookup' | 'meetings.upcoming' | 'spaces.cacheClear'; params: Record<string, never> }
  | { method: 'meeting.joinUpcoming'; params: { meetingId: string; revision: number; display: MeetingDisplay; fallback: MeetingFallback } }
  | { method: 'rooms.list'; params: { more: boolean } }
  | { method: 'rooms.select'; params: { roomId: string; reload?: boolean } }
  | { method: 'rooms.read'; params: { roomId: string; messageId: string } }
  | { method: 'sections.edit'; params: { revision: number; edit: SectionEdit } }
  | { method: 'sections.preferences'; params: { revision: number; action: 'load' | 'save' | 'clear' } }
  | { method: 'uploads.stage'; params: SnapshotBinding & { path: string } }
  | { method: 'uploads.remove'; params: SnapshotBinding & { attachmentId: string } }
  | { method: 'uploads.cancel'; params: { draftId: string; phase?: 'stage' | 'send' } }
  | { method: 'uploads.send'; params: UploadBinding & UploadSendOptions & { attachmentId: string; requestId: string; text: string } }
  | { method: 'messages.actionPrepare'; params: { roomId: string; messageId: string; action: MessageAction } }
  | { method: 'messages.actionSubmit'; params: MutationIntent }
  | { method: 'messages.actionResolve'; params: { roomId: string; messageId: string } }
  | { method: 'messages.actionDiscard'; params: { contextId: string } }
  | { method: 'messages.reactions'; params: { roomId:string; messageId:string; internalConsent:true; selfSummary?:true; details?:true } }
  | { method: 'messages.readBy'; params: { roomId: string; messageId: string; watch?: true } }
  | { method: 'messages.reactionsBatch'; params: ReactionBatch & { internalConsent:true; selfSummary?:true; progressive?:true } }
  | { method: 'messages.reactionPrepare'; params: { roomId:string; messageId:string; action:ReactionAction; reaction:Reaction; internalConsent:true } }
  | { method: 'messages.reactionSubmit'; params: { roomId:string; messageId:string; contextId:string; requestId:string; confirmed:true; internalConsent:true } }
  | { method: 'messages.reactionResolve'; params: { roomId:string; messageId:string; requestId?:string; checked:true; internalConsent:true } }
  | { method: 'messages.reactionDiscard'; params: { contextId:string } }
  | { method: 'messages.sendRich'; params: UploadBinding & MentionConsent & { requestId: string; text: string } }
  | { method: 'members.list'; params: { more: boolean } }
  | { method: 'members.visibility'; params: { roomId: string } }
  | { method: 'direct.prepare'; params: { person: string } }
  | { method: 'direct.send'; params: DirectOptions & { targetId: string; draftId: string; requestId: string; text: string; confirmed: true } }
  | { method: 'direct.resolve' | 'direct.discard'; params: { targetId: string } }
  | { method: 'rooms.create'; params: { requestId: string; title: string; confirmed: true } }
  | { method: 'rooms.rename'; params: { requestId: string; roomId: string; expectedTitle: string; title: string; confirmed: true } }
  | { method: 'rooms.descriptionPrepare'; params: { roomId: string } }
  | { method: 'rooms.describe'; params: { requestId: string; roomId: string; expectedTitle: string; expectedDescription: string; description: string; confirmed: true } }
  | { method: 'rooms.descriptionClear'; params: { requestId: string; roomId: string; expectedTitle: string; expectedDescription: string; confirmed: true } }
  | { method: 'rooms.lock'; params: { requestId: string; roomId: string; expectedTitle: string; expectedLocked: boolean; locked: boolean; confirmed: true } }
  | { method: 'rooms.announcement'; params: { requestId: string; roomId: string; expectedTitle: string; expectedAnnouncementOnly: boolean; announcementOnly: boolean; confirmed: true } }
  | { method: 'members.action'; params: { requestId: string; roomId: string; action: 'invite' | 'remove' | 'leave'; target?: string; confirmed: true } }
  | { method: 'conversations.resolve'; params: { action: 'create' | 'invite' | 'remove' | 'leave' | 'rename' | 'describe' | 'lock' | 'announcement' | 'description-clear'; roomId?: string; requestId?: string; checked: true } }
  | { method: 'conversations.resolve'; params: { action: 'team-rename' | 'team-describe'; teamId: string; requestId: string; checked: true } }
  | { method: 'teams.list'; params: { more: boolean } }
  | { method: 'teams.joined'; params: { more: boolean; revision?: number } }
  | { method: 'teams.renamePrepare'; params: { teamId: string; revision: number } }
  | { method: 'teams.rename'; params: { requestId: string; teamId: string; revision: number; expectedName: string; name: string; confirmed: true } }
  | { method: 'teams.descriptionPrepare'; params: { teamId: string; revision: number } }
  | { method: 'teams.describe'; params: { requestId: string; teamId: string; revision: number; expectedName: string; expectedDescription: string; description: string; confirmed: true } }
  | { method: 'people.search'; params: { query: string; more: boolean; revision?: number } }
  | { method: 'people.profile'; params: { personId: string } }
  | { method: 'people.spaces'; params: { roomIds: string[] } }
  | { method: 'people.viewport'; params: { roomIds: string[] } }
  | { method: 'drafts.open'; params: Record<string, never> }
  | { method: 'drafts.save'; params: { profile: string; revision: string; items: LocalDraft[] } }
  | { method: 'messages.thread'; params: { roomId: string; messageId: string; more: boolean; revision?: number } }
  | { method: 'messages.mentions'; params: { roomId: string; more: boolean; revision?: number } }
  | { method: 'messages.images'; params: { roomId: string; messageId: string } }
  | { method: 'messages.attachmentMetadata'; params: { roomId: string; messageId: string } }
  | { method: 'messages.imageOpen'; params: { roomId: string; messageId: string; imageId: string } }
  | { method: 'messages.attachmentOpen'; params: { roomId: string; messageId: string; attachmentId: string } }
  | { method: 'messages.attachmentResolve'; params: { roomId: string; messageId: string; attachmentId: string; transfer?: 'chunks-v1' } & AttachmentResolveOptions }
  | { method: 'messages.attachmentChunk'; params: AttachmentPull }
  | { method: 'messages.attachmentComplete'; params: AttachmentComplete }
  | { method: 'messages.attachmentCancel'; params: { requestId: number } }
  | { method: 'messages.list'; params: { older: boolean } }
  | { method: 'messages.send'; params: { roomId: string; text: string; requestId: string; parentId?: string } }
  | { method: 'meeting.start'; params: { mode: SessionMode; meeting?: string; config?: string; display: MeetingDisplay; fallback: MeetingFallback; headless: boolean; callId?: string } }
  | { method: 'meeting.present'; params: { display: Exclude<MeetingDisplay, 'auto'>; fallback: MeetingFallback } }
  | { method: 'meeting.control'; params: { action: typeof meetingActions[number] } }
  | { method: 'meeting.pane'; params: { session: string; intent: NativePaneIntent } }
  | { method: 'meeting.reconnect'; params: { session: string } }
  | { method: 'delivery.resolveBound'; params: { roomId: string } }
  | { method: 'shutdown'; params: { leaveMeeting: boolean } };

function only(params: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(params).some(key => !keys.includes(key))) throw new EditorProtocolError(-32602, 'Unknown parameter; credentials never belong in editor RPC.');
}
function text(value: unknown, max = 4096): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value); }
function oneOf<T extends string>(value: unknown, choices: readonly T[]): value is T { return typeof value === 'string' && choices.some(choice => choice === value); }

/** Parse parameters after handshake/replay admission, without coercion or side effects. */
export function parseEditorOperation(request: EditorRequest): EditorOperation {
  const p = request.params ?? {};
  switch (request.method) {
    case 'hello':
      only(p, ['version']);
      if (p.version !== EDITOR_PROTOCOL_VERSION) throw new EditorProtocolError(-32001, 'Unsupported editor protocol version.');
      return { method: request.method, params: { version: p.version } };
    case 'session.start':
      only(p, ['mode', 'config', 'readStatus', 'peopleStatus', 'upcomingMeetings', 'spacesCache', 'notificationPreview', 'senderNames']);
      if (!oneOf(p.mode, ['demo', 'live']) || p.config !== undefined && !text(p.config) || p.readStatus !== undefined && typeof p.readStatus !== 'boolean'
        || p.peopleStatus !== undefined && typeof p.peopleStatus !== 'boolean'
        || p.upcomingMeetings !== undefined && typeof p.upcomingMeetings !== 'boolean'
        || p.spacesCache !== undefined && typeof p.spacesCache !== 'boolean'
        || p.notificationPreview !== undefined && typeof p.notificationPreview !== 'boolean'
        || p.senderNames !== undefined && typeof p.senderNames !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid session mode/configuration.');
      return { method: request.method, params: { mode: p.mode, config: p.config, readStatus: p.readStatus === true, peopleStatus: p.peopleStatus === true, upcomingMeetings: p.upcomingMeetings === true, spacesCache: p.spacesCache === true,
        ...(p.notificationPreview === true ? { notificationPreview: true as const } : {}), ...(p.senderNames === true ? { senderNames: true as const } : {}) } };
    case 'session.stop': case 'state.get': case 'auth.refresh': case 'delivery.resolve': case 'meeting.leave': case 'people.lookup': case 'meetings.upcoming': case 'spaces.cacheClear':
      only(p, []); return { method: request.method, params: {} };
    case 'drafts.open':
      only(p, []); return { method: request.method, params: {} };
    case 'messages.reactionsBatch': {
      only(p,['roomId','messageIds','internalConsent','selfSummary','progressive']);
      const batch = { roomId:p.roomId,messageIds:p.messageIds };
      if (p.internalConsent !== true || !validReactionBatch(batch) || p.selfSummary !== undefined && p.selfSummary !== true
        || p.progressive !== undefined && p.progressive !== true) throw new EditorProtocolError(-32602,'Choose at most eight distinct loaded messages and explicitly consent to internal reaction reads.');
      return { method:request.method,params:{ ...batch,internalConsent:true,...(p.selfSummary ? {selfSummary:true as const} : {}),
        ...(p.progressive ? {progressive:true as const} : {}) } };
    }
    case 'messages.reactionDiscard':
      only(p,['contextId']);
      if (!contextId(p.contextId)) throw new EditorProtocolError(-32602,'Invalid reaction context.');
      return { method:request.method,params:{ contextId:p.contextId } };
    case 'messages.readBy':
      only(p, ['roomId', 'messageId', 'watch']);
      if (!chatId(p.roomId) || !chatId(p.messageId) || p.watch !== undefined && p.watch !== true)
        throw new EditorProtocolError(-32602, 'Choose one exact loaded message.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId, ...(p.watch ? { watch: true } : {}) } };
    case 'messages.reactions': case 'messages.reactionPrepare': case 'messages.reactionSubmit': case 'messages.reactionResolve': {
      only(p,['roomId','messageId','internalConsent',...(request.method === 'messages.reactionPrepare' ? ['action','reaction']
        : request.method === 'messages.reactionSubmit' ? ['contextId','requestId','confirmed']
        : request.method === 'messages.reactionResolve' ? ['requestId','checked'] : ['selfSummary','details'])]);
      if (!chatId(p.roomId) || !chatId(p.messageId) || p.internalConsent !== true) throw new EditorProtocolError(-32602,'Choose an exact loaded message and explicitly consent to pinned internal reaction interfaces.');
      const target = { roomId:p.roomId,messageId:p.messageId,internalConsent:true as const };
      if (request.method === 'messages.reactions') {
        if (p.selfSummary !== undefined && p.selfSummary !== true || p.details !== undefined && p.details !== true)
          throw new EditorProtocolError(-32602,'Invalid reaction presentation request.');
        return { method:request.method,params:{...target,...(p.selfSummary ? {selfSummary:true as const} : {}),...(p.details ? {details:true as const} : {})} };
      }
      if (request.method === 'messages.reactionPrepare') {
        if (!oneOf(p.action,['add','remove']) || !reactionName(p.reaction)) throw new EditorProtocolError(-32602,'Choose one explicit legacy reaction action.');
        return { method:request.method,params:{ ...target,action:p.action,reaction:p.reaction } };
      }
      if (request.method === 'messages.reactionSubmit') {
        if (!contextId(p.contextId) || !actionRequestId(p.requestId) || p.confirmed !== true) throw new EditorProtocolError(-32602,'Confirm the frozen reaction preparation.');
        return { method:request.method,params:{ ...target,contextId:p.contextId,requestId:p.requestId,confirmed:true } };
      }
      if (p.checked !== true || p.requestId !== undefined && !actionRequestId(p.requestId)) throw new EditorProtocolError(-32602,'Inspect the exact message in Webex before resolving.');
      return { method:request.method,params:{ ...target,checked:true,...(p.requestId ? { requestId:p.requestId as string } : {}) } };
    }
    case 'drafts.save':
      only(p, ['profile', 'revision', 'items']);
      if (typeof p.profile !== 'string' || !/^[a-f0-9]{64}$/.test(p.profile)
        || typeof p.revision !== 'string' || !/^[a-f0-9]{64}$/.test(p.revision) || !validLocalDrafts(p.items)) throw new EditorProtocolError(-32602, 'Invalid private draft document.');
      return { method: request.method, params: { profile: p.profile, revision: p.revision, items: p.items.map(item => ({ ...item })) } };
    case 'rooms.list':
      only(p, ['more']);
      if (p.more !== undefined && typeof p.more !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid pagination flag.');
      return { method: request.method, params: { more: p.more === true } };
    case 'uploads.stage': case 'uploads.remove': case 'uploads.send': {
      only(p, ['roomId', 'parentId', 'targetId', 'draftId', ...(request.method === 'uploads.stage' ? ['path'] : ['attachmentId']),
        ...(request.method === 'uploads.send' ? ['requestId', 'text', 'format', 'mentionsAccepted', 'allAccepted'] : [])]);
      if (!validSnapshotBinding(p)) throw new EditorProtocolError(-32602, 'Invalid exclusive upload destination/draft.');
      const binding = snapshotBinding(p);
      if (request.method === 'uploads.stage') {
        if (!uploadPath(p.path)) throw new EditorProtocolError(-32602, 'Choose one explicit absolute local file path.');
        return { method: request.method, params: { ...binding, path: p.path } };
      }
      if (!uploadId(p.attachmentId)) throw new EditorProtocolError(-32602, 'Invalid staged attachment handle.');
      if (request.method === 'uploads.remove') return { method: request.method, params: { ...binding, attachmentId: p.attachmentId } };
      if (!validUploadBinding(binding)) throw new EditorProtocolError(-32602, 'Recipient files send only via direct.send.');
      if (!text(p.requestId, 64) || !/^[A-Za-z0-9_-]{1,64}$/.test(p.requestId) || typeof p.text !== 'string' || p.text.length > 1000) throw new EditorProtocolError(-32602, 'Invalid explicit file send.');
      const options = Object.fromEntries(['format', 'mentionsAccepted', 'allAccepted'].filter(key => p[key] !== undefined).map(key => [key, p[key]])) as UploadSendOptions;
      if (!validUploadSendOptions(options) || options.format === 'markdown' && !validRichText(p.text)) throw new EditorProtocolError(-32602, 'Invalid explicit Markdown-file format or consent.');
      return { method: request.method, params: { ...binding, attachmentId: p.attachmentId, requestId: p.requestId, text: p.text, ...options } };
    }
    case 'direct.prepare':
      only(p, ['person']);
      if (!personChoice(p.person)) throw new EditorProtocolError(-32602, 'Choose one exact person ID or email.');
      return { method: request.method, params: { person: p.person } };
    case 'direct.resolve': case 'direct.discard':
      only(p, ['targetId']);
      if (!contextId(p.targetId)) throw new EditorProtocolError(-32602, 'Invalid recipient target.');
      return { method: request.method, params: { targetId: p.targetId } };
    case 'direct.send': {
      only(p, ['targetId', 'draftId', 'requestId', 'text', 'confirmed', 'format', 'attachmentId']);
      const options = { ...(p.format !== undefined ? { format: p.format } : {}), ...(p.attachmentId !== undefined ? { attachmentId: p.attachmentId } : {}) } as DirectOptions;
      if (!contextId(p.targetId) || !uploadDraftId(p.draftId) || !actionRequestId(p.requestId) || !validDirectOptions(options)
        || !(validRichText(p.text) || p.text === '' && options.attachmentId && !options.format) || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Invalid explicit recipient send.');
      return { method: request.method, params: { targetId: p.targetId, draftId: p.draftId, requestId: p.requestId, text: p.text as string, confirmed: true, ...options } };
    }
    case 'rooms.create':
      only(p, ['requestId', 'title', 'confirmed']);
      if (!actionRequestId(p.requestId) || !safeSpaceTitle(p.title) || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Confirm one bounded named group-space creation.');
      return { method: request.method, params: { requestId: p.requestId, title: p.title, confirmed: true } };
    case 'rooms.rename':
      only(p, ['requestId', 'roomId', 'expectedTitle', 'title', 'confirmed']);
      if (!actionRequestId(p.requestId) || !chatId(p.roomId) || !safeSpaceTitle(p.expectedTitle) || !safeSpaceTitle(p.title)
        || p.title === p.expectedTitle || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Confirm one exact standalone group title-only rename.');
      return { method: request.method, params: { requestId: p.requestId, roomId: p.roomId, expectedTitle: p.expectedTitle, title: p.title, confirmed: true } };
    case 'rooms.descriptionPrepare':
      only(p, ['roomId']);
      if (!chatId(p.roomId)) throw new EditorProtocolError(-32602, 'Choose one exact selected standalone space.');
      return { method: request.method, params: { roomId: p.roomId } };
    case 'rooms.describe':
      only(p, ['requestId', 'roomId', 'expectedTitle', 'expectedDescription', 'description', 'confirmed']);
      if (!actionRequestId(p.requestId) || !chatId(p.roomId) || !safeSpaceTitle(p.expectedTitle)
        || !safeSpaceDescription(p.expectedDescription) || !safeSpaceDescription(p.description, true)
        || p.expectedDescription === p.description || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Confirm a bounded nonblank description replacement and required title echo.');
      return { method: request.method, params: { requestId: p.requestId, roomId: p.roomId, expectedTitle: p.expectedTitle,
        expectedDescription: p.expectedDescription, description: p.description, confirmed: true } };
    case 'rooms.descriptionClear':
      only(p, ['requestId', 'roomId', 'expectedTitle', 'expectedDescription', 'confirmed']);
      if (!actionRequestId(p.requestId) || !chatId(p.roomId) || !safeSpaceTitle(p.expectedTitle)
        || !safeSpaceDescription(p.expectedDescription, true) || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Confirm destructive description removal from a bounded nonblank preimage and required title echo.');
      return { method: request.method, params: { requestId: p.requestId, roomId: p.roomId, expectedTitle: p.expectedTitle,
        expectedDescription: p.expectedDescription, confirmed: true } };
    case 'rooms.lock':
      only(p, ['requestId', 'roomId', 'expectedTitle', 'expectedLocked', 'locked', 'confirmed']);
      if (!actionRequestId(p.requestId) || !chatId(p.roomId) || !safeSpaceTitle(p.expectedTitle)
        || typeof p.expectedLocked !== 'boolean' || typeof p.locked !== 'boolean' || p.expectedLocked === p.locked
        || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Confirm an explicit standalone moderation transition and required title echo.');
      return { method: request.method, params: { requestId: p.requestId, roomId: p.roomId, expectedTitle: p.expectedTitle,
        expectedLocked: p.expectedLocked, locked: p.locked, confirmed: true } };
    case 'rooms.announcement':
      only(p, ['requestId', 'roomId', 'expectedTitle', 'expectedAnnouncementOnly', 'announcementOnly', 'confirmed']);
      if (!actionRequestId(p.requestId) || !chatId(p.roomId) || !safeSpaceTitle(p.expectedTitle)
        || typeof p.expectedAnnouncementOnly !== 'boolean' || typeof p.announcementOnly !== 'boolean'
        || p.expectedAnnouncementOnly === p.announcementOnly || p.confirmed !== true) throw new EditorProtocolError(-32602, 'Confirm an explicit announcement-mode transition and required title echo.');
      return { method: request.method, params: { requestId: p.requestId, roomId: p.roomId, expectedTitle: p.expectedTitle,
        expectedAnnouncementOnly: p.expectedAnnouncementOnly, announcementOnly: p.announcementOnly, confirmed: true } };
    case 'members.action': {
      only(p, ['requestId', 'roomId', 'action', 'target', 'confirmed']);
      if (!actionRequestId(p.requestId) || !chatId(p.roomId) || !oneOf(p.action, ['invite', 'remove', 'leave']) || p.confirmed !== true
        || p.action === 'invite' && !personChoice(p.target) || p.action === 'remove' && !chatId(p.target)
        || p.action === 'leave' && p.target !== undefined) throw new EditorProtocolError(-32602, 'Invalid explicit membership action.');
      return { method: request.method, params: { requestId: p.requestId, roomId: p.roomId, action: p.action, confirmed: true,
        ...(typeof p.target === 'string' ? { target: p.target } : {}) } };
    }
    case 'conversations.resolve':
      if (p.action === 'team-rename' || p.action === 'team-describe') {
        only(p, ['action', 'teamId', 'requestId', 'checked']);
        if (!chatId(p.teamId) || !actionRequestId(p.requestId) || p.checked !== true) throw new EditorProtocolError(-32602, 'Check the original unknown Team/request without replay.');
        return { method: request.method, params: { action: p.action, teamId: p.teamId, requestId: p.requestId, checked: true } };
      }
      only(p, ['action', 'roomId', 'checked', 'requestId']);
      if (!oneOf(p.action, ['create', 'invite', 'remove', 'leave', 'rename', 'describe', 'lock', 'announcement', 'description-clear']) || p.checked !== true
        || (p.action === 'rename' || p.action === 'describe' || p.action === 'lock' || p.action === 'announcement' || p.action === 'description-clear' ? !actionRequestId(p.requestId) : p.requestId !== undefined)
        || (p.action === 'create' ? p.roomId !== undefined : !chatId(p.roomId))) throw new EditorProtocolError(-32602, 'Confirm checking the exact uncertain operation first.');
      return { method: request.method, params: { action: p.action, checked: true, ...(typeof p.roomId === 'string' ? { roomId: p.roomId } : {}),
        ...(p.action === 'rename' || p.action === 'describe' || p.action === 'lock' || p.action === 'announcement' || p.action === 'description-clear' ? { requestId: p.requestId as string } : {}) } };
    case 'teams.descriptionPrepare':
    case 'teams.describe':
      only(p, ['teamId', 'revision', ...(request.method === 'teams.describe' ? ['requestId', 'expectedName', 'expectedDescription', 'description', 'confirmed'] : [])]);
      if (!chatId(p.teamId) || !Number.isSafeInteger(p.revision) || (p.revision as number) < 1) throw new EditorProtocolError(-32602, 'Choose an exact fresh joined-Team row/revision.');
      if (request.method === 'teams.descriptionPrepare') return { method: request.method, params: { teamId: p.teamId, revision: p.revision as number } };
      if (!actionRequestId(p.requestId) || p.confirmed !== true || !safeSpaceTitle(p.expectedName)
        || !safeSpaceDescription(p.expectedDescription) || !safeSpaceDescription(p.description, true)
        || p.expectedDescription === p.description) throw new EditorProtocolError(-32602, 'Confirm one changed nonblank Team description with exact preimages.');
      return { method: request.method, params: { teamId: p.teamId, revision: p.revision as number, requestId: p.requestId,
        expectedName: p.expectedName, expectedDescription: p.expectedDescription, description: p.description, confirmed: true } };
    case 'teams.renamePrepare':
    case 'teams.rename':
      only(p, ['teamId', 'revision', ...(request.method === 'teams.rename' ? ['requestId', 'expectedName', 'name', 'confirmed'] : [])]);
      if (!chatId(p.teamId) || !Number.isSafeInteger(p.revision) || (p.revision as number) < 1) throw new EditorProtocolError(-32602, 'Choose an exact fresh joined-Team row/revision.');
      if (request.method === 'teams.renamePrepare') return { method: request.method, params: { teamId: p.teamId, revision: p.revision as number } };
      if (!actionRequestId(p.requestId) || p.confirmed !== true || !safeSpaceTitle(p.expectedName) || !safeSpaceTitle(p.name)
        || p.expectedName === p.name) throw new EditorProtocolError(-32602, 'Confirm one exact changed Team name.');
      return { method: request.method, params: { teamId: p.teamId, revision: p.revision as number, requestId: p.requestId, expectedName: p.expectedName, name: p.name, confirmed: true } };
    case 'teams.list':
      only(p, ['more']);
      if (p.more !== undefined && typeof p.more !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid Team page intent.');
      return { method: request.method, params: { more: p.more === true } };
    case 'teams.joined':
      only(p, ['more', 'revision']);
      if (p.more !== undefined && typeof p.more !== 'boolean'
        || (p.more === true ? !Number.isSafeInteger(p.revision) || (p.revision as number) < 1 : p.revision !== undefined)) {
        throw new EditorProtocolError(-32602, 'Choose an explicit joined-Team query or exact next-page revision.');
      }
      return { method: request.method, params: { more: p.more === true, ...(p.more === true ? { revision: p.revision as number } : {}) } };
    case 'people.spaces': case 'people.viewport':
      only(p, ['roomIds']);
      if (!Array.isArray(p.roomIds) || p.roomIds.length > (request.method === 'people.viewport' ? 128 : 8) || !p.roomIds.every(peopleId)
        || new Set(p.roomIds).size !== p.roomIds.length) throw new EditorProtocolError(-32602, 'Invalid visible direct-space set.');
      return { method: request.method, params: { roomIds: [...p.roomIds] } };
    case 'people.profile':
      only(p, ['personId']);
      if (!peopleId(p.personId)) throw new EditorProtocolError(-32602, 'Choose one exact person ID, not a label/email/actor or profile URL.');
      return { method: request.method, params: { personId: p.personId } };
    case 'people.search':
      only(p, ['query', 'more', 'revision']);
      if (!validDirectoryQuery(p.query) || p.more !== undefined && typeof p.more !== 'boolean'
        || (p.more === true ? !Number.isSafeInteger(p.revision) || (p.revision as number) < 1 : p.revision !== undefined)) {
        throw new EditorProtocolError(-32602, 'Choose an explicit 2–120 character directory prefix and exact next-page revision.');
      }
      return { method: request.method, params: { query: p.query, more: p.more === true,
        ...(p.more === true ? { revision: p.revision as number } : {}) } };
    case 'messages.thread': case 'messages.mentions':
      only(p, ['roomId', ...(request.method === 'messages.thread' ? ['messageId'] : []), 'more', 'revision']);
      if (!chatId(p.roomId) || request.method === 'messages.thread' && !chatId(p.messageId)
        || p.more !== undefined && typeof p.more !== 'boolean'
        || (p.more === true ? !Number.isSafeInteger(p.revision) || (p.revision as number) < 1 : p.revision !== undefined)) {
        throw new EditorProtocolError(-32602, 'Choose an exact selected-room read target and explicit next-page revision.');
      }
      return { method: request.method, params: { roomId: p.roomId, ...(request.method === 'messages.thread' ? { messageId: p.messageId as string } : {}),
        more: p.more === true, ...(p.more === true ? { revision: p.revision as number } : {}) } } as EditorOperation;
    case 'messages.actionDiscard':
      only(p, ['contextId']);
      if (!contextId(p.contextId)) throw new EditorProtocolError(-32602, 'Invalid message context.');
      return { method: request.method, params: { contextId: p.contextId } };
    case 'members.visibility':
      only(p, ['roomId']);
      if (!chatId(p.roomId)) throw new EditorProtocolError(-32602, 'Choose one exact selected direct room for an own-membership API flag read.');
      return { method: request.method, params: { roomId: p.roomId } };
    case 'members.list':
      only(p, ['more']);
      if (p.more !== undefined && typeof p.more !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid roster page intent.');
      return { method: request.method, params: { more: p.more === true } };
    case 'messages.actionPrepare': case 'messages.actionResolve':
      only(p, ['roomId', 'messageId', ...(request.method === 'messages.actionPrepare' ? ['action'] : [])]);
      if (!chatId(p.roomId) || !chatId(p.messageId)) throw new EditorProtocolError(-32602, 'Invalid message action target.');
      if (request.method === 'messages.actionResolve') return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId } };
      if (!oneOf(p.action, ['edit', 'delete'])) throw new EditorProtocolError(-32602, 'Invalid message action.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId, action: p.action } };
    case 'messages.actionSubmit': {
      only(p, ['contextId', 'requestId', 'action', 'revision', 'content', 'format', 'conflictAccepted', 'mentionsAccepted', 'allAccepted']);
      if (!contextId(p.contextId) || !actionRequestId(p.requestId) || !oneOf(p.action, ['edit', 'delete'])
        || !Number.isSafeInteger(p.revision) || (p.revision as number) < 0 || p.conflictAccepted !== true
        || p.action === 'edit' && (!validRichText(p.content) || !oneOf(p.format, ['plain', 'markdown']))
        || p.action === 'delete' && (p.content !== undefined || p.format !== undefined)
        || ['mentionsAccepted', 'allAccepted'].some(key => p[key] !== undefined && typeof p[key] !== 'boolean')) throw new EditorProtocolError(-32602, 'Invalid explicitly confirmed mutation.');
      return { method: request.method, params: p as unknown as MutationIntent };
    }
    case 'messages.sendRich': {
      only(p, ['roomId', 'parentId', 'draftId', 'requestId', 'text', 'mentionsAccepted', 'allAccepted']);
      if (!validUploadBinding(p) || !actionRequestId(p.requestId) || !validRichText(p.text)
        || ['mentionsAccepted', 'allAccepted'].some(key => p[key] !== undefined && typeof p[key] !== 'boolean')) throw new EditorProtocolError(-32602, 'Invalid explicit rich message.');
      return { method: request.method, params: p as unknown as UploadBinding & MentionConsent & { requestId: string; text: string } };
    }
    case 'uploads.cancel':
      only(p, ['draftId', 'phase']);
      if (!uploadDraftId(p.draftId) || p.phase !== undefined && !oneOf(p.phase, ['stage', 'send'])) throw new EditorProtocolError(-32602, 'Invalid upload cancellation.');
      return { method: request.method, params: { draftId: p.draftId, ...(p.phase ? { phase: p.phase as 'stage' | 'send' } : {}) } };
    case 'sections.edit':
      only(p, ['revision', 'edit']);
      if (!Number.isSafeInteger(p.revision) || (p.revision as number) < 0 || !validSectionEdit(p.edit)) throw new EditorProtocolError(-32602, 'Invalid local section edit.');
      return { method: request.method, params: { revision: p.revision as number, edit: p.edit } };
    case 'sections.preferences':
      only(p, ['revision', 'action']);
      if (!Number.isSafeInteger(p.revision) || (p.revision as number) < 0 || !oneOf(p.action, ['load', 'save', 'clear'])) throw new EditorProtocolError(-32602, 'Invalid local preference intent.');
      return { method: request.method, params: { revision: p.revision as number, action: p.action } };
    case 'rooms.select':
      only(p, ['roomId', 'reload']);
      if (!text(p.roomId, 514) || p.reload !== undefined && typeof p.reload !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid space.');
      return { method: request.method, params: { roomId: p.roomId, ...(p.reload === true ? { reload: true } : {}) } };
    case 'messages.list':
      only(p, ['older']);
      if (p.older !== undefined && typeof p.older !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid pagination flag.');
      return { method: request.method, params: { older: p.older === true } };
    case 'messages.attachmentMetadata':
      only(p, ['roomId', 'messageId']);
      if (!chatId(p.roomId) || !chatId(p.messageId)) throw new EditorProtocolError(-32602, 'Invalid attachment destination.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId } };
    case 'rooms.read': case 'messages.images':
      only(p, ['roomId', 'messageId']);
      if (!text(p.roomId, 514) || !text(p.messageId, 514)) throw new EditorProtocolError(-32602, 'Invalid read receipt.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId } };
    case 'messages.send':
      only(p, ['roomId', 'text', 'requestId', 'parentId']);
      if (typeof p.text !== 'string' || !text(p.roomId, 514) || !text(p.requestId, 64) || p.parentId !== undefined && !chatId(p.parentId)) throw new EditorProtocolError(-32602, 'Invalid message/reply target.');
      return { method: request.method, params: { roomId: p.roomId, text: p.text, requestId: p.requestId, ...(p.parentId !== undefined ? { parentId: p.parentId as string } : {}) } };
    case 'messages.imageOpen':
      only(p, ['roomId', 'messageId', 'imageId']);
      if (!chatId(p.roomId) || !chatId(p.messageId) || typeof p.imageId !== 'string' || !/^[a-f0-9]{64}$/.test(p.imageId)) throw new EditorProtocolError(-32602, 'Invalid image destination.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId, imageId: p.imageId } };
    case 'messages.attachmentOpen':
      only(p, ['roomId', 'messageId', 'attachmentId']);
      if (!chatId(p.roomId) || !chatId(p.messageId) || typeof p.attachmentId !== 'string' || !/^[a-f0-9]{64}$/.test(p.attachmentId)) throw new EditorProtocolError(-32602, 'Invalid attachment destination.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId, attachmentId: p.attachmentId } };
    case 'messages.attachmentResolve':
      only(p, ['roomId', 'messageId', 'attachmentId', 'action', 'selectors', 'transfer']);
      if (!chatId(p.roomId) || !chatId(p.messageId) || typeof p.attachmentId !== 'string' || !/^[a-f0-9]{64}$/.test(p.attachmentId)
        || p.transfer !== undefined && p.transfer !== 'chunks-v1'
        || !validAttachmentOptions({ action: p.action, selectors: p.selectors })) throw new EditorProtocolError(-32602, 'Invalid typed attachment intent/policy.');
      return { method: request.method, params: { roomId: p.roomId, messageId: p.messageId, attachmentId: p.attachmentId,
        action: p.action as AttachmentResolveOptions['action'], selectors: (p.selectors as AttachmentResolveOptions['selectors']).map(item => ({ ...item })),
        ...(p.transfer === 'chunks-v1' ? { transfer: 'chunks-v1' as const } : {}) } };
    case 'messages.attachmentChunk':
      only(p, ['requestId', 'transferId', 'seq', 'offset']);
      if (!transferIdentity(p) || !transferInteger(p.seq, 122) || !transferInteger(p.offset, 6_000_000)) throw new EditorProtocolError(-32602, 'Invalid attachment chunk request.');
      return { method: request.method, params: p as unknown as AttachmentPull };
    case 'messages.attachmentComplete':
      only(p, ['requestId', 'transferId', 'chunks', 'decodedBytes', 'encodedBytes', 'sha256']);
      if (!transferIdentity(p) || !transferInteger(p.chunks, 123) || !transferInteger(p.decodedBytes, 6_000_000)
        || !transferInteger(p.encodedBytes, 8_000_000) || typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256)) throw new EditorProtocolError(-32602, 'Invalid attachment completion.');
      return { method: request.method, params: p as unknown as AttachmentComplete };
    case 'messages.attachmentCancel':
      only(p, ['requestId']);
      if (!Number.isSafeInteger(p.requestId) || (p.requestId as number) < 1 || (p.requestId as number) > 0x7fffffff) throw new EditorProtocolError(-32602, 'Invalid attachment request ID.');
      return { method: request.method, params: { requestId: p.requestId as number } };
    case 'meeting.joinUpcoming': {
      only(p, ['meetingId', 'revision', 'display', 'fallback']);
      const display = p.display === undefined ? 'auto' : p.display, fallback = p.fallback === undefined ? 'editor' : p.fallback;
      if (!chatId(p.meetingId) || !Number.isSafeInteger(p.revision) || (p.revision as number) < 1 || !oneOf(display, ['auto', 'kitty', 'editor'])
        || !oneOf(fallback, ['editor', 'error'])) throw new EditorProtocolError(-32602, 'Invalid upcoming meeting selection.');
      return { method: request.method, params: { meetingId: p.meetingId, revision: p.revision as number, display, fallback } };
    }
    case 'meeting.start': {
      only(p, ['mode', 'meeting', 'config', 'display', 'fallback', 'headless', 'callId']);
      const display = p.display === undefined ? 'auto' : p.display, fallback = p.fallback === undefined ? 'editor' : p.fallback;
      if (!oneOf(p.mode, ['demo', 'live']) || !oneOf(display, ['auto', 'kitty', 'editor']) || !oneOf(fallback, ['editor', 'error'])
        || p.meeting !== undefined && !text(p.meeting, 2048) || p.config !== undefined && !text(p.config)
        || p.headless !== undefined && typeof p.headless !== 'boolean'
        || p.callId !== undefined && (typeof p.callId !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(p.callId))) throw new EditorProtocolError(-32602, 'Invalid meeting presentation options.');
      return { method: request.method, params: { mode: p.mode, meeting: p.meeting, config: p.config, display, fallback, headless: p.headless === true, callId: p.callId } };
    }
    case 'meeting.present': {
      only(p, ['display', 'fallback']);
      const fallback = p.fallback === undefined ? 'editor' : p.fallback;
      if (!oneOf(p.display, ['kitty', 'editor']) || !oneOf(fallback, ['editor', 'error'])) throw new EditorProtocolError(-32602, 'Invalid presentation.');
      return { method: request.method, params: { display: p.display, fallback } };
    }
    case 'meeting.control':
      only(p, ['action']);
      if (!text(p.action, 80)) throw new EditorProtocolError(-32602, 'Invalid control.');
      if (!oneOf(p.action, meetingActions)) throw new EditorProtocolError(-32602, 'Unknown meeting control.');
      return { method: request.method, params: { action: p.action } };
    case 'delivery.resolveBound':
      only(p, ['roomId']);
      if (!chatId(p.roomId)) throw new EditorProtocolError(-32602, 'Choose the exact unresolved destination.');
      return { method: request.method, params: { roomId: p.roomId } };
    case 'meeting.reconnect':
      only(p, ['session']);
      if (typeof p.session !== 'string' || !/^wbx-[A-Za-z0-9_-]{1,124}$/.test(p.session))
        throw new EditorProtocolError(-32602, 'Choose the original meeting session.');
      return { method: request.method, params: { session: p.session } };
    case 'meeting.pane': {
      only(p, ['session', 'intent']);
      if (typeof p.session !== 'string' || !/^wbx-[A-Za-z0-9_-]{1,124}$/.test(p.session) || !nativePaneIntent(p.intent))
        throw new EditorProtocolError(-32602, 'Invalid finite meeting pane selection.');
      return { method: request.method, params: { session: p.session, intent: p.intent } };
    }
    case 'shutdown':
      only(p, ['leaveMeeting']);
      if (p.leaveMeeting !== undefined && typeof p.leaveMeeting !== 'boolean') throw new EditorProtocolError(-32602, 'Invalid leave flag.');
      return { method: request.method, params: { leaveMeeting: p.leaveMeeting === true } };
    default: throw new EditorProtocolError(-32601, 'Unknown backend method.');
  }
}
/** UTF-8-safe bounded JSON lines, independent of Vim/Neovim job callback chunks. */
export class EditorLines {
  private decoder = new StringDecoder('utf8');
  private blocks: string[] = [];
  private tail: string[] = [];
  private tailBytes = 0;
  private bytes = 0;
  private rawBytes = 0;
  private failed = false;
  constructor(private line: (line: string) => void) {}
  private append(value: string): void {
    if (!value) return;
    const bytes = Buffer.byteLength(value);
    if (this.bytes + bytes > MAX_EDITOR_REQUEST) throw new Error('Oversized editor request.');
    this.bytes += bytes; this.tailBytes += bytes; this.tail.push(value);
    // Bound fragment metadata too: one-byte input must not retain one reference
    // for every byte of an arbitrarily fragmented record.
    if (this.tailBytes >= 4096) {
      this.blocks.push(this.tail.length === 1 ? this.tail[0]! : this.tail.join(''));
      this.tail = []; this.tailBytes = 0;
    }
  }
  private reset(): void {
    this.decoder = new StringDecoder('utf8');
    this.blocks = []; this.tail = []; this.tailBytes = 0; this.bytes = 0; this.rawBytes = 0;
  }
  private finish(): void {
    // A newline terminates even an invalid UTF-8 sequence, just as feeding LF to
    // StringDecoder did before. Keep replacement and re-encoded byte admission.
    this.append(this.decoder.end());
    if (this.tail.length) this.blocks.push(this.tail.length === 1 ? this.tail[0]! : this.tail.join(''));
    const line = this.blocks.length === 1 ? this.blocks[0]! : this.blocks.join('');
    this.reset();
    if (line.trim()) this.line(line);
  }
  push(chunk: Buffer): void {
    if (this.failed) throw new Error('Editor framing is closed after failure.');
    try {
      let offset = 0;
      while (offset < chunk.length) {
        // Scan only new bytes. Never search, measure or copy an accumulated
        // incomplete prefix again, or repeatedly copy a shrinking callback tail.
        const newline = chunk.indexOf(10, offset), end = newline < 0 ? chunk.length : newline;
        const bytes = end - offset;
        if (this.rawBytes + bytes > MAX_EDITOR_REQUEST) throw new Error('Oversized editor request.');
        this.rawBytes += bytes;
        this.append(this.decoder.write(chunk.subarray(offset, end)));
        offset = end + 1;
        if (newline >= 0) this.finish();
      }
    } catch (error) {
      this.failed = true; this.reset(); throw error;
    }
  }
}
