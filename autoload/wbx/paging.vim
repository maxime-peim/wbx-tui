" Paging admission only. Session state, transport and drafts stay in wbx.vim.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:datasets = {}
let s:serial = 0
let s:connection = ''
function! s:new(generation) abort
  return {'generation': a:generation, 'room': '', 'inflight': {}, 'last': '', 'error': '', 'enabled': 0, 'key': ''}
endfunction
function! wbx#paging#reset() abort
  let s:serial += 1
  let s:datasets = {'rooms': s:new(s:serial), 'history': s:new(s:serial)}
endfunction
function! wbx#paging#sync(state) abort
  if empty(s:datasets) | call wbx#paging#reset() | endif
  let connection = get(a:state, 'state', 'idle')
  if connection !=# s:connection && index(['idle', 'connecting', 'failed'], connection) >= 0
    call wbx#paging#reset()
  endif
  let s:connection = connection
  let room = get(a:state, 'room', v:null)
  let id = type(room) == v:t_dict ? room.id : ''
  if s:datasets.history.room !=# id
    let s:serial += 1
    let s:datasets.history = s:new(s:serial)
    let s:datasets.history.room = id
  endif
  " Navigation hints only. begin()/the coordinator still recheck current state
  " before RPC admission; no receipt/delivery authority is cached here.
  for kind in ['rooms', 'history']
    let data = s:datasets[kind]
    let item_count = len(get(a:state, kind ==# 'rooms' ? 'rooms' : 'messages', []))
    let data.key = s:key(kind, a:state)
    let data.enabled = connection ==# 'ready' && item_count > 0 && item_count < 500
          \ && get(a:state, kind ==# 'rooms' ? 'moreRooms' : 'moreHistory', 0)
          \ && (kind ==# 'rooms' || get(a:state, 'ready', 0) && !get(a:state, 'loading', 0))
  endfor
endfunction
function! s:key(kind, state) abort
  let data = get(a:state, a:kind ==# 'rooms' ? 'rooms' : 'messages', [])
  return empty(data) ? '' : string([len(data), data[a:kind ==# 'rooms' ? -1 : 0].id])
endfunction
function! wbx#paging#begin(kind, state, automatic) abort
  call wbx#paging#sync(a:state)
  let data = s:datasets[a:kind]
  let item_count = len(get(a:state, a:kind ==# 'rooms' ? 'rooms' : 'messages', []))
  let more = get(a:state, a:kind ==# 'rooms' ? 'moreRooms' : 'moreHistory', 0)
  let key = s:key(a:kind, a:state)
  if !empty(data.inflight) || !more || item_count >= 500 || empty(key)
        \ || a:automatic && (!empty(data.error) || data.last ==# key)
    return {}
  endif
  let s:serial += 1
  let token = {'kind': a:kind, 'generation': data.generation, 'serial': s:serial, 'key': key}
  let data.inflight = token
  let data.last = key
  let data.error = ''
  return token
endfunction
function! wbx#paging#finish(token, message, state) abort
  let data = get(s:datasets, a:token.kind, {})
  if empty(data) || data.inflight !=# a:token || data.generation != a:token.generation
    return 0
  endif
  let data.inflight = {}
  if has_key(a:message, 'error')
    let data.error = 'Page failed; explicit retry required'
  elseif s:key(a:token.kind, a:state) ==# a:token.key && get(a:state, a:token.kind ==# 'rooms' ? 'moreRooms' : 'moreHistory', 0)
    let data.error = 'Page made no progress; explicit retry required'
  endif
  return 1
endfunction
function! wbx#paging#status(kind, state) abort
  call wbx#paging#sync(a:state)
  let data = s:datasets[a:kind]
  if !empty(data.inflight) | return 'Loading page…' | endif
  if !empty(data.error) | return data.error | endif
  if len(get(a:state, a:kind ==# 'rooms' ? 'rooms' : 'messages', [])) >= 500
    return '500-item memory limit; paging stopped'
  endif
  return get(a:state, a:kind ==# 'rooms' ? 'moreRooms' : 'moreHistory', 0) ? '' : 'No more pages'
endfunction
function! wbx#paging#baseline() abort
  let context = [bufnr('%'), get(b:, 'wbx_history_room', '')]
  if get(w:, 'wbx_navigation_context', []) !=# context
    let w:wbx_page_edge = 0
  endif
  let w:wbx_navigation_context = context
  let w:wbx_navigation = [bufnr('%'), line('.'), line('w0'), line('w$'), b:changedtick]
endfunction
function! wbx#paging#navigation(kind, ...) abort
  let previous = get(w:, 'wbx_navigation', [])
  call wbx#paging#baseline()
  let now = w:wbx_navigation
  if len(previous) != 5 || previous[0] != now[0] || previous[4] != now[4] || previous ==# now
    return 0
  endif
  let data = get(s:datasets, a:kind, {})
  let blocked = a:0 && !a:1 || !get(data, 'enabled', 0)
        \ || !empty(data.inflight) || !empty(data.error) || data.last ==# data.key
        \ || a:kind ==# 'history' && data.room !=# get(b:, 'wbx_history_room', '')
  " Blocked motion still consumes/rearms the window's hysteresis. Otherwise a
  " completion/recovery could turn continued near-edge movement into a new page
  " without moving away first. This scalar work never borrows full metadata.
  let edge = get(b:, 'wbx_paging_edge', 0)
  if edge <= 0 | return 0 | endif
  if a:kind ==# 'rooms'
    let position = now[1] != previous[1] ? now[1] : now[3]
    let near = position >= edge - 5
    let away = position < edge - 10
    let toward = now[1] > previous[1] || now[2] > previous[2]
  else
    let position = now[1] != previous[1] ? now[1] : now[2]
    let near = position <= edge + 5
    let away = position > edge + 10
    let toward = now[1] < previous[1] || now[2] < previous[2]
  endif
  if away | let w:wbx_page_edge = 0 | endif
  if near && toward && !get(w:, 'wbx_page_edge', 0)
    let w:wbx_page_edge = 1
    return !blocked
  endif
  return 0
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
