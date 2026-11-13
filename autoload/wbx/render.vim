" Rooms/history presentation only: no workspace construction or action authority.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#render#new(ports) abort
  return {'ports':a:ports, 'status':[], 'drafts':-1}
endfunction
function! wbx#render#interrupted(owner) abort
  " A textlock may interrupt after a signature was recorded but before effects.
  let a:owner.status = []
  let a:owner.drafts = -1
endfunction
function! wbx#render#drafts_changed(owner) abort
  return wbx#drafts#revision() != a:owner.drafts
endfunction
function! wbx#render#position_rooms(buffer) abort
  if !wbx#view#owned(a:buffer, 'rooms') || getbufvar(a:buffer, 'wbx_rooms_positioned', 0)
        \ || wbx#view#edited(a:buffer)
    return
  endif
  let rows = getbufvar(a:buffer, 'wbx_row_ids', getbufvar(a:buffer, 'wbx_room_ids', []))
  let first = 0
  for index in range(len(rows))
    if !empty(rows[index]) | let first = index + 1 | break | endif
  endfor
  if !first | return | endif
  let windows = win_findbuf(a:buffer)
  if empty(windows)
    return
  endif
  " Only the first real fill positions the explorer. Later notifications
  " preserve native selection/scroll and never change the focused window.
  for window in windows
    call win_execute(window, 'call cursor(' . first . ', 1)')
  endfor
  call setbufvar(a:buffer, 'wbx_rooms_positioned', 1)
endfunction
function! s:history_view(state, room, offset) abort
  " Cache only a pure display projection, never selected-destination/read authority.
  " Detach inputs and outputs: incoming test/hooks and buffer metadata can mutate
  " their containers without changing the private cache's comparison baseline.
  let options = wbx#options#normalized()
  let key = [a:room, a:offset, get(options, 'threaded_history', 1), get(options, 'images', 'auto')]
  return wbx#history#projection(get(a:state, 'messages', []), key)
