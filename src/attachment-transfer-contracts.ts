/** Credit/settlement DTOs only, independent of the timed transfer owner. */
export interface AttachmentPull { requestId: number; transferId: string; seq: number; offset: number }
export interface AttachmentComplete { requestId: number; transferId: string; chunks: number; decodedBytes: number; encodedBytes: number; sha256: string }
export const transferInteger = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
export const transferIdentity = (p: Record<string, unknown>): boolean => transferInteger(p.requestId, 0x7fffffff)
  && (p.requestId as number) > 0 && typeof p.transferId === 'string' && /^[a-f0-9]{32}$/.test(p.transferId);
