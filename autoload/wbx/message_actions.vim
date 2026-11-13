" Dedicated native edit buffers; ordinary writes/history annotations never mutate.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:serial = 0
let s:pending = {}
let s:unknown = {} " Bounded exact targets only; never replayed or evicted.
let s:evidence_serial = 0
function! s:key(context) abort
  return json_encode([a:context.roomId, a:context.messageId])
endfunction
function! s:busy(context) abort
  for pending in values(s:pending)
    if pending.context.contextId ==# a:context.contextId | return 1 | endif
  endfor
  return 0
endfunction
function! s:unknown(context) abort
  let s:evidence_serial += 1
  let s:unknown[s:key(a:context)] = {'roomId': a:context.roomId, 'messageId': a:context.messageId, 'serial': s:evidence_serial}
endfunction
function! s:pick(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! wbx#message_actions#owned(buffer) abort
  let context = getbufvar(a:buffer, 'wbx_message_context', {})
  return !empty(context) && getbufvar(a:buffer, '&buftype') ==# 'nofile'
        \ && bufname(a:buffer) ==# 'wbx://edit/' . get(context, 'contextId', '')
endfunction
function! wbx#message_actions#setup() abort
  if !wbx#message_actions#owned(bufnr('%')) | return | endif
  let b:wbx_send_hint = ''
  call wbx#history#draft()
endfunction
function! s:status(context, buffer, text) abort
  if !wbx#message_actions#owned(a:buffer) || getbufvar(a:buffer,'wbx_message_context',{}) !=# a:context | return | endif
  call setbufvar(a:buffer,'wbx_mutation_status',a:text)
  " Display-only: update visible edits even while an unrelated split is focused.
  for window in win_findbuf(a:buffer)
    call win_execute(window,'call wbx#message_actions#setup()')
  endfor
endfunction
function! wbx#message_actions#can_resolve() abort
  return wbx#message_actions#owned(bufnr('%')) || !empty(s:unknown)
endfunction
function! wbx#message_actions#invalidate() abort
  for pending in values(s:pending)
    call s:unknown(pending.context)
    if wbx#message_actions#owned(pending.buffer)
      call s:status(pending.context,pending.buffer,'unknown; disconnected; inspect exact message, then :WebexMutationResolve')
    endif
  endfor
  let s:pending = {}
  for info in getbufinfo()
    if wbx#message_actions#owned(info.bufnr) | call setbufvar(info.bufnr, 'wbx_context_stale', 1) | endif
  endfor
  if wbx#message_actions#owned(bufnr('%')) | call wbx#message_actions#setup() | endif
endfunction
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Yes, continue", 1) == 2
endfunction
function! s:notice(text) abort
  echohl WbxWarning | echomsg '[wbx-tui] ' . a:text | echohl None
endfunction
function! s:result(context, buffer, request, response) abort
  if !has_key(s:pending, a:request) | return | endif
  call remove(s:pending, a:request)
  if has_key(a:response, 'error')
    call s:unknown(a:context)
    call s:status(a:context,a:buffer,'unknown; check Webex, then :WebexMutationResolve')
    call s:notice('Mutation result unavailable. Exact target retained for :WebexMutationResolve; no automatic replay.')
    return
  endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#mutation(value) || value.contextId !=# a:context.contextId || value.requestId !=# a:request
        \ || value.roomId !=# a:context.roomId || value.messageId !=# a:context.messageId || value.action !=# a:context.action
    call s:unknown(a:context)
    call s:status(a:context,a:buffer,'unknown; invalid result; inspect exact target, then :WebexMutationResolve')
    call wbx#_protocol_error() | return
  endif
  if value.status ==# 'unknown' | call s:unknown(a:context) | endif
  if wbx#message_actions#owned(a:buffer) && getbufvar(a:buffer, 'wbx_message_context', {}) ==# a:context
    call s:status(a:context,a:buffer,value.status . (value.status ==# 'unknown' ? '; inspect Webex, then :WebexMutationResolve' : ''))
  endif
  call s:notice(value.notice)
  if wbx#message_actions#owned(bufnr('%')) | call wbx#message_actions#setup() | endif
endfunction
function! s:submit(context, buffer, params) abort
  if has_key(s:unknown, s:key(a:context)) || len(s:unknown) + len(s:pending) >= 256
    call s:notice('Unresolved mutation/budget. Check Webex and resolve explicitly; nothing was queued.') | return
  endif
  let s:serial += 1
  let request = 'mutation-' . getpid() . '-' . s:serial
  let params = extend(copy(a:params), {'contextId': a:context.contextId, 'requestId': request, 'action': a:context.action, 'conflictAccepted': v:true})
  let s:pending[request] = {'context': deepcopy(a:context), 'buffer': a:buffer}
  call s:status(a:context,a:buffer,'submitting; wait, no retry')
  if wbx#rpc('messages.actionSubmit', params, function('s:result', [a:context, a:buffer, request])) < 0
    if has_key(s:pending,request) | call remove(s:pending,request) | endif
    call s:status(a:context,a:buffer,'canceled; request not admitted; prepare afresh')
  endif
endfunction
function! s:prepared(origin, response) abort
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#message_context(value) || value.roomId !=# a:origin.room || value.messageId !=# a:origin.message || value.action !=# a:origin.action
    call wbx#_protocol_error() | return
  endif
  if !wbx#view#intent_valid(a:origin.intent)
        \ || win_getid() != a:origin.window || bufnr('%') != a:origin.buffer || b:changedtick != a:origin.tick
        \ || get(get(wbx#state(), 'room', {}), 'id', '') !=# value.roomId
    if wbx#supports('message-actions-v1') | call wbx#rpc('messages.actionDiscard', {'contextId': value.contextId}) | endif
    call s:notice('Preparation target changed; reopen explicitly. No mutation occurred.') | return
  endif
  if value.action ==# 'delete'
    if !s:confirm('Delete YOUR message ' . value.messageId . ' in space ' . value.roomId . '? This is not leaving a room. Preflight is not atomic; a concurrent edit can race with deletion.')
      call wbx#rpc('messages.actionDiscard', {'contextId': value.contextId})
      return
    endif
    if !wbx#view#intent_valid(a:origin.intent)
      call wbx#rpc('messages.actionDiscard', {'contextId': value.contextId}) | return
    endif
    call s:submit(value, 0, {'revision': 0})
    return
  endif
  " Explicit edit command may create/focus a new native buffer. Responses never
  " replace a prior draft or user file; random context makes ownership unique.
  execute 'new wbx://edit/' . value.contextId
  setlocal buftype=nofile bufhidden=hide noswapfile modifiable
  setlocal noundofile nomodeline
  let b:wbx_message_context = deepcopy(value)
  let b:wbx_mutation_status = 'prepared'
  let b:wbx_format = value.format
  call wbx#completion#sync()
  call setline(1, split(value.content, "\n", 1))
  setlocal nomodified
  setlocal filetype=wbx-edit
  call wbx#completion#sync()
  call wbx#message_actions#setup()
  call s:notice('Message edit prepared; not submitted.')
endfunction
function! wbx#message_actions#prepare(action) abort
  if !wbx#supports('message-actions-v1') | call s:notice('Message actions need an updated connected backend.') | return | endif
  if !wbx#view#owned(bufnr('%'), 'history') || wbx#view#edited(bufnr('%')) | call s:notice('Choose an unchanged native history message first.') | return | endif
  if len(s:unknown) + len(s:pending) >= 256 | call s:notice('Unresolved mutation budget reached; inspect and resolve exact targets first.') | return | endif
  let message = wbx#view#message_at(bufnr('%'), line('.'))
  let room = get(wbx#state(), 'room', v:null)
  if empty(message) || type(room) != v:t_dict | return | endif
  if has_key(s:unknown, json_encode([room.id, message])) | call s:notice('Exact mutation unresolved. Inspect Webex, then :WebexMutationResolve before preparing again.') | return | endif
  let origin = {'window': win_getid(), 'buffer': bufnr('%'), 'tick': b:changedtick, 'room': room.id,
        \ 'message': message, 'action': a:action, 'intent': wbx#view#intent()}
  call wbx#rpc('messages.actionPrepare', {'roomId': room.id, 'messageId': message, 'action': a:action}, function('s:prepared', [origin]))
endfunction
function! wbx#message_actions#submit() abort
  let context = deepcopy(get(b:, 'wbx_message_context', {}))
  if !wbx#supports('message-actions-v1') || !wbx#message_actions#owned(bufnr('%')) | return | endif
  if s:busy(context) | call s:notice('This mutation is pending. No action was queued.') | return | endif
  if get(b:, 'wbx_context_stale', 0) || get(b:, 'wbx_mutation_status', '') =~# '^\%(changed\|conflict\|canceled\|unknown\)'
    call s:notice('Preparation completed/canceled/stale or unresolved. Check Webex, resolve unknown results and prepare afresh explicitly.') | return
  endif
  let origin = wbx#view#intent()
  let content = join(getline(1, '$'), "\n")
  let format = get(b:, 'wbx_format', 'plain')
  if !wbx#drafts#length(bufnr('%')).valid | call s:notice('Edit exceeds 1000 UTF-16 units / 4000 bytes; native text retained.') | return | endif
  if !s:confirm('Edit YOUR message ' . context.messageId . ' in space ' . context.roomId . '? Preflight refuses detected changes but cannot prevent a GET/PUT race. Continue with this non-atomic policy?') | return | endif
  if !wbx#view#intent_valid(origin) | return | endif
  let consent = format ==# 'markdown' ? wbx#rich#consent(content) : {}
  if has_key(consent, 'cancelled') | return | endif
  if !wbx#view#intent_valid(origin) || get(b:, 'wbx_message_context', {}) !=# context | return | endif
  call s:submit(context, bufnr('%'), extend({'revision': origin.tick, 'content': content, 'format': format}, consent))
endfunction
function! s:resolved(target, serial, response) abort
  if has_key(a:response, 'error') | return | endif
  let key = s:key(a:target)
  if get(get(s:unknown, key, {}), 'serial', -1) != a:serial | return | endif
  if has_key(s:unknown, key) | call remove(s:unknown, key) | endif
  for info in getbufinfo()
    if wbx#message_actions#owned(info.bufnr) && s:key(getbufvar(info.bufnr, 'wbx_message_context')) ==# key
      call setbufvar(info.bufnr, 'wbx_mutation_status', 'resolved explicitly; prepare afresh before any retry')
      call setbufvar(info.bufnr, 'wbx_context_stale', 1)
      call s:status(getbufvar(info.bufnr,'wbx_message_context'),info.bufnr,'resolved explicitly; prepare afresh before any retry')
    endif
  endfor
  call s:notice('Uncertainty resolved after explicit inspection. Nothing was replayed; any deliberate retry may duplicate.')
  if wbx#message_actions#owned(bufnr('%')) | call wbx#message_actions#setup() | endif
endfunction
function! wbx#message_actions#resolve() abort
  if !wbx#supports('message-actions-v1') | return | endif
  let origin = wbx#view#intent()
  let context = wbx#message_actions#owned(bufnr('%')) ? deepcopy(b:wbx_message_context) : {}
  if empty(context)
    let choices = filter(values(copy(s:unknown)), 'v:val.roomId ==# origin.room')
    if empty(choices) | call s:notice('No retained unknown target in this selected space. Select its exact room before resolving.') | return | endif
    call s:pick(['Check an exact UNKNOWN mutation in Webex first:']
          \ + map(copy(choices), 'printf("%d. Selected space / message %s", v:key + 1, v:val.messageId)'),
          \ function('s:resolve_picked', [origin, choices]))
    return
  endif
  call s:resolve_confirm(context, origin)
endfunction
function! s:resolve_picked(origin, choices, choice) abort
  if a:choice < 1 || a:choice > len(a:choices) || !wbx#view#picker_valid(a:origin) | return | endif
  let context = a:choices[a:choice - 1]
  if get(s:unknown, s:key(context), {}) !=# context | return | endif
  call s:resolve_confirm(context, wbx#view#intent())
endfunction
function! s:resolve_confirm(context, origin) abort
  let context = a:context | let origin = a:origin
  let target = {'roomId': context.roomId, 'messageId': context.messageId}
  let serial = get(get(s:unknown, s:key(target), {}), 'serial', -1)
  if !wbx#supports('message-actions-v1') | return | endif
  if !wbx#view#intent_valid(origin) || !s:confirm('Have you checked exact room ' . context.roomId
        \ . ' / message ' . context.messageId . ' in Webex? Resolve uncertainty WITHOUT retrying?')
        \ || !wbx#view#intent_valid(origin) || get(get(s:unknown, s:key(target), {}), 'serial', -1) != serial | return | endif
  call wbx#rpc('messages.actionResolve', target, function('s:resolved', [target, serial]))
endfunction
function! wbx#message_actions#cancel() abort
  let context = get(b:, 'wbx_message_context', {})
  if !wbx#message_actions#owned(bufnr('%')) || !wbx#supports('message-actions-v1') | return | endif
  if s:busy(context) || has_key(s:unknown, s:key(context)) | call s:notice('Mutation admitted/unresolved. Check its result; cancel cannot prove it unsent.') | return | endif
  call wbx#rpc('messages.actionDiscard', {'contextId': context.contextId})
  let b:wbx_mutation_status = 'canceled; native text retained'
  call wbx#message_actions#setup()
endfunction
augroup wbx_mutation_lifecycle
  autocmd!
  autocmd User WbxDisconnected call wbx#message_actions#invalidate()
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
