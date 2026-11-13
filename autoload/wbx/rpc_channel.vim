" Request correlation/startup queue only. No buffers, views, domain state or jobs.
" The caller validates envelopes and supplies transport/status/notification ports.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#rpc_channel#new(ports) abort
  return {'next':0, 'queue':[], 'pending':{}, 'ports':a:ports}
endfunction
function! wbx#rpc_channel#reset(channel) abort
  " Transport loss forgets callbacks, never domain uncertainty or native text.
  " IDs remain monotonic so an old transport reply cannot address a new request.
  let a:channel.pending = {}
  let a:channel.queue = []
endfunction
function! wbx#rpc_channel#next_id(channel) abort
  return a:channel.next + 1
endfunction
function! wbx#rpc_channel#diagnostics(channel) abort
  " Constant-size local evidence; no targets, provider bodies or callback export.
  return {'pending':len(a:channel.pending), 'queued':len(a:channel.queue), 'lastRequest':a:channel.next}
endfunction
function! wbx#rpc_channel#call(channel, method, params, ...) abort
  let reaction_read = index(['messages.reactions','messages.reactionsBatch'],a:method) >= 0
  " Per-request local policy; never a wire field or a method-wide error mute.
  let passive = reaction_read && a:0 == 2 && type(a:1) == v:t_func
        \ && type(a:2) == v:t_string && a:2 ==# 'passive-reactions'
  if passive && !call(a:channel.ports.Status,[]).passiveReady | return -1 | endif
  if !passive && a:method !=# 'hello' && !call(a:channel.ports.Ensure,[]) | return -1 | endif
  " Ensure may synchronously issue hello. Allocate only after that nested call.
  let a:channel.next += 1
  let id = a:channel.next
  let a:channel.pending[string(id)] = {'Callback':a:0 ? a:1 : 0, 'passive':passive, 'reactionRead':reaction_read}
  let wire = json_encode({'jsonrpc':'2.0', 'id':id, 'method':a:method, 'params':a:params}) . "\n"
  if call(a:channel.ports.Status,[]).ready || a:method ==# 'hello'
    call call(a:channel.ports.Send,[wire])
  elseif len(a:channel.queue) >= 32
    call remove(a:channel.pending,string(id))
    call call(a:channel.ports.Notify,['Backend startup queue is full; request was not sent.'])
    return -1
  else
    call add(a:channel.queue,{'id':id, 'wire':wire})
  endif
  return id
endfunction
function! wbx#rpc_channel#flush(channel) abort
  let queue = a:channel.queue
  let a:channel.queue = []
  for request in queue
    " A reentrant reset may retire the remaining old queue during a send.
    " Monotonic IDs and current pending ownership suffice; no extra epoch.
    if has_key(a:channel.pending,string(request.id))
      call call(a:channel.ports.Send,[request.wire])
    endif
  endfor
endfunction
function! wbx#rpc_channel#response(channel, message) abort
  let id = string(a:message.id)
  if !has_key(a:channel.pending,id) | return | endif
  " Retire before invoking user/domain callbacks, including reentrant requests.
  let pending = remove(a:channel.pending,id)
  if has_key(a:message,'error') && !pending.passive
    let message = pending.reactionRead ? 'Reaction summary unavailable ('
          \ . wbx#protocol#reaction_read_error(a:message) . '). Check :WebexHealth; use :WebexReactions to refresh. Nothing was sent or acknowledged.'
          \ : get(a:message.error,'message','Backend request failed.')
    call call(a:channel.ports.Notify,[message])
  endif
  let Callback = pending.Callback
  if type(Callback) == v:t_func | call call(Callback,[a:message]) | endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
