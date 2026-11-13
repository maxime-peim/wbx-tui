/** Display-only read-through evidence. Never a receipt, presence or write grant. */
import { chatId } from './chat-protocol.js';
import { peopleId, validSenderName } from './identity-contracts.js';
export const READER_LIMITS = { memberships: 500, readers: 128 } as const;
export interface ReaderTarget { roomId: string; messageId: string }
export interface MessageReaders extends ReaderTarget {
  coverage: 'space-read-watermark';
  observedAt: number;
  partial: boolean;
  readers: { personId: string; name?: string }[];
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validReaderTarget(v: unknown): v is ReaderTarget {
  return object(v) && chatId(v.roomId) && chatId(v.messageId)
    && Object.keys(v).every(k => ['roomId', 'messageId'].includes(k));
}
export function validMessageReaders(v: unknown): v is MessageReaders {
  return object(v) && chatId(v.roomId) && chatId(v.messageId) && v.coverage === 'space-read-watermark'
    && Number.isSafeInteger(v.observedAt) && (v.observedAt as number) > 0 && typeof v.partial === 'boolean'
    && Object.keys(v).every(k => ['roomId', 'messageId', 'coverage', 'observedAt', 'partial', 'readers'].includes(k))
    && Array.isArray(v.readers) && v.readers.length <= READER_LIMITS.readers
    && v.readers.every(r => object(r) && peopleId(r.personId) && (r.name === undefined || validSenderName(r.name))
      && Object.keys(r).every(k => ['personId', 'name'].includes(k)))
    && new Set(v.readers.map(r => r.personId)).size === v.readers.length;
}
