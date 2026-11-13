import type { AccessCredentials, AuthProblem, CredentialReply } from '../auth-protocol.js';

/** SDK refreshCallback bridge. Never receives an OAuth client secret/refresh token. */
export class CredentialRefresh {
  private sequence = 0;
  private closed = false;
  private pending?: { id: number; promise: Promise<AccessCredentials>; resolve(value: AccessCredentials): void;
    reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  constructor(private request: (id: number) => void, private failed: (reason: AuthProblem) => void, private timeoutMs = 20_000) {}
  refresh(): Promise<AccessCredentials> {
    if (this.closed) return Promise.reject(new Error('Credential refresh closed.'));
    if (this.pending) return this.pending.promise;
    const id = this.sequence = this.sequence % 0xffffffff + 1;
    let resolve!: (value: AccessCredentials) => void, reject!: (error: Error) => void;
    const promise = new Promise<AccessCredentials>((yes, no) => { resolve = yes; reject = no; });
    const timer = setTimeout(() => this.receive({ type: 'oauth-failed', requestId: id, reason: 'failed' }), this.timeoutMs);
    this.pending = { id, promise, resolve, reject, timer };
    try { this.request(id); } catch { this.receive({ type: 'oauth-failed', requestId: id, reason: 'failed' }); }
    return promise;
  }
  receive(reply: CredentialReply): void {
    const pending = this.pending;
    if (!pending || this.closed || pending.id !== reply.requestId) return;
    clearTimeout(pending.timer); this.pending = undefined;
    if (reply.type === 'oauth-token' && reply.credentials.expiresAt > Date.now()) pending.resolve(reply.credentials);
    else {
      this.closed = true;
      const reason = reply.type === 'oauth-failed' ? reply.reason : 'expired';
      this.failed(reason); pending.reject(new Error(`OAuth renewal ${reason}; sign in again.`));
    }
  }
  close(): void {
    this.closed = true;
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Credential refresh canceled.')); }
  }
}
