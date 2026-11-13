/** Shared authenticated-profile partition and optional storage identity; no OAuth or file I/O. */
import type { AccessCredentials } from './auth-protocol.js';
import type { OAuthConfig } from './oauth.js';
import { spacesCacheKey, spacesCacheScope, type spacesCacheAccount } from './spaces-cache.js';

export interface StorageIdentityContext {
  config: string;
  signal?: AbortSignal;
  /** Exact requesting application session and ready phase, not selected-room authority. */
  current(): boolean;
  /** Live grant/token evidence; renewal does not create another identity lifetime. */
  access(): AccessCredentials;
}
export class StorageIdentityError extends Error {
  constructor(readonly code: -32003 | -32004, message: string) { super(message); }
}
export class VerifiedStorageIdentity {
  private binding?: { profile: OAuthConfig };
  private verified?: string;
  private pending?: Promise<string>;
  constructor(private readonly account: typeof spacesCacheAccount) {}
  /** Configure only after authentication; do not perform optional identity/file work. */
  configure(profile: OAuthConfig): void {
    this.reset();
    this.binding = { profile: { clientId: profile.clientId, redirectUri: profile.redirectUri, scopes: [...profile.scopes] } };
  }
  reset(): void { this.binding = undefined; this.verified = undefined; this.pending = undefined; }
  /** Partition an independently authenticated self observation; no identity read/cache adoption. */
  partition(config: string, account: string): string {
    if (!this.binding) throw new StorageIdentityError(-32003, 'Authenticated profile unavailable.');
    return spacesCacheKey(config, this.binding.profile, account);
  }
  async key(context: StorageIdentityContext): Promise<string> {
    const access = context.access();
    if (!context.current() || !spacesCacheScope(access.scope) || Date.now() >= access.expiresAt) {
      throw new StorageIdentityError(-32003, 'Draft account identity requires the existing People read grant; no grant was added.');
    }
    if (this.verified) return this.verified;
    if (this.pending) return this.pending;
    const binding = this.binding, config = context.config, signal = context.signal;
    if (!binding || !signal) throw new StorageIdentityError(-32003, 'Verified draft account unavailable.');
    const pending = this.pending = (async () => {
      const account = await this.account(access, signal);
      if (this.binding !== binding || !context.current() || !spacesCacheScope(context.access().scope))
        throw new StorageIdentityError(-32004, 'Draft account changed.');
      return this.verified = spacesCacheKey(config, binding.profile, account);
    })();
    try { return await pending; }
    finally { if (this.pending === pending) this.pending = undefined; }
  }
}
