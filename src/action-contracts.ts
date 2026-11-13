/** Message/conversation DTO policy. No operational mutation or transport owner. */
import { chatText } from './chat-protocol.js';
import { peopleId, senderName } from './identity-contracts.js';
import { uploadId } from './upload-contracts.js';
import type { MentionConsent } from './rich-messages.js';
export const MESSAGE_ACTION_LIMITS = Object.freeze({ contexts: 8, lifetimeMs: 600_000, requests: 256, edits: 10, operationMs: 20_000 });
export type MessageFormat = 'plain' | 'markdown';
export type MessageAction = 'edit' | 'delete';
export interface MessageAccess { token: string; scopes: string[]; expiresAt: number }
export interface EditContext { contextId: string; roomId: string; messageId: string; action: MessageAction;
  content: string; format: MessageFormat; expiresAt: number }
export interface MutationIntent extends MentionConsent { contextId: string; requestId: string; action: MessageAction; revision: number;
  content?: string; format?: MessageFormat; conflictAccepted: true }
export interface MutationOutcome { requestId: string; contextId: string; roomId: string; messageId: string;
  action: MessageAction; revision: number; status: 'changed' | 'failed' | 'unknown' | 'conflict'; notice: string }
export const contextId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export const actionRequestId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const validRichText = (v: unknown): v is string => typeof v === 'string' && chatText(v) && Buffer.byteLength(v) <= 4000
  && !/[\ud800-\udfff]/u.test(v);
export const CONVERSATION_LIMITS = Object.freeze({ contexts: 8, contextMs: 600_000, requests: 256, operationMs: 20_000, resultBytes: 16384 });
export const DESCRIPTION_LIMITS = Object.freeze({ units: 1000, bytes: 4000, ageMs: 120_000 });
export interface DescriptionSnapshot { roomId: string; expectedTitle: string; expectedDescription: string }
export interface DirectOptions { format?: 'markdown'; attachmentId?: string }
export const validDirectOptions = (v: DirectOptions): boolean => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).every(key => ['format', 'attachmentId'].includes(key))
  && (v.format === undefined || v.format === 'markdown') && (v.attachmentId === undefined || uploadId(v.attachmentId));
export const safeSpaceTitle = (v: unknown): v is string => typeof v === 'string' && !!v && v.trim() === v
  && Array.from(v).length <= 80 && Buffer.byteLength(v) <= 320 && senderName(v) === v;
export const safeSpaceDescription = (v: unknown, nonblank = false): v is string => typeof v === 'string'
  && v.length <= DESCRIPTION_LIMITS.units && Buffer.byteLength(v) <= DESCRIPTION_LIMITS.bytes && (!nonblank || !!v.trim())
  && !/[\x00-\x09\x0b-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff\ud800-\udfff]/u.test(v);
export const personChoice = (v: unknown): v is string => peopleId(v) || typeof v === 'string' && v.length <= 254
  && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(v);
