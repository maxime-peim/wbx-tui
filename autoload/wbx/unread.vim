" Session-only presentation overlay. Never changes SDK state, cache or receipts.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:entries = {}
let s:order = []
let s:sent = {}
let s:skip = {}
let s:counts = {'read': 0, 'unread': 0, 'tracked': 0}
function! s:count(entry, delta) abort
  let s:counts.read += a:delta * (a:entry.mode ==# 'read' && !a:entry.confirmed)
  let s:counts.unread += a:delta * (a:entry.mode ==# 'unread')
endfunction
function! s:mark(entry, mode, confirmed) abort
  if a:entry.mode ==# a:mode && a:entry.confirmed == a:confirmed | return | endif
  " Keep aggregate presentation exact at the same transitions as each entry.
  " These counters never feed SDK state, persistent cache or receipt admission.
  call s:count(a:entry, -1)
  let a:entry.mode = a:mode | let a:entry.confirmed = a:confirmed
  call s:count(a:entry, 1)
endfunction
function! s:time(value) abort
  return wbx#notify_events#time(a:value)
endfunction
function! s:latest(state) abort
  let result = {'time': -1, 'ids': {}, 'saturated': 0, 'endpoint': ''}
  let messages = get(a:state, 'messages', [])
  if !empty(messages) | let result.endpoint = messages[-1].id | endif
  for message in messages
    let time = s:time(message.created)
    if time > result.time | let result.time = time | let result.ids = {} | let result.saturated = 0 | endif
    if time == result.time && time >= 0
      if len(result.ids) < 64 | let result.ids[message.id] = 1 | else | let result.saturated = 1 | endif
    endif
  endfor
  return result
endfunction
function! wbx#unread#reset() abort
  let s:entries = {} | let s:order = [] | let s:sent = {} | let s:skip = {}
  let s:counts = {'read': 0, 'unread': 0, 'tracked': 0}
endfunction
function! wbx#unread#sent(room, id) abort
  let target = empty(a:id) ? s:skip : s:sent
  if len(target) >= 256 | call remove(target, keys(target)[0]) | endif
  let target[empty(a:id) ? a:room : json_encode([a:room, a:id])] = 1
endfunction
function! wbx#unread#open(state) abort
  let room = get(a:state, 'room', v:null)
  if get(a:state, 'state', '') !=# 'ready' || !get(a:state, 'ready', 0) || type(room) != v:t_dict || get(room, 'cached', 0) | return | endif
  let listed = filter(copy(get(a:state, 'rooms', [])), 'v:val.id ==# room.id && !get(v:val, "cached", 0)')
  if empty(listed) | return | endif
  let latest = s:latest(a:state)
  let previous = index(s:order, room.id)
  if previous >= 0
    call remove(s:order, previous)
    call s:count(s:entries[room.id], -1)
  endif
  if len(s:order) >= 500 | call s:count(remove(s:entries, remove(s:order, 0)), -1) | endif
  call add(s:order, room.id)
  let activity = max([s:time(get(room, 'unreadActivity', '')), s:time(get(listed[0], 'unreadActivity', ''))])
  let s:entries[room.id] = {'mode': 'read', 'latest': latest, 'activity': max([activity, latest.time]), 'pending': -1,
        \ 'confirmed': get(a:state, 'readStatus', 'off') ==# 'ready' && !get(listed[0], 'unreadStale', 0) && get(listed[0], 'unread', v:null) is v:false,
        \ 'historyLatest': !!get(a:state, 'historyLatest', 1)}
  call s:count(s:entries[room.id], 1)
  let s:counts.tracked = len(s:entries)
endfunction
function! s:advance(entry, latest) abort
  if a:latest.time > a:entry.latest.time
    let a:entry.latest = a:latest
  elseif a:latest.time == a:entry.latest.time
    for id in keys(a:latest.ids)
      if has_key(a:entry.latest.ids, id) | continue | endif
      if len(a:entry.latest.ids) < 64 | let a:entry.latest.ids[id] = 1 | else | let a:entry.latest.saturated = 1 | endif
    endfor
    let a:entry.latest.saturated = a:entry.latest.saturated || a:latest.saturated
    let a:entry.latest.endpoint = a:latest.endpoint
  endif
endfunction
function! wbx#unread#observe(state) abort
  if get(a:state, 'state', '') !=# 'ready' | call wbx#unread#reset() | return | endif
  let selected = type(get(a:state, 'room', 0)) == v:t_dict ? a:state.room.id : ''
  let rooms = {}
  for room in get(a:state, 'rooms', []) | let rooms[room.id] = room | endfor
  " New loaded messages take precedence over an old read=false snapshot.
  if has_key(s:entries, selected) && get(a:state, 'ready', 0) && !get(a:state, 'loading', 0)
    let entry = s:entries[selected]
    let own_time = -1
    let skip = has_key(s:skip, selected)
    for message in get(a:state, 'messages', [])
      let time = s:time(message.created)
      let own = has_key(s:sent, json_encode([selected, message.id]))
      if skip || own | let own_time = max([own_time, time]) | continue | endif
      if time > entry.latest.time || time >= 0 && time == entry.latest.time && !entry.latest.saturated && !has_key(entry.latest.ids, message.id)
        call s:mark(entry, 'unread', 0) | let entry.pending = max([entry.pending, time])
      endif
    endfor
    let latest = s:latest(a:state)
    if skip
      let entry.latest = latest | let entry.activity = max([entry.activity, latest.time])
      let entry.historyLatest = !!get(a:state, 'historyLatest', 1)
      call remove(s:skip, selected)
    endif
    let entry.activity = max([entry.activity, own_time])
    if !skip && entry.historyLatest && !get(a:state, 'historyLatest', 1) && latest.endpoint ==# entry.latest.endpoint
      " The known newest endpoint moved outside the bounded loaded window.
      call s:mark(entry, 'unread', 0)
    elseif !skip && latest.time < 0 && entry.latest.time < 0 && !empty(latest.endpoint) && latest.endpoint !=# entry.latest.endpoint
          \ && !has_key(s:sent, json_encode([selected, latest.endpoint]))
      call s:mark(entry, 'unread', 0)
    endif
    call s:advance(entry, latest)
    let entry.historyLatest = !!get(a:state, 'historyLatest', 1)
  endif
  for [id, entry] in items(s:entries)
    let room = get(rooms, id, {})
    if empty(room) || get(room, 'cached', 0) || get(a:state, 'readStatus', 'off') !=# 'ready' || get(room, 'unreadStale', 0) | continue | endif
    let activity = s:time(get(room, 'unreadActivity', ''))
    if get(room, 'unread', v:null) is v:false
      if entry.mode ==# 'read' || activity >= 0 && activity >= entry.pending
        call s:mark(entry, 'read', 1) | let entry.pending = -1
      endif
    elseif get(room, 'unread', v:null) is v:true && (entry.confirmed || activity > entry.activity)
      call s:mark(entry, 'unread', 0) | let entry.pending = max([entry.pending, activity])
    endif
    let entry.activity = max([entry.activity, activity])
  endfor
endfunction
function! wbx#unread#display(room) abort
  let entry = get(s:entries, get(a:room, 'id', ''), {})
  if !empty(entry) && !get(a:room, 'cached', 0)
    let flag = entry.mode ==# 'unread' ? v:true : v:false
    return {'unread': flag, 'local': get(a:room, 'unread', v:null) isnot flag || entry.mode ==# 'read' && !entry.confirmed ? entry.mode : ''}
  endif
  return {'unread': get(a:room, 'unread', v:null), 'local': ''}
endfunction
function! wbx#unread#status() abort
  return copy(s:counts)
endfunction
function! wbx#unread#show() abort
  let context = wbx#room_unread_context()
  if empty(context)
    echomsg '[wbx-tui] Choose one unchanged Spaces room row for :WebexUnreadStatus; headers/edited views are not targets. No space was opened or acknowledged.'
    return
  endif
  let room = context.room
  let flag = get(room,'unread',v:null)
  let known = type(flag) == v:t_bool
  let fresh = known && context.connected && context.readStatus ==# 'ready'
        \ && !room.cached && !room.unreadStale
  let server = !known ? 'UNKNOWN (no published read/unread observation)'
        \ : (flag ? 'UNREAD' : 'READ') . (fresh ? ' (fresh at capture; last published flag)'
        \ : ' (stale last-confirmed observation; not current proof)')
  " Use the same read-only display projection as the actual Spaces renderer.
  " This never marks/open/observes an entry or changes any receipt guard.
  let display = wbx#unread#display(room)
  let local = display.local ==# 'read' ? 'read (session-only display; not a receipt)'
        \ : display.local ==# 'unread' ? 'unread (session-only activity emphasis)'
        \ : 'none (no session-only override applied)'
  let emphasis = display.unread is v:true ? 'unread'
        \ : display.unread is v:false ? 'not emphasized' : 'unknown (not treated as read)'
  let lines = ['Unread provenance - local snapshot (no provider request)',
        \ 'Target: highlighted Spaces row, not an open/mark-read action.',
        \ 'Room ID: ' . room.id,
        \ 'Title: ' . wbx#notify_events#text(room.title,160),
        \ 'Mode: ' . toupper(context.mode) . (context.mode ==# 'demo' ? ' (synthetic demo data)' : ' (last published state only)'),
        \ 'Published state revision: ' . context.revision,
        \ 'Server state: ' . server,
        \ 'Unread source: ' . context.readStatus,
        \ 'Connection at capture: ' . (context.connected ? 'ready' : 'unavailable'),
        \ 'Space metadata: ' . (room.cached ? 'cached (browse only)' : 'published (not marked cached)'),
        \ 'Local override: ' . local, 'List emphasis: ' . emphasis, '',
        \ 'This is not a read receipt, remote-read proof or unread count.',
        \ 'Snapshot only: q returns; reopen from a Spaces row to refresh.',
        \ 'Enter/write never select, fetch, acknowledge or send.']
  return wbx#lists#show('unread-status',lines)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
