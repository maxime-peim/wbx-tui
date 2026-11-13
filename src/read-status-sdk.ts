import { createRequire } from 'node:module';
import type { AccessCredentials } from './auth-protocol.js';

interface Events { on(name: string, listener: (event: unknown) => void): void; off(name: string, listener: (event: unknown) => void): void }
interface Conversations {
  list(...args: unknown[]): Promise<unknown[]>;
  get(...args: unknown[]): Promise<unknown>;
  request(options: RequestOptions): Promise<Response>;
}
interface RequestOptions {
  method?: string; body?: { verb?: string }; uri?: string; url?: string;
  api?: string; resource?: string; timeout?: number;
  request?: (options: RequestOptions) => Promise<Response>;
  followRedirect?: boolean; followAllRedirects?: boolean; maxRedirects?: number; shouldRefreshAccessToken?: boolean;
  pool?: false; agent?: false; forever?: false;
}
interface Response { statusCode?: number; headers?: Record<string, unknown>; body?: unknown }
export interface ReadStatusSDK extends Events {
  ready: boolean;
  rooms: Events & { listWithReadStatus(): Promise<{ items: unknown[] }>; getWithReadStatus(id: string): Promise<unknown>; listen(): Promise<void>; stopListening(): void };
  memberships: Events & { listWithReadStatus(target: { roomId: string }): Promise<unknown>; listen(): Promise<void>; stopListening(): void; updateLastSeen(message: { id: string; roomId: string }): Promise<unknown> };
  messages: Events & { get(id: string): Promise<unknown>; listen(): Promise<void>; stopListening(): void };
  internal: { conversation: Conversations; mercury: Events & { disconnect(): Promise<void> }; device: { url?: unknown; userId?:unknown; register(): Promise<void>; unregister(): Promise<void> }; me?: { id?: unknown } };
}
/** SDK 3.13 checks computedTitle but then emits displayName instead. Preserve
 * the server-computed title before that projection, without mutating SDK caches,
 * fetching people/memberships, changing read dates or making another request. */
function computedTitle(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const item = value as Record<string, unknown>;
  if (typeof item.displayName === 'string' && item.displayName.trim()
    || typeof item.computedTitle !== 'string' || !item.computedTitle.trim()) return value;
  return { ...item, displayName: item.computedTitle };
}
function preserveComputedTitles(sdk:ReadStatusSDK): void {
  const conversations = sdk.internal.conversation, notifications = new Map<string,boolean>();
  const observe = (value:unknown):unknown => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const room = value as Record<string,unknown>;
      if (typeof room.id === 'string') {
        notifications.delete(room.id);
        if (Array.isArray(room.tags)) notifications.set(room.id,!room.tags.includes('MESSAGE_NOTIFICATIONS_OFF') && !room.tags.includes('IGNORED'));
        if (notifications.size > 1000) notifications.delete(notifications.keys().next().value!);
      }
    }
    return computedTitle(value);
  };
  const list = conversations.list.bind(conversations), get = conversations.get.bind(conversations);
  // Keep the SDK's promise implementation as well as its method receiver/args.
  conversations.list = (...args) => list(...args).then(items => Array.isArray(items) ? items.map(observe) : items);
  conversations.get = (...args) => get(...args).then(observe);
  const decorate = (value:unknown):any => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const room = value as Record<string,unknown>;
    const match = typeof room.id === 'string' ? /^ciscospark:\/\/[^/]{1,128}\/ROOM\/([^/]+)$/.exec(Buffer.from(room.id,'base64').toString('utf8')) : null;
    const enabled = match ? notifications.get(match[1]!) : undefined;
    return {...room,...(enabled !== undefined ? {notifications:enabled} : {})};
  };
  // The pinned public room projection discards per-user mute tags.
  const all = sdk.rooms.listWithReadStatus.bind(sdk.rooms), one = sdk.rooms.getWithReadStatus.bind(sdk.rooms);
  sdk.rooms.listWithReadStatus = () => all().then(value=>({...value,items:value.items.map(decorate)}));
  sdk.rooms.getWithReadStatus = id => one(id).then(decorate);
}
/** The pinned public delete projection drops object/parent type. Exclude known
 * reaction activities BEFORE that lossy projection; keep post/share/reply and
 * genuine message deletion behavior unchanged. No new listener or raw IPC. */
