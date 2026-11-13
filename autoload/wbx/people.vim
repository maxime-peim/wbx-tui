" Read-only, inert people snapshots. No editor/job startup or profile mutation here.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:serial = 0
let s:presence_session = ''
let s:presence = {}
let s:presence_order = []
let s:presence_timer = -1
let s:spaces_timer = -1
let s:spaces_sent = []
function! s:spaces_window() abort
  if !wbx#options#normalized().people_status | return {} | endif
  for info in getwininfo()
    if info.tabnr == tabpagenr() && wbx#view#owned(info.bufnr, 'rooms') && !wbx#view#edited(info.bufnr)
      return info
    endif
  endfor
  return {}
endfunction
function! wbx#people#spaces_schedule() abort
  if s:spaces_timer >= 0 || !exists('*wbx#supports_people_spaces') || !wbx#supports_people_spaces() | return | endif
  if empty(get(s:spaces_sent, 1, [])) && empty(s:spaces_window()) | return | endif
  let s:spaces_timer = timer_start(180, function('s:spaces_visible'))
endfunction
function! s:spaces_visible(timer) abort
  if a:timer != s:spaces_timer | return | endif
  let s:spaces_timer = -1
  let info = s:spaces_window()
  if empty(info) && empty(get(s:spaces_sent, 1, [])) | return | endif
  let context = wbx#people_viewport_context()
  let session = context.sessionId
  if context.state !=# 'ready' || empty(session)
    let s:spaces_sent = [] | return
  endif
  let ids = []
  if !empty(info)
    let direct = context.direct
    let rows = getbufvar(info.bufnr, 'wbx_room_ids', [])
    let visible = []
    let hovered = 0
    let top = max([1, info.topline]) | let bottom = min([len(rows), info.botline])
    let cursor_row = getcurpos(info.winid)[1]
    for row in bottom < top ? [] : range(top, bottom)
      let id = get(rows, row - 1, '')
      if has_key(direct, id)
        if row <= cursor_row | let hovered = len(visible) | endif
        call add(visible, id)
      endif
    endfor
    " At most eight relevant peers, including the selected direct peer. Follow
    " the list position, never open a conversation or enumerate hidden rows.
    let start = max([0, min([hovered - 3, len(visible) - 8])])
    let ids = exists('*wbx#supports_people_viewport') && wbx#supports_people_viewport() ? visible[:127] : visible[start : start + 7]
  endif
  let key = [session, ids]
  if key ==# s:spaces_sent | return | endif
  let s:spaces_sent = deepcopy(key)
  call wbx#rpc(exists('*wbx#supports_people_viewport') && wbx#supports_people_viewport() ? 'people.viewport' : 'people.spaces', {'roomIds': ids})
endfunction
function! s:presence_expired(timer) abort
  if a:timer != s:presence_timer | return | endif
  let s:presence_timer = -1
  " Recolor only unchanged owned rows. No buffer text, focus, undo or RPC work.
  for info in getbufinfo()
    if wbx#view#owned(info.bufnr, 'rooms') && !wbx#view#edited(info.bufnr)
      let badges = getbufvar(info.bufnr, 'wbx_presence_rows', [])
      for badge in badges
        let current = wbx#people#badge({'id': get(badge, 'roomId', ''), 'type': 'direct'})
        let badge.group = get(current, 'group', 'WbxPresenceUnknown')
        let badge.cue = get(current, 'cue', '? ')
      endfor
      call setbufvar(info.bufnr, 'wbx_presence_rows', badges)
      for window in win_findbuf(info.bufnr)
        call win_execute(window, 'call wbx#rooms#syntax()')
      endfor
    endif
  endfor
  call s:presence_schedule()
