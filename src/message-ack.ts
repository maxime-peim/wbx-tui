/** Positive POST response evidence only. Display projection happens afterwards. */
import { chatId } from './chat-protocol.js';

export interface MessageAckIntent {
  roomId: string;
  parentId?: string;
  content: string;
  format: 'plain' | 'markdown';
}
export function validMessageAck(value: unknown, intent: MessageAckIntent): value is Record<string, unknown> & { id: string; created: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  // Markdown is a server rendition, not a byte echo; bind success to the POST's
  // exact destination/root and new message identity, never to display equality.
  const content = intent.format === 'plain' ? raw.text === intent.content
    : ['markdown', 'html'].some(key => typeof raw[key] === 'string' && raw[key].trim().length > 0)
      && ['markdown', 'html', 'text'].every(key => raw[key] === undefined
        || typeof raw[key] === 'string' && raw[key].length <= 40_000 && !/[\ud800-\udfff]/u.test(raw[key]));
  return !Object.hasOwn(raw, 'errors') && !Object.hasOwn(raw, 'error')
    && chatId(raw.id) && raw.roomId === intent.roomId
    && (raw.parentId === null ? undefined : raw.parentId) === intent.parentId
    && typeof raw.created === 'string' && !!raw.created && raw.created.length <= 128 && Number.isFinite(Date.parse(raw.created))
    && content
    && (raw.files === undefined || Array.isArray(raw.files) && raw.files.length === 0);
}
