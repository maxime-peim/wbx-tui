" Explicit selected-room read-only roster. Names/rows are not membership permission.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:buffer = 0
let s:visibility_pending = {}
let s:visibility_serial = 0
function! s:received(origin, response) abort
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#members(value) || value.roomId !=# a:origin.room | call wbx#_protocol_error() | return | endif
  if !wbx#view#intent_valid(a:origin.intent) | return | endif
  let lines = ['Participants · selected room ' . value.roomId,
        \ value.state . ' · ' . (value.partial ? 'PARTIAL loaded roster' : 'Complete API response at observation') . ' · ' . len(value.items) . ' loaded · observed locally ' . strftime('%H:%M:%S %Z'),
        \ 'r refresh · ]p next page · Enter exact participant actions · q return · no presence/permission inference']
  call extend(lines, map(copy(value.items), 'v:val.label . (v:val.moderator ? " [moderator]" : "") . " · " . v:val.personId'))
  let rows = repeat([''], 3) + map(copy(value.items), 'v:val.id')
  let s:buffer = wbx#lists#show('members', lines, rows)
  if s:buffer <= 0 | return | endif
  let b:wbx_members_owned = 1
  let b:wbx_members_snapshot = deepcopy(value)
  let b:wbx_members_tick = b:changedtick
  let b:wbx_members_session = get(a:origin.intent, 'session', '')
