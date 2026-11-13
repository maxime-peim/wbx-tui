/** Snapshot/send DTO policy only; does not acquire or inspect a file. */
import { isAbsolute, resolve } from 'node:path';
import { chatId } from './chat-protocol.js';
import type { MentionConsent } from './rich-messages.js';
export const UPLOAD_LIMITS = Object.freeze({ fileBytes: 10 * 1024 * 1024, totalBytes: 20 * 1024 * 1024, references: 8,
  chunkBytes: 65_536, stageMs: 8000, sendMs: 60_000, progressMs: 250 });
export interface UploadBinding { roomId: string; parentId?: string; draftId: string }
export interface RecipientUploadBinding { targetId: string; draftId: string }
export type SnapshotBinding = UploadBinding | RecipientUploadBinding;
export interface UploadSendOptions extends MentionConsent { format?: 'markdown' }
export function validUploadSendOptions(value: UploadSendOptions): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => ['format', 'mentionsAccepted', 'allAccepted'].includes(key))
    && (value.format === undefined || value.format === 'markdown')
    && ['mentionsAccepted', 'allAccepted'].every(key => {
      const flag = value[key as keyof MentionConsent];
      return flag === undefined || value.format === 'markdown' && typeof flag === 'boolean';
    });
}
export interface StagedUpload { attachmentId: string; name: string; bytes: number }
export type UploadProgress = SnapshotBinding & { attachmentId: string; phase: 'stage' | 'send'; bytes: number; total: number };
export interface UploadSource extends StagedUpload { read(signal: AbortSignal): AsyncGenerator<Uint8Array> }
export const uploadId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export const uploadDraftId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const validUploadBinding = (v: unknown): v is UploadBinding => !!v && typeof v === 'object' && !Array.isArray(v)
  && !('targetId' in v)
  && chatId((v as UploadBinding).roomId) && uploadDraftId((v as UploadBinding).draftId)
  && ((v as UploadBinding).parentId === undefined || chatId((v as UploadBinding).parentId));
export const validRecipientBinding = (v: unknown): v is RecipientUploadBinding => !!v && typeof v === 'object' && !Array.isArray(v)
  && !('roomId' in v) && !('parentId' in v) && uploadId((v as RecipientUploadBinding).targetId)
  && uploadDraftId((v as RecipientUploadBinding).draftId);
export const validSnapshotBinding = (v: unknown): v is SnapshotBinding => validUploadBinding(v) || validRecipientBinding(v);
export const snapshotBinding = (v: SnapshotBinding): SnapshotBinding => 'targetId' in v
  ? { targetId: v.targetId, draftId: v.draftId }
  : { roomId: v.roomId, draftId: v.draftId, ...(v.parentId !== undefined ? { parentId: v.parentId } : {}) };
export const uploadPath = (value: unknown): value is string => typeof value === 'string' && isAbsolute(value)
  && resolve(value) === value && Buffer.byteLength(value) <= 4096 && !/[\x00-\x1f\x7f]/.test(value);
