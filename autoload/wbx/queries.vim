" Explicit finite selected-space reads. Results are never main-history authority.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:serial = 0
let s:pending = {}
function! s:warn(text) abort
  echomsg '[wbx-tui] ' . a:text
endfunction
function! s:context() abort
  let state = wbx#state()
  let local = get(state, 'localContext', {})
  let room = get(state, 'room', v:null)
  if !wbx#supports('message-queries-v1') || !wbx#supports('local-context-v1')
        \ || !get(state, 'ready', 0) || get(state, 'state', '') !=# 'ready'
        \ || type(room) != v:t_dict || !wbx#protocol#local_context(local) | return {} | endif
  return {'sessionId': local.sessionId, 'roomId': room.id, 'epoch': exists('*wbx#context_epoch') ? wbx#context_epoch() : 0}
endfunction
function! wbx#queries#bound() abort
  let kind = get(b:, 'wbx_list_kind', '')
  let value = get(b:, 'wbx_query_snapshot', {})
  if index(['remote-thread', 'mentions', 'query-message'], kind) < 0 || !wbx#lists#clean(bufnr('%'), kind)
        \ || !wbx#protocol#message_query(value) | return 0 | endif
  let context = s:context()
  return !empty(context) && get(b:, 'wbx_query_context', {}) ==# context
        \ && value.sessionId ==# context.sessionId && value.roomId ==# context.roomId
endfunction
function! wbx#queries#current() abort
  if !wbx#queries#bound() | return 0 | endif
  let age = localtime() * 1000 - b:wbx_query_snapshot.observedAt
  return age >= -999 && age < 120000
endfunction
function! s:label(text) abort
  return wbx#text#truncate(substitute(substitute(a:text, '[[:cntrl:]\x7f-\x9f]', ' ', 'g'),
        \ "[\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]", '', 'g'), 160)
endfunction
function! s:show(value, context, detail) abort
  let thread = a:value.kind ==# 'thread'
  let kind = !empty(a:detail) ? 'query-message' : thread ? 'remote-thread' : 'mentions'
  let heading = thread ? 'REMOTE thread · root ' . a:value.rootId : 'SELECTED SPACE · API @me results'
  if !empty(a:detail) | let heading = 'Inert query message · ' . a:detail | endif
  let lines = [heading . ' · room ' . a:value.roomId,
        \ (a:value.partial ? 'PARTIAL · limit: ' . a:value.limit : 'API query exhausted at observation; not atomic or future completeness')
        \ . ' · ' . len(a:value.items) . (thread ? '/251' : '/250') . ' retained · observed '
        \ . strftime('%H:%M:%S %Z', a:value.observedAt / 1000) . ' · two-minute expiry',
        \ 'r refresh · ]p next explicit page · q return · / searches · no receipt · @all coverage unverified', '']
  let rows = repeat([''], 4)
  if thread || !empty(a:detail)
    let messages = empty(a:detail) ? a:value.items : filter(copy(a:value.items), 'v:val.id ==# a:detail')
    let view = wbx#history#render(messages, 4)
    call extend(lines, view.lines)
    for block in view.blocks | call extend(rows, repeat([block.id], block.end - block.start + 1)) | endfor
    call add(lines, '[Inert text only: files/actions and unsupported card content omitted; use main history for attachment commands. No URL was registered/opened.]')
    call add(rows, '')
    if !view.complete | call add(lines, '[Display clipped at native history limits; query coverage is separate.]') | call add(rows, '') | endif
    if !empty(filter(copy(messages), 'v:val.contentPartial'))
      call add(lines, '[Some message content is omitted/clipped; attachment count is not file-opening authority.]') | call add(rows, '')
    endif
  else
    for message in a:value.items
      call add(lines, s:label(message.author . ' · ' . message.created . ' · ' . message.text))
      call add(rows, message.id)
    endfor
    if empty(a:value.items) | call add(lines, '[No visible API @me results in this selected-space query; not evidence of global absence.]') | call add(rows, '') | endif
  endif
  let buffer = wbx#lists#show(kind, lines, rows)
  if buffer <= 0 || bufnr('%') != buffer || !wbx#lists#clean(buffer, kind) || s:context() !=# a:context | return | endif
  let b:wbx_query_context = copy(a:context)
  let b:wbx_query_snapshot = deepcopy(a:value)
  let b:wbx_query_rows = rows
  if exists('view') | call wbx#history#present(view) | endif
