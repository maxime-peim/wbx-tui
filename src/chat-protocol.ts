/** Space messaging only. Never infer a room from a meeting link. */
export const CHAT_TEXT_LIMIT = 1000;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_ROOM_LIMIT = 30;
export interface ChatRoom { id: string; title: string }
export interface ChatMessage { id: string; author: string; authorId?: string; senderName?: string; created: string; updated?: string; edited?: boolean; text: string; markdown?: string; quoted?: boolean; parentId?: string; cards?: { count: number; partial: boolean }; images?: import('./message-images.js').MessageImage[]; attachments?: import('./message-attachments.js').MessageAttachment[] }
export type ChatProblem = 'not-connected' | 'unsupported' | 'denied' | 'failed' | 'busy' | 'unknown';
export interface ChatSnapshot {
  state: 'off' | 'loading' | 'ready' | 'failed' | 'closed';
  mode: 'space' | 'demo'; rooms: ChatRoom[]; room?: ChatRoom; messages: ChatMessage[];
  sending: boolean; problem?: ChatProblem;
}
export type ChatRequest = { type: 'chat'; requestId: string } & (
  { action: 'rooms' } | { action: 'close' } | { action: 'select' | 'refresh'; roomId: string }
  | { action: 'send'; roomId: string; text: string }
);
export interface ChatResult { type: 'chat-result'; requestId: string; roomId: string; status: 'sent' | 'failed' | 'unknown'; problem?: ChatProblem }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
export const chatId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_+\/-]{1,512}={0,2}$/.test(v) && !v.includes('..');
const requestId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const chatText = (v: unknown): v is string => bounded(v, CHAT_TEXT_LIMIT) && !!v.trim() && !/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(v);
const problem = (v: unknown) => v === undefined || ['not-connected', 'unsupported', 'denied', 'failed', 'busy', 'unknown'].includes(String(v));
export function validChatRequest(v: unknown): v is ChatRequest {
  if (!object(v) || v.type !== 'chat' || !requestId(v.requestId)
    || Object.keys(v).some(key => !['type', 'requestId', 'action', 'roomId', 'text'].includes(key))) return false;
  if (v.action === 'rooms' || v.action === 'close') return v.roomId === undefined && v.text === undefined;
  return chatId(v.roomId) && (v.action === 'send' ? chatText(v.text) : (v.action === 'select' || v.action === 'refresh') && v.text === undefined);
}
export function validChatRoom(v: unknown): v is ChatRoom { return object(v) && chatId(v.id) && bounded(v.title, 80); }
export function validChatSnapshot(v: unknown): v is ChatSnapshot {
  return object(v) && ['off', 'loading', 'ready', 'failed', 'closed'].includes(String(v.state)) && ['space', 'demo'].includes(String(v.mode))
    && typeof v.sending === 'boolean' && problem(v.problem) && (v.room === undefined || validChatRoom(v.room))
    && Array.isArray(v.rooms) && v.rooms.length <= CHAT_ROOM_LIMIT && v.rooms.every(validChatRoom)
    && new Set(v.rooms.map(room => room.id)).size === v.rooms.length
    && Array.isArray(v.messages) && v.messages.length <= CHAT_HISTORY_LIMIT && (!v.messages.length || validChatRoom(v.room))
    && v.messages.every(message => object(message) && chatId(message.id) && bounded(message.author, 80)
      && (message.authorId === undefined || chatId(message.authorId))
      && bounded(message.created, 40) && bounded(message.text, CHAT_TEXT_LIMIT)
      && (message.markdown === undefined || bounded(message.markdown, 10_100)) && (message.quoted === undefined || typeof message.quoted === 'boolean')
      && (message.parentId === undefined || chatId(message.parentId) && message.parentId !== message.id))
    && new Set(v.messages.map(message => message.id)).size === v.messages.length;
}
export function validChatResult(v: unknown): v is ChatResult {
  return object(v) && v.type === 'chat-result' && requestId(v.requestId) && chatId(v.roomId)
    && ['sent', 'failed', 'unknown'].includes(String(v.status)) && problem(v.problem);
}
export const emptyChat = (mode: 'space' | 'demo' = 'space'): ChatSnapshot => ({ state: 'off', mode, rooms: [], messages: [], sending: false });
