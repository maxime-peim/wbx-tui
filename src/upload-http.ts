/** Fixed-origin, one-submission multipart. No fetch/SDK/redirect/auth replay machinery. */
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns';
import { randomBytes } from 'node:crypto';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { chatId, chatText } from './chat-protocol.js';
import { validToken } from './auth-protocol.js';
import { peopleId } from './identity-contracts.js';
import { UploadFailure, UPLOAD_LIMITS, type UploadSource } from './uploads.js';
export const UPLOAD_HTTP = Object.freeze({ envelopeBytes: 8192, responseBytes: 262_144, responseReads: 1024 });
export type UploadFields = ({ roomId: string; parentId?: string; toPersonId?: never }
  | { toPersonId: string; roomId?: never; parentId?: never }) & { text: string; format?: 'markdown' };
/** Test-only boundary injection, never a server URL/config/RPC field. */
export type UploadRequest = (options: RequestOptions, listener: (response: IncomingMessage) => void) => ClientRequest;
const refused = new Set([400, 401, 403, 404, 413, 415, 422, 429]);
export function multipart(source: Pick<UploadSource, 'name' | 'bytes'>, fields: UploadFields) {
  if (!(fields.toPersonId !== undefined ? peopleId(fields.toPersonId) && fields.roomId === undefined && fields.parentId === undefined
      : chatId(fields.roomId) && (fields.parentId === undefined || chatId(fields.parentId)))
    || fields.format !== undefined && fields.format !== 'markdown'
    || fields.format === 'markdown' && (!chatText(fields.text) || Buffer.byteLength(fields.text) > 4000)
    || fields.text !== '' && !chatText(fields.text) || /[\ud800-\udfff]/u.test(fields.text)
    || !Number.isSafeInteger(source.bytes) || source.bytes < 0 || source.bytes > UPLOAD_LIMITS.fileBytes
    || !source.name || Buffer.byteLength(source.name) > 240 || /[\r\n\x00]/.test(source.name)) throw new UploadFailure('failed');
  const boundary = 'wbx-' + randomBytes(24).toString('hex');
  const part = (name: string, value: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const filename = source.name.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const prefix = Buffer.from((fields.toPersonId !== undefined ? part('toPersonId', fields.toPersonId)
    : part('roomId', fields.roomId) + (fields.parentId ? part('parentId', fields.parentId) : ''))
    + (fields.text ? part(fields.format === 'markdown' ? 'markdown' : 'text', fields.text) : '')
    + `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8');
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  if (prefix.length + suffix.length > UPLOAD_HTTP.envelopeBytes) throw new UploadFailure('failed');
  return { boundary, prefix, suffix, length: prefix.length + source.bytes + suffix.length };
}
export async function postUpload(source: UploadSource, fields: UploadFields, token: string, signal: AbortSignal,
  submitted: () => void, request: UploadRequest = httpsRequest): Promise<Record<string, unknown>> {
  if (!validToken(token) || signal.aborted) throw new UploadFailure('failed');
  const body = multipart(source, fields);
  let wasSubmitted = false, response: IncomingMessage | undefined, responseClosed: Promise<void> | undefined;
  let accept!: (value: Record<string, unknown>) => void, reject!: (error: Error) => void;
  const outcome = new Promise<Record<string, unknown>>((yes, no) => { accept = yes; reject = no; });
  // A destroyed socket can precede OS DNS completion. Retain this physical work
  // too, so repeated cancellation cannot grow an invisible native lookup backlog.
  const lookups: Promise<void>[] = [];
  const trackedLookup: RequestOptions['lookup'] = (hostname, options, callback) => {
    let done!: () => void; lookups.push(new Promise<void>(resolve => { done = resolve; }));
    lookup(hostname, options, (...args) => { try { callback(...args); } finally { done(); } });
  };
  let req: ClientRequest;
  try {
    req = request({ protocol: 'https:', hostname: 'webexapis.com', port: 443, path: '/v1/messages', method: 'POST',
      agent: false, signal, lookup: trackedLookup, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
        'Content-Type': `multipart/form-data; boundary=${body.boundary}`, 'Content-Length': String(body.length) } }, incoming => {
      response = incoming; responseClosed = new Promise<void>(resolve => incoming.once('close', resolve));
      if (![200, 201].includes(incoming.statusCode ?? 0)) {
        reject(refused.has(incoming.statusCode ?? 0)
          ? new UploadFailure('failed', `Webex refused the upload (${incoming.statusCode}). File bytes may have reached the service; nothing was retried.`, incoming.statusCode)
          : new UploadFailure('unknown'));
        incoming.destroy(); return;
      }
      void (async () => {
        let bytes = 0, reads = 0; const chunks: Buffer[] = [];
        try {
          for await (const raw of incoming) {
            const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            bytes += chunk.length;
            if (bytes > UPLOAD_HTTP.responseBytes || ++reads > UPLOAD_HTTP.responseReads) throw new Error();
            chunks.push(chunk);
          }
          const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
          accept(value as Record<string, unknown>);
        } catch { reject(new UploadFailure('unknown')); }
      })();
    });
  } catch { throw new UploadFailure(wasSubmitted ? 'unknown' : 'failed'); }
  const closed = new Promise<void>(resolve => req.once('close', resolve));
  req.on('error', () => reject(new UploadFailure(wasSubmitted ? 'unknown' : 'failed')));
  const write = (value: Uint8Array) => new Promise<void>((resolve, rejectWrite) => {
    req.write(value, error => error ? rejectWrite(error) : resolve());
  });
  const producer = (async () => {
    if (signal.aborted) throw new UploadFailure('failed');
    submitted(); wasSubmitted = true;
    await write(body.prefix);
    let bytes = 0;
    for await (const chunk of source.read(signal)) {
      if (signal.aborted || !chunk.byteLength || chunk.byteLength > UPLOAD_LIMITS.chunkBytes || bytes + chunk.byteLength > source.bytes) throw new UploadFailure('unknown');
      bytes += chunk.byteLength; await write(chunk);
    }
    if (bytes !== source.bytes || signal.aborted) throw new UploadFailure('unknown');
    await write(body.suffix);
    await new Promise<void>((resolve, rejectEnd) => { req.end((error?: Error) => error ? rejectEnd(error) : resolve()); });
  })();
  void producer.catch(error => reject(error instanceof UploadFailure ? error : new UploadFailure(wasSubmitted ? 'unknown' : 'failed')));
  try {
    const value = await outcome; await producer; return value;
  } finally {
    req.destroy(); response?.destroy();
    await Promise.allSettled([producer, closed, ...(responseClosed ? [responseClosed] : []), ...lookups]);
  }
}