function isolateReactionEvents(messages: ReadStatusSDK['messages']): void {
  const plugin = messages as typeof messages & { onWebexApiEvent(event: unknown): void };
  const original = plugin.onWebexApiEvent;
  if (typeof original !== 'function') throw new Error('Unsupported message event adapter.');
  plugin.onWebexApiEvent = function(event: unknown): void {
    const value = event as { data?: { activity?: { parent?: { type?: unknown }; object?: { objectType?: unknown; parent?: { type?: unknown } } } } } | null;
    const activity = value?.data?.activity, object = activity?.object;
    if (activity?.parent?.type === 'reaction' || object?.parent?.type === 'reaction'
      || ['reaction2', 'reaction2summary', 'reaction2selfsummary'].includes(String(object?.objectType).toLowerCase())) return;
    original.call(this,event);
  };
}
/** Keep the actual public updateLastSeen -> acknowledge -> prepare -> submit
 * chain, including all SDK payload/encryption transforms. Only the receipt's
 * request boundary changes. SDK 3.13 submit catches key-rotation bodies and
 * launches detached requests, so no response/error capable of requesting a
 * replay may escape this boundary. Non-receipt discovery is untouched.
 *
 * The pinned Node transport runs AFTER the SDK request interceptors. Its private
 * per-request closure survives SDK shallow/deep option clones, independently
 * limiting transport admission even if an interceptor tries to replay later.
 * Native HTTP redirects are also disabled; a redirected/uncertain receipt fails
 * closed rather than turning into another POST (or a misleading successful GET).
 */
function oneShotReceipts(conversations: Conversations, transport: (options: RequestOptions) => Promise<Response>): void {
  const request = conversations.request.bind(conversations);
  const failure = () => new Error('Read receipt submission failed; nothing was retried.');
  conversations.request = async options => {
    if (options.body?.verb !== 'acknowledge') return request(options);
    if (options.method !== 'POST' || options.request) throw failure();
    let submitted = false;
    const once = async (native: RequestOptions): Promise<Response> => {
      if (submitted || native.method !== 'POST' || native.body?.verb !== 'acknowledge') throw failure();
      submitted = true; // consumed even on synchronous failure or an unknown outcome
      native.followRedirect = false; native.followAllRedirects = false; native.maxRedirects = 0;
      // request@2.88 can internally retry ECONNRESET on a reused forever-agent
      // socket. A fresh, unpooled connection has no such replay path.
      native.pool = false; native.agent = false; native.forever = false;
      native.shouldRefreshAccessToken = false;
      const response = await transport(native);
      const body = response.body as { errorCode?: unknown; code?: unknown } | undefined;
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300
        || response.headers?.['cisco-location'] || response.headers?.location
        || body?.errorCode !== undefined || body?.code === 404100) throw failure();
      return response;
    };
    try {
      return await request({ ...options, request: once, followRedirect: false, followAllRedirects: false,
        maxRedirects: 0, shouldRefreshAccessToken: false });
    } catch {
      // In particular, never expose the three key-rotation error bodies to
      // submit's catch handler. It otherwise sends a detached follow-up request.
      throw failure();
    }
  };
}
/** Only the optional, isolated worker imports the SDK. No meeting, media or UI plugins. */
export function createReadStatusSDK(credentials: AccessCredentials): ReadStatusSDK {
  const require = createRequire(new URL('../optional/read-status-sdk/package.json', import.meta.url));
  // This compatibility boundary depends on the 3.13 request override and Node
  // transport contracts. An unreviewed SDK/transport upgrade must fail closed.
  for (const plugin of ['webex-core', 'http-core', 'internal-plugin-conversation', 'internal-plugin-encryption', 'internal-plugin-mercury', 'plugin-memberships']) {
    if (require(`@webex/${plugin}/package.json`).version !== '3.13.0') throw new Error('Unsupported read-status SDK.');
  }
  if (require('request/package.json').version !== '2.88.2') throw new Error('Unsupported read-status transport.');
  const transport = require('@webex/http-core/dist/request/request.js').default;
  if (typeof transport !== 'function') throw new Error('Unsupported read-status transport.');
  for (const plugin of ['plugin-logger', 'plugin-authorization', 'internal-plugin-device', 'plugin-people', 'plugin-rooms', 'plugin-memberships', 'plugin-messages']) require(`@webex/${plugin}`);
  const { default: Core, MemoryStoreAdapter } = require('@webex/webex-core');
  const sdk = new Core({ credentials: { access_token: credentials.token, scope: credentials.scope,
    expires: Math.min(credentials.expiresAt, Date.now() + 2_000_000_000) }, config: {
    sdkType: 'webex', environment: 'production',
    logger: { level: 'silent', bufferLogLevel: 'silent', historyLength: 0 },
    storage: { boundedAdapter: MemoryStoreAdapter, unboundedAdapter: MemoryStoreAdapter },
    device: { ephemeral: true }, services: { validateCatalogUrls: true },
  } }) as ReadStatusSDK;
  preserveComputedTitles(sdk);
  isolateReactionEvents(sdk.messages);
  oneShotReceipts(sdk.internal.conversation, transport);
  return sdk;
}
