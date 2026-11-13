" One explicit destination-bound recovery request. Draft evidence and RPC correlation have other owners.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#delivery_recovery#new(ports) abort
  return {'ports':a:ports}
endfunction
function! wbx#delivery_recovery#resolve(owner) abort
  if !wbx#draft_persistence#ready() | return | endif
  let room = get(call(a:owner.ports.State, []), 'room', v:null)
  if type(room) != v:t_dict
    call call(a:owner.ports.Notify, ['Select the space whose delivery you have checked first.'])
    return
  endif
  if !call(a:owner.ports.Supports, ['delivery-resolution-v1']) || wbx#drafts#pending(room.id)
    call call(a:owner.ports.Notify, ['Destination-bound delivery resolution unavailable/busy; uncertainty retained. Update backend deliberately; no legacy reset was sent.']) | return
  endif
  let context = {'origin': wbx#view#intent(), 'room': room.id, 'evidence': wbx#drafts#evidence(room.id)}
  call call(a:owner.ports.Request, ['delivery.resolveBound', {'roomId': room.id}, function('s:resolved', [a:owner, context])])
endfunction
function! s:resolved(owner, context, response) abort
  if has_key(a:response, 'error') || !wbx#view#intent_valid(a:context.origin) | return | endif
  let value = get(a:response, 'result', {})
  if type(value) != v:t_dict || get(value, 'roomId', '') !=# a:context.room || keys(value) !=# ['roomId']
    call call(a:owner.ports.ProtocolError, []) | return
  endif
  if wbx#drafts#resolve(a:context.room, a:context.evidence)
    call wbx#draft_persistence#resolved(a:context.room)
  endif
  call call(a:owner.ports.Render, [])
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
