/** A reaction-specific fence. The existing receipt/metadata request path is untouched. */
export class ReactionTransportError extends Error {
  constructor(readonly refused = false) { super('Reaction unconfirmed; no automatic retry.'); }
}
interface Request { method?:string; url?:string; uri?:string; body?:any; request?:unknown; [key:string]:any }
interface Response { statusCode?:number; headers?:Record<string,unknown>; body?:any }
export function fenceReaction(conversation:{ request(options:Request):Promise<Response> }, transport:(options:Request)=>Promise<Response>,
  binding:{ endpoint:string; room:string; actor:string; parent:string; action:'add'|'remove'; reaction:string; own?:string }, signal:AbortSignal) {
  const bound = Object.freeze({ ...binding }), original = conversation.request;
  let claimed = false, consumed = false, attempted = false, hmac:unknown;
  const failure = () => new ReactionTransportError();
  function matches(body:any,native:boolean):boolean {
    return !!body && body.objectType === 'activity' && body.actor?.id === bound.actor && body.actor?.objectType === 'person'
      && body.target?.id === bound.room && body.target?.objectType === 'conversation' && body.recipients === undefined
      && (bound.action === 'add' ? body.verb === 'add' && body.parent?.type === 'reaction' && body.parent.id === bound.parent
        && body.object?.objectType === 'reaction2' && typeof body.object.hmac === 'string'
        && (native ? body.object.hmac === hmac && typeof body.object.displayName === 'string' && body.object.displayName !== bound.reaction
          : body.object.displayName === bound.reaction)
        : body.verb === 'delete' && body.object?.objectType === 'activity' && body.object.id === bound.own && body.parent === undefined);
  }
  const once = async (options:Request):Promise<Response> => {
    if (consumed) throw failure(); consumed = true;
    if (signal.aborted || options.method !== 'POST' || options.uri !== bound.endpoint || !matches(options.body,true)) throw failure();
    Object.assign(options,{ followRedirect:false,followAllRedirects:false,maxRedirects:0,shouldRefreshAccessToken:false,pool:false,agent:false,forever:false });
    attempted = true;
    let response:Response;
    try { response = await transport(options); } catch { throw failure(); }
    const redirect = Object.keys(response.headers ?? {}).some(k => ['location','cisco-location'].includes(k.toLowerCase()));
    if (redirect || response.body?.errorCode !== undefined || response.body?.code !== undefined) throw failure();
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300)
      throw new ReactionTransportError([400,401,403,404,410,413,415,422,429].includes(response.statusCode ?? 0));
    return response;
  };
  const guarded = async (options:Request):Promise<Response> => {
    // Existing background metadata reads must not be captured by the mutation
    // fence. Receipts/writes have separate mutual admission at both IPC ends.
    if (options.method === 'GET') return original.call(conversation,options);
    if (claimed || signal.aborted || options.request || options.method !== 'POST' || options.url !== bound.endpoint || !matches(options.body,false)) throw failure();
    claimed = true; hmac = options.body.object.hmac;
    try { return await original.call(conversation,{ ...options,request:once,followRedirect:false,followAllRedirects:false,maxRedirects:0,shouldRefreshAccessToken:false }); }
    catch (error) { throw error instanceof ReactionTransportError ? error : failure(); }
  };
  conversation.request = guarded;
  return { attempted:()=>attempted,restore() { if (conversation.request === guarded) conversation.request = original; } };
}
