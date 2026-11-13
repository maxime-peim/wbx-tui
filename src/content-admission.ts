export interface ContentLease { readonly token: symbol; release(): void }
type Role = 'preview' | 'explicit' | 'typed-open';
/** Native work, not caller promises. Shared for the lifetime of an editor owner. */
export class ContentAdmission {
  private explicit = false;
  private image = false;
  private role?: Role;
  private lease?: { token: symbol; physical: number; released: boolean };
  private waiter?: { wake(): void; cancel(): void };
  private acquireTyped(signal: AbortSignal, valid: () => boolean): ContentLease {
    if (signal.aborted || !valid() || this.explicit || this.image) throw new Error('Typed content canceled before admission.');
    const owner: NonNullable<ContentAdmission['lease']> = { token: Symbol('typed-open'), physical: 0, released: false };
    this.lease = owner;
    this.explicit = this.image = true; this.role = 'typed-open';
    return { token: owner.token, release: () => {
      owner.released = true;
      if (this.lease === owner) this.releaseLease();
    } };
  }
  tryTyped(signal: AbortSignal, valid: () => boolean): ContentLease | undefined {
    return !this.image && !this.explicit && !this.waiter ? this.acquireTyped(signal, valid) : undefined;
  }
  async run<T>(explicit: boolean, image: boolean, work: () => Promise<T>, lease?: ContentLease): Promise<T> {
    const owner = lease && this.lease?.token === lease.token ? this.lease : undefined;
    if (lease && !owner || owner?.released || explicit && this.explicit && !owner || image && this.image && !owner) throw new Error('Content work is busy. Retry explicitly after it finishes.');
    if (owner) {
      if (owner.physical) throw new Error('Content lease already in use.');
      owner.physical++;
      try { return await work(); } finally { owner.physical--; this.releaseLease(); }
    }
    if (explicit) this.explicit = true;
    if (image) { this.image = true; this.role = explicit ? 'explicit' : 'preview'; }
    try { return await work(); }
    finally {
      if (explicit) this.explicit = false;
      if (image) { this.image = false; this.role = undefined; }
      this.waiter?.wake();
    }
  }
  /** Called only by the worker's typed-intent owner, never by API retry logic. */
  reserveTyped(signal: AbortSignal, valid: () => boolean): Promise<ContentLease> {
    if (signal.aborted || !valid() || this.explicit || this.lease || this.waiter || this.image && this.role !== 'preview') return Promise.reject(new Error('Typed content unavailable or busy.'));
    const acquire = () => this.acquireTyped(signal, valid);
    if (!this.image) return Promise.resolve(acquire());
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const clear = () => {
        clearTimeout(timer); signal.removeEventListener('abort', cancel);
        if (this.waiter === waiter) this.waiter = undefined;
      };
      const cancel = () => { clear(); reject(new Error('Typed content wait canceled or expired. Nothing was retried.')); };
      const waiter = { cancel, wake: () => {
        if (this.image || this.explicit) return;
        clear();
        try { resolve(acquire()); } catch (error) { reject(error); }
      } };
      this.waiter = waiter;
      timer = setTimeout(cancel, 10_000);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
  }
  private releaseLease(): void {
    if (!this.lease?.released || this.lease.physical) return;
    this.lease = undefined; this.explicit = this.image = false; this.role = undefined;
    this.waiter?.wake();
  }
}
