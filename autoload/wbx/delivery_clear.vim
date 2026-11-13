" Matching successful-delivery draft clear/reply reset/local retry; never send or resolve uncertainty.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#delivery_clear#new(ports) abort
  return {'ports':a:ports}
endfunction
function! wbx#delivery_clear#clear(owner, pending, session, retries, ...) abort
  let pending = a:pending
  if get(get(call(a:owner.ports.State, []), 'localContext', {}), 'sessionId', '') !=# a:session || get(call(a:owner.ports.State, []), 'state', '') !=# 'ready'
        \ || !wbx#view#owned(pending.bufnr, 'compose') || getbufvar(pending.bufnr, 'wbx_room') !=# pending.roomId
        \ || getbufvar(pending.bufnr, 'wbx_parent', '') !=# get(pending, 'parentId', '')
        \ || !wbx#uploads#same(pending) || getbufvar(pending.bufnr, 'wbx_format', 'plain') !=# get(pending, 'format', 'plain')
        \ || getbufvar(pending.bufnr, 'changedtick') != pending.tick || join(getbufline(pending.bufnr, 1, '$'), "\n") !=# pending.text | return | endif
  call setbufvar(pending.bufnr, 'wbx_confirmed_sent', {'tick': pending.tick, 'roomId': pending.roomId,
        \ 'parentId': get(pending, 'parentId', ''), 'format': get(pending, 'format', 'plain'),
        \ 'attachmentRevision': getbufvar(pending.bufnr, 'wbx_attachment_revision', 0)})
  let cleared = 0
  try
    let cleared = call(a:owner.ports.Write, [pending.bufnr, ['']]) && getbufline(pending.bufnr, 1, '$') ==# ['']
  catch /^Vim/
    " Completion/expression callbacks can temporarily hold textlock while an ACK
    " arrives. A confirmed send must not lose its only chance to clear the draft.
  endtry
  if cleared
    call setbufvar(pending.bufnr, 'wbx_quote_sources', [])
    if !empty(get(pending, 'parentId', '')) && wbx#drafts#reply(pending.roomId) ==# pending.parentId
      call wbx#drafts#reply(pending.roomId, '')
    endif
    call wbx#drafts#observe(pending.bufnr)
    call wbx#draft_persistence#observe(pending.bufnr)
    if a:0 | call call(a:owner.ports.Render, []) | endif
  elseif a:retries > 0 && !has_key(pending, 'attachmentId')
    " Retry only the local write, NEVER the send. Every attempt rechecks exact
    " text/revision/format/destination/session, so newer work always wins.
    call timer_start(10, function('wbx#delivery_clear#clear', [a:owner, pending, a:session, a:retries - 1]))
  else
    call call(a:owner.ports.Notify, ['Message sent, but the editor could not clear its unchanged draft. Do not send it again.'])
  endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
