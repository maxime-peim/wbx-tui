/** Only access credentials cross the private owner → browser boundary. */
export interface AccessCredentials { token: string; expiresAt: number; scope: string }
export interface OAuthMeta { expiresAt: number; scope: string; clientId: string }
export type AuthMethod = 'token' | 'oauth';
export type AuthProblem = 'denied' | 'expired' | 'failed' | 'canceled';
export type CredentialReply = { type: 'oauth-token'; requestId: number; credentials: AccessCredentials }
  | { type: 'oauth-failed'; requestId: number; reason: AuthProblem };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const validToken = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,8192}$/.test(v);
export const validExpiry = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 8_640_000_000_000_000;
export const validScope = (v: unknown): v is string => typeof v === 'string' && v.length <= 2048 && /^[A-Za-z0-9:_ -]*$/.test(v);
export const authProblem = (v: unknown): v is AuthProblem => typeof v === 'string' && ['denied', 'expired', 'failed', 'canceled'].includes(v);
export function validAccess(v: unknown): v is AccessCredentials {
  return object(v) && Object.keys(v).every(key => ['token', 'expiresAt', 'scope'].includes(key))
    && validToken(v.token) && validExpiry(v.expiresAt) && validScope(v.scope);
}
export function validOAuthMeta(v: unknown): v is OAuthMeta {
  return object(v) && Object.keys(v).every(key => ['expiresAt', 'scope', 'clientId'].includes(key)) && validExpiry(v.expiresAt) && validScope(v.scope)
    && typeof v.clientId === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(v.clientId);
}
export const refreshId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 0xffffffff;
export function validCredentialReply(v: unknown): v is CredentialReply {
  return object(v) && refreshId(v.requestId) && (v.type === 'oauth-token' ? validAccess(v.credentials)
    && Object.keys(v).every(key => ['type', 'requestId', 'credentials'].includes(key))
    : v.type === 'oauth-failed' && authProblem(v.reason) && Object.keys(v).every(key => ['type', 'requestId', 'reason'].includes(key)));
}
