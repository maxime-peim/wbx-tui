" Accepted delivery coordination only. Drafts own exact pending/uncertainty; clear owns native text/retry.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#delivery_ingress#new(ports) abort
  return {'ports':a:ports}
endfunction
function! wbx#delivery_ingress#observe(previous, next) abort
  if get(get(a:previous, 'localContext', {}), 'sessionId', '') !=# get(get(a:next, 'localContext', {}), 'sessionId', '')
        \ || index(['idle', 'failed'], get(a:next, 'state', '')) >= 0 && get(a:next, 'state', '') !=# get(a:previous, 'state', '')
    " Retire old request authority, not possible-write evidence. No replay or
    " new session ledger: these are the application's already-accepted states.
    call wbx#drafts#disconnect()
  endif
endfunction
function! wbx#delivery_ingress#receive(owner, result) abort
  let outcome = wbx#drafts#delivery(a:result)
  if !outcome.known
    return
  endif
  if !outcome.valid
    call call(a:owner.ports.ProtocolError, [])
    return
  endif
  let pending = outcome.pending
  if a:result.status ==# 'sent'
    call wbx#unread#sent(a:result.roomId, get(a:result, 'messageId', ''))
    call wbx#notifications#sent(a:result.roomId, get(a:result, 'messageId', ''))
  endif
  if a:result.status ==# 'sent'
    call call(a:owner.ports.Clear, [pending, get(get(call(a:owner.ports.State, []), 'localContext', {}), 'sessionId', ''), 3])
  endif
  call wbx#uploads#delivered(pending, a:result)
  call wbx#drafts#observe(pending.bufnr)
  call call(a:owner.ports.Notify, [a:result.message])
  call call(a:owner.ports.Render, [])
  call call(a:owner.ports.Event, ['WbxDelivery', deepcopy(a:result)])
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
