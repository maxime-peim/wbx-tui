/** Small, validated boundary shared by Node and the browser. No SDK objects cross it. */
import { validChatRequest, validChatResult, validChatSnapshot, type ChatRequest, type ChatResult, type ChatSnapshot } from './chat-protocol.js';
import { authProblem, refreshId, validCredentialReply, validExpiry, validOAuthMeta, validToken, type OAuthMeta, type AuthMethod, type AuthProblem, type CredentialReply } from './auth-protocol.js';
export const MAX_WIDTH = 1920;
export const MAX_HEIGHT = 1080;
export const MAX_FRAME_BYTES = MAX_WIDTH * MAX_HEIGHT * 4 + 32;
export const HEADER_BYTES = 32;
export type Format = 'png' | 'rgba';
export type Source = 'video' | 'share' | 'local' | 'self' | 'presenting' | `mock-${number}` | `remote-${number}`;
export function validSource(value: unknown): value is Source {
  return typeof value === 'string' && (['video', 'share', 'local', 'self', 'presenting'].includes(value) || /^mock-([1-9]|1[0-2])$/.test(value) || /^remote-([2-9]|1[0-2])$/.test(value));
}
export interface SourceInfo { id: Source; label: string; kind: 'mock' | 'video' | 'share' | 'local'; available: boolean; present?: boolean; generation?: number }
export type CameraState = 'off' | 'starting' | 'on';
export type CameraReason = 'denied' | 'unavailable' | 'busy' | 'unsupported' | 'failed' | 'ended';
export type SendKind = 'microphone' | 'camera' | 'screen';
export type SendState = 'off' | 'awaiting' | 'starting' | 'on';
export type SendReason = CameraReason | 'not-connected' | 'host-muted';
export const sendKinds: readonly SendKind[] = ['microphone', 'camera', 'screen'];
export type RendererMode = 'auto' | 'kitty' | 'blocks' | 'browser';
export type DemoPattern = 'chart' | 'noise';
export interface Capture {
  type: 'capture'; seq: number; width: number; height: number; format: Format; source: Source;
}
export type Command = Capture
  | ChatRequest
  | CredentialReply
  | { type: 'oauth-renew' }
  | { type: 'start'; mode: 'demo' | 'live'; token?: string; oauth?: OAuthMeta; meeting?: string; pattern?: DemoPattern; participants?: number; mockShare?: boolean }
  | { type: 'demo-update'; participants?: number; share?: boolean }
  | { type: 'audio'; enabled: boolean }
  | { type: 'camera'; enabled: boolean; requestId: number }
  | { type: 'send'; kind: SendKind; enabled: boolean; requestId: number }
  | { type: 'leave' };
export type Status = 'ready' | 'demo' | 'registering' | 'joining' | 'lobby' | 'negotiating'
  | 'connected' | 'ended' | 'failed';
const statuses: readonly string[] = ['ready', 'demo', 'registering', 'joining', 'lobby', 'negotiating', 'connected', 'ended', 'failed'];
export type WorkerEvent = { type: 'status'; state: Status }
  | { type: 'presentation'; renderer: 'kitty' | 'blocks' }
  | { type: 'oauth-refresh'; requestId: number }
  | { type: 'auth-state'; method: AuthMethod; state: 'ready' | 'refreshing' | 'failed'; expiresAt?: number; reason?: AuthProblem }
  | { type: 'chat-state'; chat: ChatSnapshot }
  | ChatResult
  | { type: 'sources'; sources: SourceInfo[] }
  | { type: 'audio-state'; enabled: boolean }
  | { type: 'camera-request'; enabled: boolean }
  | { type: 'camera-state'; requestId: number; state: CameraState; sending: false; reason?: CameraReason }
  | { type: 'send-request'; kind: SendKind; enabled: boolean }
  | { type: 'send-state'; kind: SendKind; requestId: number; state: SendState; reason?: SendReason }
  | { type: 'notice'; message: string }
  | { type: 'unavailable'; seq: number }
  | { type: 'error'; stage: 'sdk' | 'join' | 'capture' | 'audio' | 'protocol' }
  | { type: 'left' };