endfunction
function! wbx#render#status(owner) abort
  " A forced status redraw also runs native syntax. Polling's invisible loading
  " changes must not force a whole history repaint. Keep destination status live.
  let signature = [call(a:owner.ports.Status, []), []]
  for window in getwininfo()
    let kind = getbufvar(window.bufnr, 'wbx_kind', '')
    if wbx#view#owned(window.bufnr, kind)
      call add(signature[1], [window.winid, window.bufnr, call(a:owner.ports.Destination, [window.bufnr]), kind !=# 'compose' && wbx#view#edited(window.bufnr),
            \ kind ==# 'compose' ? [wbx#uploads#label(window.bufnr), wbx#drafts#summary(window.bufnr)] : ''])
    endif
  endfor
  if signature ==# a:owner.status | return 0 | endif
  let a:owner.status = signature
  for window in getwininfo()
    if wbx#view#owned(window.bufnr, 'compose') | call win_execute(window.winid, 'call wbx#_draft_setup()') | endif
  endfor
  redrawstatus
  return 1
endfunction
function! wbx#render#apply(owner, state, buffers, connection) abort
  let work = {'history': 0, 'images': 0, 'status': 0}
  for info in getwininfo()
    if wbx#view#owned(info.bufnr, 'compose') | call wbx#drafts#observe(info.bufnr) | endif
  endfor
  let rooms = wbx#draft_persistence#rooms(wbx#drafts#rooms(get(a:state, 'rooms', [])), a:state)
  let a:owner.drafts = wbx#drafts#revision()
  let room = type(get(a:state, 'room', 0)) == v:t_dict ? a:state.room : {}
  let hint = a:connection.hint
  let lines = ['Webex spaces · ' . toupper(get(a:state, 'mode', 'demo')) . ' · ' . (a:connection.disconnected ? 'disconnected' : get(a:state, 'state', 'idle')), '']
  let ids = ['', '']
  let row_ids = ['', '']
  let joined = wbx#upcoming#joined(get(a:state, 'joinedMeetings', {}), a:connection.disconnected)
  call extend(lines, joined.lines)
  call extend(row_ids, joined.ids)
  call extend(ids, repeat([''], len(joined.lines)))
  let upcoming = wbx#upcoming#render(get(a:state, 'upcomingMeetings', {}), len(lines))
  call extend(lines, upcoming.lines)
  call extend(row_ids, upcoming.ids)
  call extend(ids, repeat([''], len(upcoming.lines)))
  let unread_rows = []
  let local_read_rows = []
  let local_unread_rows = []
  let cached_rows = []
  let space_cache = get(a:state, 'spacesCache', {'state': 'off'})
  let unknown = 0
  let read_status = get(a:state, 'readStatus', 'off')
  if a:connection.disconnected && read_status !=# 'off'
    let read_status = 'failed'
  endif
  let cached = 0
  let rooms_edge = 0
  let displays = map(copy(rooms), 'wbx#unread#display(v:val)')
  call wbx#people#observe(a:state)
  let rows = wbx#rooms#rows(rooms, get(room, 'id', ''), len(lines), displays, read_status, get(a:state, 'sections', {}))
  call extend(lines, rows.lines)
  call extend(ids, rows.ids)
  call extend(row_ids, rows.row_ids)
  let rooms_edge = get(rows, 'edge', empty(rooms) ? 0 : len(lines))
  let unread_rows = rows.unread
  let local_read_rows = rows.local_read
  let local_unread_rows = rows.local_unread
  let cached_rows = rows.cached
  let cached = rows.stale
  let unknown = rows.unknown
  " Discovery evidence is independent of caching and supplemental metadata.
  " Older cache-enabled backends can still supply their explicit verified bit;
  " absent evidence must never turn a REST failure into an absence claim.
  let rooms_status = get(a:state, 'roomsStatus', get(space_cache, 'verified', 0) ? 'ready' : 'unverified')
  if get(a:state, 'loadingRooms', 0) || rooms_status ==# 'loading' && !a:connection.disconnected
    call add(lines, read_status ==# 'connecting' ? '[Loading spaces and unread status…]' : '[Loading spaces…]')
  elseif rooms_status ==# 'failed' && a:state.state ==# 'ready' && !a:connection.disconnected
    call add(lines, empty(rooms) ? '[Spaces discovery failed · :WebexRefresh in Spaces to retry]'
          \ : '[Spaces refresh failed; loaded rows retained · :WebexRefresh in Spaces to retry]')
  elseif empty(rooms) && a:state.state ==# 'ready' && !a:connection.disconnected
    call add(lines, rooms_status !=# 'ready' || has_key(space_cache, 'verified') && !space_cache.verified
          \ ? '[Spaces not yet verified · :WebexRefresh in Spaces]'
          \ : get(a:state, 'moreRooms', 0) ? '[No spaces loaded; more pages available]' : '[No spaces found]')
  endif
  if !empty(hint)
    call add(lines, hint)
  endif
  if !empty(cached_rows) | call add(lines, '[Cached spaces · browse only]') | endif
  let sections = get(a:state, 'sections', {})
  if !empty(sections) || wbx#sections#current_filter() !=# 'all'
    let counts = wbx#sections#counts(rooms, displays, read_status)
    call add(lines, '[All loaded/local: ' . counts.unread . ' unread · ' . counts.unknown . ' unknown · ' . counts.stale
          \ . ' stale; display-only. Grouping: ' . get(sections, 'persistence', 'session') . '.]')
  endif
  if get(space_cache, 'state', '') ==# 'stale'
    call add(lines, '[Cached spaces · STALE titles/order; ' . (cached ? cached . ' last-known read flags (STALE)' : 'status unknown') . '. '
          \ . (a:connection.disconnected ? 'Disconnected.' : get(space_cache, 'reason', '') ==# 'refresh-failed' ? 'Refresh failed.' : 'Refreshing…') . ']')
  elseif get(space_cache, 'state', '') ==# 'unavailable'
    call add(lines, '[Local spaces cache unavailable]')
  endif
  if read_status ==# 'ready'
    call add(lines, '[Unread spaces are bold' . (!empty(get(a:state, 'readStatusNotice', '')) ? ' · sync degraded' : '') . (cached ? ' · ' . cached . ' cached' : '') . (unknown ? ' · ' . unknown . ' unknown' : '') . '.]')
  elseif read_status ==# 'connecting'
    call add(lines, '[Unread status: connecting…' . (cached ? ' · ' . cached . ' last-known flags STALE' : '') . (cached && unknown ? ' · ' . unknown . ' unknown' : '') . ']')
  elseif read_status !=# 'off'
    call add(lines, '[Unread sync unavailable' . (cached ? ' · last-known states kept' : ' · status unknown') . ']')
  endif
  if get(a:state, 'moreRooms', 0)
    call add(lines, '[More spaces available]')
  endif
  let page_status = wbx#paging#status('rooms', a:state)
  if !empty(rooms) && !empty(page_status)
    call add(lines, '[Spaces: ' . page_status . '.]')
  endif
  if !empty(get(a:state, 'notice', ''))
    call extend(lines, [''] + split(a:state.notice, "\n", 1))
  endif
  if !empty(upcoming.footer) | call add(lines, upcoming.footer) | endif
  call extend(ids, repeat([''], len(lines) - len(ids)))
  call extend(row_ids, repeat([''], len(lines) - len(row_ids)))
  if wbx#view#write(a:buffers.rooms, lines, a:owner.ports.Notify, row_ids)
    call setbufvar(a:buffers.rooms, 'wbx_paging_edge', rooms_edge)
    call setbufvar(a:buffers.rooms, 'wbx_room_ids', ids)
    call setbufvar(a:buffers.rooms, 'wbx_row_ids', row_ids)
    call setbufvar(a:buffers.rooms, 'wbx_meeting_rows', upcoming.rows)
    call setbufvar(a:buffers.rooms, 'wbx_unread_rows', unread_rows)
    call setbufvar(a:buffers.rooms, 'wbx_local_read_rows', local_read_rows)
    call setbufvar(a:buffers.rooms, 'wbx_local_unread_rows', local_unread_rows)
    call setbufvar(a:buffers.rooms, 'wbx_cached_rows', cached_rows)
    call setbufvar(a:buffers.rooms, 'wbx_presence_rows', get(rows, 'presence', []))
    for window in win_findbuf(a:buffers.rooms)
      call win_execute(window, 'call wbx#rooms#syntax()')
    endfor
    call wbx#render#position_rooms(a:buffers.rooms)
  endif
  let history = ['# ' . get(room, 'title', 'Select a Webex space'), '']
  let people = get(a:state, 'peopleStatus', {})
  if get(room, 'type', '') ==# 'direct'
        \ && wbx#protocol#people(people)
        \ && get(people, 'reason', '') !=# 'unsupported-person'
        \ && wbx#options#normalized().people_status
    call extend(history, ['[' . wbx#people#line(people) . ']', ''])
  endif
  if !empty(hint)
    call extend(history, [hint, ''])
  endif
  if call(a:owner.ports.Uncertain, [get(room, 'id', '')])
    call extend(history, ['[Delivery uncertain · check Webex before retrying]', ''])
  endif
  if empty(room)
    call extend(history, ['[No space selected]', ''])
  else
    if call(a:owner.ports.Pending, [room.id]) || get(a:state, 'sending', 0)
      call extend(history, ['[Sending… wait for delivery; nothing is retried.]', ''])
    endif
    " Polling keeps the loaded conversation readable. A temporary row here
    " shifts every message twice per poll and defeats unchanged-view checks.
    if get(a:state,'historyCached',0)
      call extend(history, ['[Saved history · stale display only; revalidating]', ''])
    elseif get(a:state, 'loading', 0) && !get(a:state, 'ready', 0)
      call extend(history, ['[Loading history…]', ''])
    elseif empty(get(a:state, 'messages', [])) && get(a:state, 'ready', 0) && !a:connection.disconnected
      call extend(history, ['[No messages in this space]', ''])
    elseif !get(a:state, 'ready', 0) && empty(hint)
      call extend(history, ['[History not ready · drafts retained]', ''])
    endif
    if get(a:state, 'moreHistory', 0)
      call extend(history, ['[Older messages available]', ''])
    endif
    let page_status = wbx#paging#status('history', a:state)
    if !empty(get(a:state, 'messages', [])) && !empty(page_status)
      call extend(history, ['[History: ' . page_status . '.]', ''])
    endif
    if !get(a:state, 'historyLatest', 1)
      call extend(history, ['[Older history · latest messages not loaded]', ''])
    endif
  endif
  if !empty(get(a:state, 'notice', ''))
    call extend(history, split(a:state.notice, "\n", 1) + [''])
  endif
  if get(a:state, 'truncated', 0)
    call insert(history, '[Display transport limit: some older loaded text was omitted.]', 1)
  endif
  let [view, work.history] = s:history_view(a:state, get(room, 'id', ''), len(history))
  call extend(history, view.lines)
  let history_tick = getbufvar(a:buffers.history, 'changedtick', -1)
  if wbx#view#write(a:buffers.history, history, a:owner.ports.Notify, view.blocks, get(room, 'id', ''))
    call setbufvar(a:buffers.history, 'wbx_history_room', get(room, 'id', ''))
    call setbufvar(a:buffers.history, 'wbx_message_rows', view.headers)
    call setbufvar(a:buffers.history, 'wbx_quote_rows', view.quotes)
    call setbufvar(a:buffers.history, 'wbx_reply_rows', view.replies)
    call setbufvar(a:buffers.history, 'wbx_message_blocks', view.blocks)
    call setbufvar(a:buffers.history, 'wbx_history_complete', view.complete)
    call setbufvar(a:buffers.history, 'wbx_image_pending', view.pending_images)
    call setbufvar(a:buffers.history, 'wbx_attachment_pending', view.pending_attachments)
    call setbufvar(a:buffers.history, 'wbx_history_oldest', empty(get(a:state, 'messages', [])) ? '' : a:state.messages[0].id)
    call setbufvar(a:buffers.history, 'wbx_paging_edge', view.paging_edge)
    for window in win_findbuf(a:buffers.history)
      call win_execute(window, 'call wbx#history#syntax()')
      if exists('*wbx#history#fold_setup')
        call win_execute(window, 'call wbx#history#fold_setup()')
      endif
    endfor
    if work.history || history_tick != getbufvar(a:buffers.history, 'changedtick', -1)
          \ || getbufvar(a:buffers.history, 'wbx_image_placements', []) !=# view.images
      call wbx#images#render(a:buffers.history, view.images)
      let work.images = 1
    endif
  endif
  if !empty(room)
    let composer = call(a:owner.ports.Compose, [room])
    if composer <= 0 | return 0 | endif
    for info in getwininfo()
      if wbx#view#owned(info.bufnr, 'compose') && gettabvar(info.tabnr, 'wbx_workspace', 0)
        if info.bufnr != composer
          call win_execute(info.winid, 'buffer ' . composer . ' | call wbx#_setup_buffer()')
        else
          call win_execute(info.winid, 'call wbx#_draft_setup()')
        endif
      endif
    endfor
  endif
  for buffer in [a:buffers.rooms, a:buffers.history]
    for window in win_findbuf(buffer)
      call win_execute(window, 'call wbx#paging#baseline()')
    endfor
  endfor
  let work.status = wbx#render#status(a:owner)
  if wbx#view#owned(a:buffers.history, 'history') | call setbufvar(a:buffers.history, 'wbx_render_work', work) | endif
  return 1
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