endfunction
function! s:received(origin, response) abort
  if get(s:pending, 'serial', 0) == a:origin.serial | let s:pending = {} | endif
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#message_query(value) || value.kind !=# a:origin.kind || value.roomId !=# a:origin.context.roomId
        \ || value.sessionId !=# a:origin.context.sessionId || get(value, 'sourceId', '') !=# a:origin.source
    call wbx#_protocol_error() | return
  endif
  if a:origin.serial != s:serial || !wbx#view#intent_valid(a:origin.intent) || s:context() !=# a:origin.context | return | endif
  call s:show(value, a:origin.context, '')
endfunction
function! s:start(kind, source, more, revision) abort
  let context = s:context()
  if empty(context)
    call s:warn('Query needs a ready selected space and message-queries-v1 backend. No connection, fetch or receipt started.') | return
  endif
  let list = a:kind ==# 'thread' ? 'remote-thread' : 'mentions'
  if !wbx#lists#admit(list) | return | endif
  if !empty(s:pending) && s:pending.context !=# context | let s:pending = {} | let s:serial += 1 | endif
  if !empty(s:pending) | call s:warn('A query read is pending; nothing queued or automatically retried.') | return | endif
  if a:kind ==# 'thread' && empty(filter(copy(get(wbx#state(), 'messages', [])), 'v:val.id ==# a:source'))
    call s:warn('Original thread source is no longer loaded. Load/select it explicitly; no substituted source or fetch.') | return
  endif
  let params = {'roomId': context.roomId}
  if a:kind ==# 'thread' | let params.messageId = a:source | endif
  if a:more | let params.more = v:true | let params.revision = a:revision | endif
  let s:serial += 1
  let origin = {'serial': s:serial, 'context': context, 'source': a:source, 'kind': a:kind, 'intent': wbx#view#intent()}
  let s:pending = origin
  if wbx#rpc(a:kind ==# 'thread' ? 'messages.thread' : 'messages.mentions', params, function('s:received', [origin])) < 0
        \ && get(s:pending, 'serial', 0) == origin.serial | let s:pending = {} | endif
endfunction
function! wbx#queries#thread() abort
  let context = s:context()
  let source = wbx#view#message_at(bufnr('%'), line('.'))
  if empty(context) || empty(source) || get(b:, 'wbx_history_room', '') !=# context.roomId
    call s:warn('Choose an unchanged selected main-history message for an explicit remote thread read.') | return
  endif
  call s:start('thread', source, 0, 0)
endfunction
function! wbx#queries#mentions() abort
  call s:start('mentions', '', 0, 0)
endfunction
function! wbx#queries#page(more) abort
  if !(a:more ? wbx#queries#current() : wbx#queries#bound()) || a:more && !b:wbx_query_snapshot.more
    call s:warn('No current/next query page. Start a fresh explicit query; annotations/expired results are not authority.') | return
  endif
  let value = b:wbx_query_snapshot
  call s:start(value.kind, get(value, 'sourceId', ''), a:more, value.revision)
endfunction
function! wbx#queries#selected() abort
  if !wbx#queries#current() | return {} | endif
  let id = get(b:wbx_query_rows, line('.') - 1, '')
  for message in b:wbx_query_snapshot.items
    if message.id ==# id | return deepcopy(message) | endif
  endfor
  return {}
endfunction
function! wbx#queries#message() abort
  let message = wbx#queries#selected()
  if empty(message) | return | endif
  call s:show(b:wbx_query_snapshot, b:wbx_query_context, message.id)
endfunction
function! wbx#queries#jump() abort
  let message = wbx#queries#selected()
  if !empty(message) | call wbx#view#jump(b:wbx_query_snapshot.roomId, message.id) | endif
endfunction
function! wbx#queries#reply() abort
  if !wbx#queries#current() || b:wbx_query_snapshot.kind !=# 'thread' || !wbx#supports('message-replies')
    call s:warn('Reply requires a current queried thread/root, not an arbitrary mention or expired result.') | return
  endif
  let value = b:wbx_query_snapshot
  let messages = get(wbx#state(), 'messages', [])
  let roots = filter(copy(messages), 'v:val.id ==# value.rootId')
  if !empty(roots) && !empty(get(roots[0], 'parentId', ''))
        \ || empty(roots) && empty(filter(copy(messages), 'get(v:val, "parentId", "") ==# value.rootId'))
    call s:warn('Verified root is no longer referenced by loaded main history. Load it explicitly; no arbitrary reply target was prepared.') | return
  endif
  call wbx#drafts#reply(value.roomId, value.rootId)
  call wbx#compose(1)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