export interface Frame {
  seq: number; width: number; height: number; format: Format;
  capturedAt: number; sourceFrame: number; data: Uint8Array;
}
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function validCapture(v: unknown): v is Capture {
  if (!v || typeof v !== 'object') return false;
  const a = v as Capture;
  return a.type === 'capture' && integer(a.seq, 1, 0xffffffff)
    && integer(a.width, 1, MAX_WIDTH) && integer(a.height, 1, MAX_HEIGHT)
    && (a.format === 'png' || a.format === 'rgba') && validSource(a.source);
}
export function parseCommand(text: string): Command {
  if (text.length > 16_384) throw new Error('Oversized command.');
  const v = JSON.parse(text) as Command;
  if (!v || typeof v !== 'object') throw new Error('Invalid command.');
  if (validCredentialReply(v) || validChatRequest(v) || validCapture(v) || v.type === 'leave' || v.type === 'oauth-renew' || (v.type === 'audio' && typeof v.enabled === 'boolean')
    || (v.type === 'camera' && typeof v.enabled === 'boolean' && integer(v.requestId, 1, 0xffffffff))
    || (v.type === 'send' && sendKinds.includes(v.kind) && typeof v.enabled === 'boolean' && integer(v.requestId, 1, 0xffffffff))) return v;
  if (v.type === 'demo-update' && (v.participants !== undefined || v.share !== undefined)
    && (v.participants === undefined || integer(v.participants, 1, 12)) && (v.share === undefined || typeof v.share === 'boolean')) return v;
  if (v.type === 'start' && (v.participants === undefined || integer(v.participants, 1, 12))
    && (v.mockShare === undefined || typeof v.mockShare === 'boolean')
    && (v.pattern === undefined || v.pattern === 'chart' || v.pattern === 'noise') && ((v.mode === 'demo' && v.token === undefined && v.oauth === undefined) || (v.mode === 'live'
    && validToken(v.token) && (v.oauth === undefined || validOAuthMeta(v.oauth))
    && typeof v.meeting === 'string' && validMeeting(v.meeting)))) return v;
  throw new Error('Invalid command.');
}
export function parseEvent(text: string): WorkerEvent {
  if (text.length > 256_000) throw new Error('Oversized event.');
  const v = JSON.parse(text) as WorkerEvent;
  if (!v || typeof v !== 'object') throw new Error('Invalid event.');
  if ((v.type === 'chat-state' && validChatSnapshot(v.chat)) || validChatResult(v)) return v;
  if (text.length > 8192) throw new Error('Oversized event.');
  if (v.type === 'presentation' && ['kitty', 'blocks'].includes(v.renderer) && Object.keys(v).every(key => ['type', 'renderer'].includes(key))) return v;
  if ((v.type === 'oauth-refresh' && refreshId(v.requestId) && Object.keys(v).every(key => ['type', 'requestId'].includes(key)))
    || (v.type === 'auth-state' && ['token', 'oauth'].includes(v.method) && ['ready', 'refreshing', 'failed'].includes(v.state)
      && (v.expiresAt === undefined || validExpiry(v.expiresAt)) && (v.reason === undefined || authProblem(v.reason))
      && Object.keys(v).every(key => ['type', 'method', 'state', 'expiresAt', 'reason'].includes(key)))) return v;
  if ((v.type === 'status' && statuses.includes(v.state)) || v.type === 'left'
    || (v.type === 'sources' && Array.isArray(v.sources) && v.sources.length <= 16
      && new Set(v.sources.map(source => source?.id)).size === v.sources.length
      && v.sources.every(source => source && validSource(source.id) && typeof source.label === 'string' && source.label.length <= 80
        && ['mock', 'video', 'share', 'local'].includes(source.kind) && typeof source.available === 'boolean'
        && (source.present === undefined || typeof source.present === 'boolean') && (source.generation === undefined || integer(source.generation, 0, 0xffffffff))))
    || (v.type === 'notice' && typeof v.message === 'string' && v.message.length <= 160)
    || (v.type === 'audio-state' && typeof v.enabled === 'boolean')
    || (v.type === 'camera-request' && typeof v.enabled === 'boolean')
    || (v.type === 'send-request' && sendKinds.includes(v.kind) && typeof v.enabled === 'boolean')
    || (v.type === 'send-state' && sendKinds.includes(v.kind) && integer(v.requestId, 0, 0xffffffff)
      && ['off', 'awaiting', 'starting', 'on'].includes(v.state)
      && (v.reason === undefined || ['denied', 'unavailable', 'busy', 'unsupported', 'failed', 'ended', 'not-connected', 'host-muted'].includes(v.reason)))
    || (v.type === 'camera-state' && integer(v.requestId, 0, 0xffffffff) && ['off', 'starting', 'on'].includes(v.state) && v.sending === false
      && (v.reason === undefined || ['denied', 'unavailable', 'busy', 'unsupported', 'failed', 'ended'].includes(v.reason)))
    || (v.type === 'unavailable' && integer(v.seq, 1, 0xffffffff))
    || (v.type === 'error' && ['sdk', 'join', 'capture', 'audio', 'protocol'].includes(v.stage))) return v;
  throw new Error('Invalid event.');
}
export function validMeeting(value: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname.endsWith('.webex.com') || url.hostname === 'webex.com');
  } catch { return false; }
}
export function encodeFrame(frame: Frame): Uint8Array {
  const buffer = new Uint8Array(HEADER_BYTES + frame.data.byteLength);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 0x57425831); // WBX1, all fields network byte order
  view.setUint32(4, frame.seq);
  view.setUint16(8, frame.width);
  view.setUint16(10, frame.height);
  view.setUint8(12, frame.format === 'png' ? 1 : 2);
  view.setFloat64(16, frame.capturedAt);
  view.setUint32(24, frame.data.byteLength);
  view.setUint32(28, frame.sourceFrame);
  buffer.set(frame.data, HEADER_BYTES);
  return buffer;
}
export function decodeFrame(buffer: Uint8Array): Frame {
  if (buffer.byteLength < HEADER_BYTES || buffer.byteLength > MAX_FRAME_BYTES) throw new Error('Invalid frame size.');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const format = view.getUint8(12);
  const frame: Frame = { seq: view.getUint32(4), width: view.getUint16(8), height: view.getUint16(10),
    format: format === 1 ? 'png' : 'rgba', capturedAt: view.getFloat64(16),
    sourceFrame: view.getUint32(28), data: buffer.subarray(HEADER_BYTES) };
  if (view.getUint32(0) !== 0x57425831 || (format !== 1 && format !== 2)
    || view.getUint32(24) !== frame.data.byteLength || !Number.isFinite(frame.capturedAt)
    || !validCapture({ type: 'capture', ...frame, source: 'video' })
    || (format === 2 && frame.data.byteLength !== frame.width * frame.height * 4)
    || (format === 1 && (frame.data.length < 24
      || new DataView(frame.data.buffer, frame.data.byteOffset).getUint32(0) !== 0x89504e47
      || new DataView(frame.data.buffer, frame.data.byteOffset).getUint32(16) !== frame.width
      || new DataView(frame.data.buffer, frame.data.byteOffset).getUint32(20) !== frame.height))) {
    throw new Error('Invalid frame header or payload.');
  }
  return frame;
}
