/** Inert cross-device observations only; never a join target or call owner. */
import { createHash } from 'node:crypto';
import { notificationExcerpt } from './read-status-protocol.js';

export const JOINED_MEETINGS_LIMITS = Object.freeze({ loci: 200, devices: 64, cards: 3, bytes: 1_048_576,
  intervalMs: 60_000, minimumMs: 10_000, timeoutMs: 8000, freshMs: 90_000 });
export interface JoinedMeeting { id: string; title: string }
export interface JoinedMeetingsSnapshot {
  state: 'off' | 'loading' | 'ready' | 'unavailable';
  partial: true;
  items: JoinedMeeting[];
  observedAt?: number;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function serviceURL(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}
export function joinedMeetingTitle(value: unknown): string {
  return Array.from(notificationExcerpt(value)).slice(0, 120).join('').trim();
}
/** The account-scoped loci response supplies self; participants/presence never prove self participation. */
export function parseJoinedMeetings(body: unknown, deviceUrl: unknown): JoinedMeeting[] {
  // shortcut: federation URLs are not followed, add catalog-verified federation only after its boundary is tested.
  if (!serviceURL(deviceUrl) || !object(body) || !Array.isArray(body.loci) || body.loci.length > JOINED_MEETINGS_LIMITS.loci
    || Buffer.byteLength(JSON.stringify(body)) > JOINED_MEETINGS_LIMITS.bytes
    || body.remoteLocusClusterUrls !== undefined && (!Array.isArray(body.remoteLocusClusterUrls) || body.remoteLocusClusterUrls.length))
    throw new Error('Joined meeting discovery unavailable.');
  const items = new Map<string, JoinedMeeting>();
  for (const locus of body.loci) {
    if (!object(locus) || !serviceURL(locus.url) || !object(locus.fullState) || locus.fullState.state !== 'ACTIVE'
      || locus.fullState.active !== undefined && locus.fullState.active !== true
      || !object(locus.self) || locus.self.state !== 'JOINED' || locus.self.removed !== undefined && locus.self.removed !== false
      || !Array.isArray(locus.self.devices) || locus.self.devices.length > JOINED_MEETINGS_LIMITS.devices) continue;
    const devices = locus.self.devices.filter(object);
    // Do not label our own call, lobby, paired observer or ringing device as joined elsewhere.
    if (devices.some(device => device.url === deviceUrl && device.state === 'JOINED')
      || !devices.some(device => serviceURL(device.url) && device.url !== deviceUrl && device.state === 'JOINED'
        && (device.intent === undefined || object(device.intent) && device.intent.type === 'CALL'))) continue;
    const info = object(locus.info) ? locus.info : {};
    const id = createHash('sha256').update(locus.url).digest('hex');
    items.set(id, { id, title: joinedMeetingTitle(info.topic) || joinedMeetingTitle(info.webExMeetingName) || 'Meeting' });
  }
  return [...items.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, JOINED_MEETINGS_LIMITS.cards);
}
export function validJoinedMeetings(value: unknown): value is JoinedMeetingsSnapshot {
  if (!object(value) || !['off', 'loading', 'ready', 'unavailable'].includes(String(value.state)) || value.partial !== true
    || !Array.isArray(value.items) || value.items.length > JOINED_MEETINGS_LIMITS.cards
    || Object.keys(value).some(key => !['state', 'partial', 'items', 'observedAt'].includes(key))) return false;
  if (value.state !== 'ready') return value.items.length === 0 && value.observedAt === undefined;
  return Number.isSafeInteger(value.observedAt) && (value.observedAt as number) >= 0
    && value.items.every(item => object(item) && typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id)
      && typeof item.title === 'string' && !!item.title && item.title === joinedMeetingTitle(item.title) && Object.keys(item).length === 2)
    && new Set(value.items.map(item => item.id)).size === value.items.length;
}