endfunction
function! s:presence_schedule() abort
  if s:presence_timer >= 0 | call timer_stop(s:presence_timer) | let s:presence_timer = -1 | endif
  let delays = []
  for value in values(s:presence)
    let age = localtime() * 1000 - get(value, 'observedAt', 0)
    if age >= -999 && age < 300000
      call add(delays, (value.state ==# 'fresh' && age < 60000 ? 60000 : 300000) - age)
    endif
  endfor
  if !empty(delays) | let s:presence_timer = timer_start(min(delays), function('s:presence_expired')) | endif
endfunction
function! wbx#people#observe(state) abort
  " Bounded presentation of already verified selected peers only; never fetch,
  " resolve identities from labels, or carry presence across sessions.
  let session = get(get(a:state, 'localContext', {}), 'sessionId', '')
  let enabled = wbx#options#normalized().people_status
  let value = get(a:state, 'peopleStatus', {})
  let ready = get(a:state, 'state', '') ==# 'ready' && enabled
        \ && wbx#protocol#people(value) && value.capability ==# 'ready'
  if session !=# s:presence_session || !ready
    let s:presence = {} | let s:presence_order = [] | let s:presence_session = session
    call s:presence_schedule()
  endif
  if empty(session) || !ready | return | endif
  let room = get(a:state, 'room', v:null)
  let viewport = type(get(a:state, 'peopleViewport', 0)) == v:t_list
  let modern = viewport || exists('*wbx#supports_people_viewport') && wbx#supports_people_viewport()
  let loaded = {}
  for item in get(a:state, 'rooms', [])
    if get(item, 'type', '') ==# 'direct' && !get(item, 'cached', 0) | let loaded[item.id] = 1 | endif
  endfor
  if has_key(a:state, 'rooms')
    for id in keys(s:presence)
      if !has_key(loaded, id) | call remove(s:presence, id) | call filter(s:presence_order, 'v:val !=# id') | endif
    endfor
  endif
  let values = viewport ? copy(a:state.peopleViewport[:127]) : type(get(a:state, 'peopleSpaces', 0)) == v:t_list ? copy(a:state.peopleSpaces[:7]) : []
  if type(room) == v:t_dict && get(room, 'type', '') ==# 'direct' && !get(room, 'cached', 0)
        \ && get(value, 'roomId', '') ==# room.id
    call add(values, value)
  endif
  for value in values
    if !wbx#protocol#people(value) || !has_key(value, 'roomId') || value.state ==# 'loading' | continue | endif
    " List observations are accepted only for an exact live direct-space row.
    if index(get(a:state, viewport ? 'peopleViewport' : 'peopleSpaces', []), value) >= 0
          \ && !has_key(loaded, value.roomId) | continue | endif
    let previous = get(s:presence, value.roomId, {})
    if get(previous, 'observedAt', 0) > 0 && !has_key(value, 'observedAt')
          \ && index(['not-loaded', 'not-relevant', 'failed', 'canceled', 'busy', 'timeout', 'rate-limited'], get(value, 'reason', '')) >= 0 | continue | endif
    let s:presence[value.roomId] = {'presence': value.presence, 'state': value.state, 'observedAt': get(value, 'observedAt', 0), 'reason': get(value, 'reason', '')}
    call filter(s:presence_order, 'v:val !=# value.roomId')
    call add(s:presence_order, value.roomId)
    if len(s:presence_order) > (modern ? 500 : 8) | call remove(s:presence, remove(s:presence_order, 0)) | endif
  endfor
  call s:presence_schedule()
endfunction
" Meeting presence does not disclose whether the peer's camera is enabled.
let s:icons = {'active': '🟢', 'call': '📞', 'meeting': '📹', 'DoNotDisturb': '⛔',
      \ 'presenting': '🖥️', 'inactive': '🌙', 'OutOfOffice': '🏖️', 'pending': '⏳', 'unknown': '?'}
function! wbx#people#badge(room) abort
  if get(a:room, 'type', '') !=# 'direct' || get(a:room, 'cached', 0) || !wbx#options#normalized().people_status | return {} | endif
  let value = get(s:presence, a:room.id, {}) | let group = 'WbxPresenceUnknown'
  if get(value, 'reason', '') ==# 'unsupported-person' | return {} | endif
  let age = localtime() * 1000 - get(value, 'observedAt', 0)
  if get(value, 'state', '') ==# 'fresh' && age >= -999 && age < 60000
    let status = value.presence
    let group = status ==# 'active' ? 'WbxPresenceActive'
          \ : index(['call', 'meeting', 'presenting', 'DoNotDisturb'], status) >= 0 ? 'WbxPresenceBusy'
          \ : index(['inactive', 'OutOfOffice'], status) >= 0 ? 'WbxPresenceAway' : 'WbxPresenceUnknown'
  endif
  " Retain the last-known glyph while stale/refreshing; color/People text marks
  " age, and expired or never-observed identities still show unknown.
  let icon = age >= -999 && age < 300000 ? get(s:icons, get(value, 'presence', 'unknown'), '?') : '?'
  return {'group': group, 'cue': icon . repeat(' ', max([0, 2 - strdisplaywidth(icon)]))}
endfunction
function! wbx#people#highlights() abort
  execute 'highlight default link WbxPresenceActive ' . (hlexists('DiagnosticOk') ? 'DiagnosticOk' : 'String')
  highlight default link WbxPresenceBusy ErrorMsg
  highlight default link WbxPresenceAway WarningMsg
  highlight default link WbxPresenceUnknown Comment
endfunction
call wbx#people#highlights()
function! s:age(value) abort
  if !has_key(a:value, 'observedAt') | return 'age unknown' | endif
  let age = localtime() - a:value.observedAt / 1000
  return age < 0 ? 'clock changed; age unknown' : age . 's old at display'
endfunction
let s:labels = {'active': 'Active', 'inactive': 'Inactive',
      \ 'call': 'In a call', 'meeting': 'In a meeting', 'DoNotDisturb': 'Do not disturb', 'OutOfOffice': 'Out of office',
      \ 'pending': 'Pending', 'presenting': 'Presenting', 'unknown': 'Unknown'}
let s:reasons = {'not-shared': 'not shared for this peer/space', 'missing-status': 'not disclosed by Webex',
      \ 'unknown-status': 'Webex status unknown/unsupported', 'not-loaded': 'not loaded yet', 'not-relevant': 'outside current lookup set',
      \ 'identity-missing': 'peer not verified', 'incomplete-memberships': 'peer roster incomplete',
      \ 'invalid-memberships': 'peer roster invalid', 'unsupported-person': 'not a supported person',
      \ 'failed': 'lookup failed', 'timeout': 'lookup timed out', 'rate-limited': 'lookup rate-limited',
      \ 'busy': 'lookup capacity busy', 'canceled': 'lookup canceled', 'denied': 'session access denied',
      \ 'scope-required': 'existing grant missing', 'not-found': 'peer/space not found', 'invalid-data': 'invalid response',
      \ 'expired': 'observation expired', 'aged': 'observation aged', 'pending': 'never logged in',
      \ 'closed': 'session closed', 'not-connected': 'not connected'}
function! wbx#people#line(value) abort
  if !wbx#protocol#people(a:value)
    return 'Presence unknown'
  endif
  if a:value.capability ==# 'off'
    return 'Presence off'
  elseif a:value.capability ==# 'scope-required'
    return 'Presence unavailable · ' . s:reasons['scope-required']
  elseif a:value.state ==# 'loading'
    return 'Updating presence…'
  elseif get(a:value, 'reason', '') ==# 'not-direct'
    return 'Presence unknown'
  elseif a:value.state ==# 'unavailable'
    return 'Presence unavailable' . (has_key(s:reasons, get(a:value, 'reason', '')) ? ' · ' . s:reasons[a:value.reason] : '')
  endif
  return 'Presence ' . (a:value.state ==# 'stale' ? 'STALE: ' : '') . s:labels[a:value.presence]
        \ . (has_key(s:reasons, get(a:value, 'reason', '')) ? ' · ' . s:reasons[a:value.reason] : '')
endfunction
function! wbx#people#lines(value) abort
  let lines = [wbx#people#line(a:value)]
  if !wbx#protocol#people(a:value)
    return lines
  endif
  if has_key(a:value, 'displayName') | call insert(lines, 'Person: ' . a:value.displayName, 0) | endif
  if has_key(a:value, 'observedAt') | call add(lines, 'Observed locally: ' . strftime('%Y-%m-%d %H:%M:%S %Z', a:value.observedAt / 1000) . ' · ' . s:age(a:value)) | endif
  if has_key(a:value, 'lastActivity') | call add(lines, 'Last Webex activity: ' . a:value.lastActivity) | endif
  if has_key(a:value, 'retryAt') | call add(lines, 'Retry not before: ' . strftime('%Y-%m-%d %H:%M:%S %Z', a:value.retryAt / 1000)) | endif
  return lines
endfunction
function! wbx#people#refresh() abort
  let state = wbx#state()
  let room = get(state, 'room', v:null)
  let value = get(state, 'peopleStatus', {})
  if !wbx#supports('people-status') || !wbx#options#normalized().people_status
        \ || type(room) != v:t_dict || get(room, 'type', '') !=# 'direct' || !get(state, 'ready', 0)
        \ || get(state, 'state', '') !=# 'ready'
        \ || !wbx#protocol#people(value) || value.capability !=# 'ready'
        \ || get(value, 'roomId', '') !=# room.id
    echomsg '[wbx-tui] Presence refresh needs a ready selected DM and enabled existing People capability/grant; no lookup was made.' | return
  endif
  if exists('b:wbx_people_context')
    let context = b:wbx_people_context
    if !wbx#lists#clean(bufnr('%'), 'people-details') || get(context, 'roomId', '') !=# room.id
          \ || empty(get(context, 'sessionId', ''))
          \ || context.sessionId !=# get(get(state, 'localContext', {}), 'sessionId', '')
      echomsg '[wbx-tui] This People snapshot is edited or belongs to another selected peer/session. Reopen :WebexPeople; no lookup was made.' | return
    endif
  endif
  " The separate explicit provider read never repaints or opens a snapshot.
  let s:serial += 1
  return wbx#rpc('people.lookup', {}, function('s:refreshed', [s:serial, wbx#view#intent()]))
endfunction
function! s:refreshed(serial, origin, response) abort
  if a:serial != s:serial || !wbx#view#intent_valid(a:origin) || has_key(a:response, 'error') | return | endif
  if !wbx#protocol#people(get(a:response, 'result', {})) | call wbx#_protocol_error() | return | endif
  " The engine publication owns passive state. A details buffer is inert text.
  call wbx#people#sync(wbx#state())
endfunction
function! s:unavailable(capability, reason) abort
  return {'capability': a:capability, 'state': 'unavailable', 'presence': 'unknown',
        \ 'customStatus': 'unsupported', 'reason': a:reason}
endfunction
function! s:details(state, room) abort
  if !wbx#options#normalized().people_status | return s:unavailable('off', 'off') | endif
  let value = get(a:state, 'peopleStatus', {})
  if empty(value) | return s:unavailable('off', 'off') | endif
  if !wbx#protocol#people(value) | return s:unavailable('unavailable', 'invalid-data') | endif
  if get(a:state, 'state', '') !=# 'ready' | return s:unavailable('unavailable', 'not-connected') | endif
  if empty(a:room) | return s:unavailable('unavailable', 'not-selected') | endif
  if get(a:room, 'type', '') !=# 'direct' | return s:unavailable('unavailable', 'not-direct') | endif
  if get(value, 'roomId', a:room.id) !=# a:room.id
        \ || !has_key(value, 'roomId') && (has_key(value, 'displayName') || has_key(value, 'lastActivity'))
    return s:unavailable('unavailable', 'invalid-data')
  endif
  return deepcopy(value)
endfunction
function! wbx#people#show() abort
  call wbx#people_popup#hide(1)
  if !wbx#lists#admit('people-details') | return 0 | endif
  let state = wbx#state()
  let selected = get(state, 'room', v:null)
  let room = type(selected) == v:t_dict ? selected : {}
  let value = s:details(state, room)
  let context = {'roomId': get(room, 'id', ''), 'sessionId': get(get(state, 'localContext', {}), 'sessionId', '')}
  let lines = ['People details - read-only local snapshot',
        \ 'Target: selected conversation, not the highlighted Spaces row.',
        \ 'Room ID: ' . get(room, 'id', '(none selected)'),
        \ 'Title: ' . wbx#notify_events#text(get(room, 'title', 'No selected conversation'), 160),
        \ 'Provider capability: ' . value.capability,
        \ 'Observation state: ' . value.state . ' (last published, not a new lookup)', '']
  call extend(lines, wbx#people#lines(value))
  call extend(lines, ['', 'Snapshot only; state/refresh callbacks never repaint or focus this buffer.',
        \ 'r / :WebexPeople: local snapshot refresh; q: exact-window return; /: native search.',
        \ ':WebexPeopleRefresh is a separate selected-DM provider read; opt-out/grant guards apply.',
        \ 'Enter/write never send, acknowledge, select a space or look up a person.',
        \ 'Inactive is not necessarily offline. Custom-status text is unsupported.'])
  let rows = []
  for line in lines
    let field = line =~# '^Person:' ? 'person' : line =~# '^\%(Presence\|Updating presence\)' ? 'presence'
          \ : line =~# '^Observed locally:' ? 'observed' : line =~# '^Last Webex activity:' ? 'activity'
          \ : line =~# '^Retry not before:' ? 'retry' : ''
    call add(rows, empty(field) ? '' : json_encode([context.sessionId, context.roomId, field]))
  endfor
  let buffer = wbx#lists#show('people-details', lines, rows)
  if buffer > 0 | call setbufvar(buffer, 'wbx_people_context', context) | endif
  return buffer
endfunction
function! wbx#people#_state() abort
  call wbx#people#sync(wbx#state())
endfunction
function! wbx#people#sync(state) abort
  call wbx#people#observe(a:state)
  call wbx#people#spaces_schedule()
  call wbx#people_popup#sync(a:state)
endfunction
function! wbx#people#obscures(window, row) abort
  return wbx#people_popup#obscures(a:window, a:row)
endfunction
augroup wbx_people_snapshot
  autocmd!
  autocmd User WbxState,WbxDisconnected call wbx#people#_state()
  autocmd TabEnter,BufWinEnter * call wbx#people#_state()
  autocmd TabLeave * call wbx#people_popup#hide()
  autocmd CursorMoved,WinEnter,VimResized,TextChanged,TextChangedI * call wbx#people#spaces_schedule()
  if exists('##WinScrolled')
    autocmd WinScrolled * call wbx#people#spaces_schedule()
  endif
  autocmd ColorScheme * call wbx#people#highlights()
  autocmd VimResized,WinEnter * call wbx#people_popup#sync(wbx#state())
  if exists('##WinResized')
    autocmd WinResized * call wbx#people_popup#sync(wbx#state())
  endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
