/** Bounded inert identity/display/query policy. No provider, storage or timers. */
export const peopleId = (value: unknown): value is string => typeof value === 'string' && value !== 'me'
  && /^[A-Za-z0-9_+-][A-Za-z0-9_+/-]{0,511}={0,2}$/.test(value);
export const SENDER_NAME_LIMITS = Object.freeze({ relevant: 128, cache: 256, pending: 32, concurrency: 2,
  intervalMs: 1000, timeoutMs: 8000, freshMs: 6 * 3600_000, ageMs: 24 * 3600_000, negativeMs: 30_000, chars: 120 });
const unsafe = /[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;
export function senderName(value: unknown): string {
  return typeof value === 'string' ? Array.from(value.slice(0, 4096).replace(/[\ud800-\udfff]/gu, '\ufffd')
    .replace(unsafe, ' ').replace(/\s+/gu, ' ').trim()).slice(0, SENDER_NAME_LIMITS.chars).join('').trim() : '';
}
export const validSenderName = (value: unknown): value is string => typeof value === 'string' && !!value && value === senderName(value);
export const DIRECTORY_LIMITS = Object.freeze({ page: 50, retained: 250, pages: 5, ageMs: 120_000, queryBytes: 480 });
export function validDirectoryQuery(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 2 && value.length <= 240 && [...value].length >= 2 && [...value].length <= 120
    && value.trim() === value && Buffer.byteLength(value) <= DIRECTORY_LIMITS.queryBytes
    && !/[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff*]/u.test(value);
}
