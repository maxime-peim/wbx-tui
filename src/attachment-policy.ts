/** Representation hints only. No executable settings or content authority. */
export interface AttachmentSelector { key: string; use: 'original' | 'native' }
export interface AttachmentResolveOptions { action: 'open' | 'download'; selectors: AttachmentSelector[] }
export interface ResolvedAttachment {
  meta: { id: string; name: string; mime: string; sourceBytes: number };
  body: (
    | { kind: 'original'; decodedBytes: number; text: boolean }
    | { kind: 'png'; decodedBytes: number; width: number; height: number; lines: string[] }
  ) & { payload: { mode: 'inline'; encoding: 'base64'; data: string } };
}
export const ATTACHMENT_POLICY_LIMITS = Object.freeze({ entries: 128, bytes: 24_576, keyBytes: 129 });
export const attachmentMime = (value: string): string => {
  const mime = value.split(';')[0]!.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/.test(mime) ? mime : 'application/octet-stream';
};
export const rasterMime = (mime: string): boolean => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
export function attachmentSelectorKey(key: unknown): key is string {
  // Extensions contain no dots: only the final suffix can match. "." is the
  // native extensionless key. Unreachable local configuration keys stay inert.
  return typeof key === 'string' && key.length <= ATTACHMENT_POLICY_LIMITS.keyBytes
    && (/^\.[a-z0-9_ -]{0,118}$/.test(key) || /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/.test(key));
}
export function validAttachmentOptions(value: unknown): value is AttachmentResolveOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['action', 'selectors'].includes(key)) || !['open', 'download'].includes(v.action as string)
    || !Array.isArray(v.selectors) || v.selectors.length > ATTACHMENT_POLICY_LIMITS.entries
    || v.action === 'download' && v.selectors.length) return false;
  const keys = new Set<string>();
  for (const selector of v.selectors) {
    if (!selector || typeof selector !== 'object' || Array.isArray(selector)
      || Object.keys(selector).some(key => !['key', 'use'].includes(key))
      || !attachmentSelectorKey(selector.key) || !['original', 'native'].includes(selector.use)
      || keys.has(selector.key)) return false;
    keys.add(selector.key);
  }
  return Buffer.byteLength(JSON.stringify(v.selectors)) <= ATTACHMENT_POLICY_LIMITS.bytes;
}
export function attachmentExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return '.' + (dot < 0 ? '' : name.slice(dot + 1).toLowerCase());
}
export function attachmentOriginal(name: string, mime: string, options: AttachmentResolveOptions): boolean {
  if (options.action === 'download') return true;
  const extension = options.selectors.find(item => item.key === attachmentExtension(name));
  const selected = extension ?? options.selectors.find(item => item.key === mime);
  return selected?.use === 'original' || !rasterMime(mime);
}