endfunction
function! wbx#members#show(more) abort
  if !wbx#supports('room-members-v1') | echomsg '[wbx-tui] Roster requires an updated connected backend.' | return | endif
  if !wbx#lists#admit('members') | return | endif
  let room = get(wbx#state(), 'room', v:null)
  if type(room) != v:t_dict || !get(wbx#state(), 'ready', 0) | return | endif
  let previous = getbufvar(s:buffer, 'wbx_members_snapshot', {})
  if a:more && (!wbx#lists#clean(s:buffer, 'members') || get(previous, 'roomId', '') !=# room.id || !get(previous, 'more', 0))
    echomsg '[wbx-tui] No next loaded roster page; refresh explicitly.' | return
  endif
  let origin = {'room': room.id, 'intent': wbx#view#intent()}
  call wbx#rpc('members.list', {'more': a:more ? v:true : v:false}, function('s:received', [origin]))
endfunction
function! wbx#members#selected() abort
  if line('.') < 4 || !wbx#lists#clean(bufnr('%'), 'members') | return {} | endif
  let state = wbx#state()
  let room = get(state, 'room', v:null)
  let value = get(b:, 'wbx_members_snapshot', {})
  if !get(state, 'ready', 0) || type(room) != v:t_dict || get(value, 'roomId', '') !=# room.id | return {} | endif
  let id = wbx#lists#selected_id()
  return empty(id) ? {} : deepcopy(get(filter(copy(get(value, 'items', [])), 'v:val.id ==# id'), 0, {}))
endfunction
function! s:pick(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! wbx#members#action() abort
  let target = wbx#members#selected()
  if empty(target) | echomsg '[wbx-tui] Choose an unchanged selected-room participant row.' | return | endif
  let origin = wbx#view#intent()
  call s:pick(['Exact participant ' . target.label . ' [' . target.personId . ']:',
        \ '1. Prepare a plaintext DM (does not send)', '2. Remove this membership (fresh moderator proof and confirmation)'],
        \ function('s:chosen', [origin, target]))
endfunction
function! s:chosen(origin, target, choice) abort
  if !wbx#view#picker_valid(a:origin) || wbx#members#selected() !=# a:target | return | endif
  if a:choice == 1 | call wbx#conversations#direct(a:target.personId)
  elseif a:choice == 2 | call wbx#conversations#action('remove', '') | endif
endfunction
function! s:visibility_session() abort
  let state = wbx#state() | let room = get(state, 'room', v:null)
  let local = get(state, 'localContext', {})
  return get(state, 'state', '') ==# 'ready' && get(state, 'ready', 0) && type(room) == v:t_dict
        \ && get(room, 'type', '') ==# 'direct' && !has_key(room, 'teamId') && !get(room, 'cached', 0) && !get(room, 'revoked', 0)
        \ && exists('*wbx#supports_member_visibility') && wbx#supports_member_visibility('own-direct-v1')
        \ && wbx#protocol#local_context(local) ? local.sessionId : ''
endfunction
function! wbx#members#visibility_bound() abort
  let value = get(b:, 'wbx_member_visibility_snapshot', {})
  return wbx#lists#clean(bufnr('%'), 'direct-visibility') && wbx#protocol#member_visibility(value)
        \ && value.sessionId ==# s:visibility_session() && value.roomId ==# get(get(wbx#state(), 'room', {}), 'id', '')
endfunction
function! wbx#members#visibility_current() abort
  return wbx#members#visibility_bound() && localtime() * 1000 - b:wbx_member_visibility_snapshot.observedAt >= -999
        \ && localtime() * 1000 - b:wbx_member_visibility_snapshot.observedAt < 120000
endfunction
function! s:visibility_source() abort
  if wbx#members#visibility_bound() | return 1 | endif
  let kind = get(b:, 'wbx_kind', '') | let room = get(get(wbx#state(), 'room', {}), 'id', '')
  return index(['rooms', 'history', 'compose'], kind) >= 0 && wbx#view#owned(bufnr('%'), kind)
        \ && (kind ==# 'rooms' || (kind ==# 'history' ? get(b:, 'wbx_history_room', '') : get(b:, 'wbx_room', '')) ==# room)
endfunction
function! s:visibility_context() abort
  return {'kind': get(b:, 'wbx_kind', ''), 'destination': get(b:, 'wbx_room', ''), 'draft': get(b:, 'wbx_draft_id', ''),
        \ 'history': get(b:, 'wbx_history_room', ''), 'file': deepcopy(get(b:, 'wbx_staged_upload', {})),
        \ 'target': deepcopy(get(b:, 'wbx_upload_target', {})), 'snapshot': deepcopy(get(b:, 'wbx_member_visibility_snapshot', {}))}
endfunction
function! wbx#members#visibility_reason(refresh) abort
  if empty(s:visibility_session())
    return 'Choose a ready selected direct space with own-direct-v1 support; this is not a Hidden list or preference writer'
  endif
  if a:refresh ? !wbx#members#visibility_bound() : !s:visibility_source()
    return 'Choose an owned selected-direct history/list/composer or unchanged same-session API flag view; native work is retained'
  endif
  return ''
endfunction
function! s:visibility_received(origin, response) abort
  if get(s:visibility_pending, 'serial', 0) == a:origin.serial | let s:visibility_pending = {} | endif
  if a:origin.serial != s:visibility_serial || s:visibility_session() !=# a:origin.session
        \ || !wbx#view#intent_valid(a:origin.intent) || a:origin.context !=# s:visibility_context() || !s:visibility_source() | return | endif
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#member_visibility(value) || value.roomId !=# a:origin.room || value.sessionId !=# a:origin.session
    call wbx#_protocol_error() | return
  endif
  let age = localtime() * 1000 - value.observedAt
  if age < -999 || age >= 120000
    echomsg '[wbx-tui] API flag response stale/future-dated; refresh explicitly. No preference state was installed.' | return
  endif
  let flag = value.isRoomHidden is v:null ? 'Not provided by API (not false)' : value.isRoomHidden ? 'true' : 'false'
  let lines = ['Own direct-membership API flag · ' . value.roomId,
        \ 'Observed ' . strftime('%H:%M:%S %Z', value.observedAt / 1000) . ' · response only, NOT ongoing synchronization',
        \ 'r explicitly rereads SAME own direct membership · q returns · Enter/write never send or change preferences',
        \ 'isRoomHidden: ' . flag,
        \ 'Not Favorites, not server mute, not a complete product Hidden list or a preference writer.',
        \ 'API flag equivalence to current app Hide is unestablished. No local filtering, alert suppression or Favorites removal.',
        \ 'API description: a new message may make the direct room visible again. No other-client behavior is inferred.']
  let buffer = wbx#lists#show('direct-visibility', lines)
  if buffer > 0 && bufnr('%') == buffer && wbx#lists#clean(buffer, 'direct-visibility') && s:visibility_session() ==# value.sessionId
    let b:wbx_member_visibility_snapshot = deepcopy(value)
  endif
endfunction
function! wbx#members#visibility() abort
  let reason = wbx#members#visibility_reason(0)
  if !empty(reason) | echomsg '[wbx-tui] ' . reason | return | endif
  if !wbx#lists#admit('direct-visibility') | return | endif
  let session = s:visibility_session()
  if !empty(s:visibility_pending) && (s:visibility_pending.session !=# session
        \ || !wbx#view#intent_valid(s:visibility_pending.intent) || localtime() * 1000 - s:visibility_pending.started >= 20000)
    let s:visibility_pending = {} | let s:visibility_serial += 1
  endif
  if !empty(s:visibility_pending) | echomsg '[wbx-tui] An own-membership flag read is pending. Nothing queued or retried.' | return | endif
  let s:visibility_serial += 1
  let origin = {'session': session, 'room': wbx#state().room.id, 'serial': s:visibility_serial,
        \ 'started': localtime() * 1000, 'intent': wbx#view#intent(), 'context': s:visibility_context()}
  let s:visibility_pending = origin
  if wbx#rpc('members.visibility', {'roomId': origin.room}, function('s:visibility_received', [origin])) < 0
        \ && get(s:visibility_pending, 'serial', 0) == origin.serial | let s:visibility_pending = {} | endif
endfunction
function! wbx#members#visibility_refresh() abort
  let reason = wbx#members#visibility_reason(1)
  if !empty(reason) | echomsg '[wbx-tui] ' . reason | return | endif
  call wbx#members#visibility()
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
