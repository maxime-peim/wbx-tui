/** RESEARCH ONLY. Not a provider, runtime approval, RPC, or service wire schema.
 * This fixture may be imported only from test/research. */
export interface CandidateBinding {
  endpoint: string;
  conversation: string;
  actor: string;
  action: 'add' | 'remove-own';
  parent: string;
  emoji: string;
  hmac: string;
  ownReaction: string;
}
export interface CandidateResponse { statusCode?: number; headers?: Record<string, unknown>; body?: any }
export type CandidateRequest = Record<string, any>;
const failed = () => new Error('Research reaction candidate refused or unconfirmed; no replay.');
export class CandidateSlot {
  private holder?: symbol;
  busy(): boolean { return this.holder !== undefined; }
  acquire(): () => void {
    if (this.busy()) throw failed();
    const holder = this.holder = Symbol('research physical admission');
    return () => { if (this.holder === holder) this.holder = undefined; };
  }
}
function matchesActivity(body: any, binding: CandidateBinding, native: boolean): boolean {
  if (!body || body.objectType !== 'activity' || body.target?.id !== binding.conversation || body.target?.objectType !== 'conversation'
    || body.actor?.id !== binding.actor || body.actor?.objectType !== 'person' || body.recipients !== undefined) return false;
  return binding.action === 'add'
    ? body.verb === 'add' && body.parent?.type === 'reaction' && body.parent.id === binding.parent
      && body.object?.objectType === 'reaction2' && body.object.hmac === binding.hmac
      && (native ? typeof body.object.displayName === 'string' && body.object.displayName !== binding.emoji : body.object.displayName === binding.emoji)
    : body.verb === 'delete' && body.object?.objectType === 'activity' && body.object.id === binding.ownReaction && body.parent === undefined;
}
function matchesResponse(response: CandidateResponse, binding: CandidateBinding): boolean {
  // Synthetic echo contract ONLY. The real provider acknowledgement is still a
  // release gate; absence/malformed/redirect/error-like bodies never prove success.
  return !!response && typeof response.statusCode === 'number' && response.statusCode >= 200 && response.statusCode < 300
    && !Object.keys(response.headers ?? {}).some(name => ['location','cisco-location'].includes(name.toLowerCase()))
    && response.body?.errorCode === undefined && response.body?.code === undefined
    && typeof response.body?.id === 'string' && !!response.body.id && matchesActivity(response.body,binding,true);
}
export function installCandidate(conversation: { request(options: CandidateRequest): Promise<CandidateResponse> },
  transport: (options: CandidateRequest) => Promise<CandidateResponse>, inputBinding: CandidateBinding,
  slot: CandidateSlot, signal: AbortSignal): { restore(): void } {
  const binding = Object.freeze({ ...inputBinding });
  const original = conversation.request;
  let claimed = false, consumed = false;
  const once = async (options: CandidateRequest): Promise<CandidateResponse> => {
    if (consumed) throw failed();
    consumed = true; // invalid/replayed native options cannot become usable later.
    if (signal.aborted || options.method !== 'POST' || options.uri !== binding.endpoint
      || !matchesActivity(options.body,binding,true)) throw failed();
    const release = slot.acquire();
    Object.assign(options,{ followRedirect:false,followAllRedirects:false,maxRedirects:0,shouldRefreshAccessToken:false,
      pool:false,agent:false,forever:false });
    let stop!: () => void;
    const stopped = new Promise<never>((_resolve,reject) => {
      stop = () => reject(failed()); signal.addEventListener('abort',stop,{ once:true });
    });
    const physical = Promise.resolve().then(() => {
      if (signal.aborted) throw failed();
      return transport(options);
    }).then(response => {
      if (!matchesResponse(response,binding)) throw failed();
      return response;
    }).catch(() => { throw failed(); });
    // No error body escapes to SDK auth/redirect/submit rotation handlers.
    // Logical cancellation never releases a still-running native request.
    void physical.then(release,release);
    if (signal.aborted) stop();
    try { return await Promise.race([physical,stopped]); }
    finally { signal.removeEventListener('abort',stop); }
  };
  const guarded = async (options: CandidateRequest): Promise<CandidateResponse> => {
    if (claimed || signal.aborted || slot.busy() || options.method !== 'POST' || options.request
      || options.url !== binding.endpoint || !matchesActivity(options.body,binding,false)) throw failed();
    claimed = true;
    try {
      return await original.call(conversation,{ ...options,request:once,followRedirect:false,followAllRedirects:false,
        maxRedirects:0,shouldRefreshAccessToken:false });
    } catch { throw failed(); }
  };
  conversation.request = guarded;
  return { restore() { if (conversation.request === guarded) conversation.request = original; } };
}
