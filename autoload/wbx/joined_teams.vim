" Explicit joined membership list only; no joins, room scans or role authority.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:serial = 0
let s:pending = {}
function! s:session() abort
  let state = wbx#state()
  let local = get(state, 'localContext', {})
  return get(state, 'state', '') ==# 'ready' && wbx#supports('joined-teams-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(local) ? local.sessionId : ''
endfunction
function! wbx#joined_teams#bound() abort
  return wbx#lists#clean(bufnr('%'), 'joined-teams') && wbx#protocol#joined_teams(get(b:, 'wbx_joined_teams_snapshot', {}))
        \ && b:wbx_joined_teams_snapshot.sessionId ==# s:session()
endfunction
function! wbx#joined_teams#current() abort
  if !wbx#joined_teams#bound() || get(b:, 'wbx_joined_teams_stale', 0) | return 0 | endif
  let age = localtime() * 1000 - b:wbx_joined_teams_snapshot.observedAt
  return age >= -999 && age < 120000
endfunction
function! s:received(origin, response) abort
  if get(s:pending, 'serial', 0) == a:origin.serial | let s:pending = {} | endif
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#joined_teams(value) || value.sessionId !=# a:origin.session || value.revision <= a:origin.page_revision
    call wbx#_protocol_error() | return
  endif
  if !wbx#view#intent_valid(a:origin.intent) || a:origin.serial != s:serial || s:session() !=# a:origin.session | return | endif
  let age = localtime() * 1000 - value.observedAt
  if age < -999 || age >= 120000
    echomsg '[wbx-tui] Joined-Team response is stale/future-dated. Start a fresh explicit query; nothing installed.' | return
  endif
  let loaded = {}
  for room in get(wbx#state(), 'rooms', [])
    if get(room, 'cached', 0) || empty(get(room, 'teamId', '')) | continue | endif
    let loaded[room.teamId] = get(loaded, room.teamId, 0) + 1
  endfor
  let lines = ['JOINED Teams · API membership list at observation · not organization/public discovery',
        \ (value.partial ? 'PARTIAL · limit: ' . value.limit : 'API query exhausted at observation; not atomic or current role/room authority')
        \ . ' · ' . len(value.items) . '/250 retained · observed ' . strftime('%H:%M:%S %Z', value.observedAt / 1000) . ' · two-minute expiry',
        \ 'r fresh query · ]p one next page · Enter filters LOADED spaces only · q returns · / searches; never joins',
        \ 'Names are sanitized/clipped presentation; a missing loaded space is not proof the Team has none.', '']
  call extend(lines, map(copy(value.items), 'v:val.label . " [" . v:val.teamId . "] · " . get(loaded, v:val.teamId, 0) . " loaded spaces"'))
  let rows = repeat([''], 5) + map(copy(value.items), 'v:val.teamId')
  if empty(value.items)
    call add(lines, '[No API-visible joined Teams returned; not organization absence/deletion proof]') | call add(rows, '')
  endif
  let buffer = wbx#lists#show('joined-teams', lines, rows)
  if buffer <= 0 || bufnr('%') != buffer || !wbx#lists#clean(buffer, 'joined-teams') || s:session() !=# value.sessionId | return | endif
  let b:wbx_joined_teams_snapshot = deepcopy(value)
  let b:wbx_joined_teams_stale = 0
endfunction
function! wbx#joined_teams#invalidate(session, revision) abort
  let buffer = bufnr('wbx://joined-teams')
  let value = getbufvar(buffer, 'wbx_joined_teams_snapshot', {})
  if get(value, 'sessionId', '') ==# a:session && get(value, 'revision', 0) == a:revision
    call setbufvar(buffer, 'wbx_joined_teams_stale', 1)
  endif
endfunction
function! wbx#joined_teams#show(mode) abort
  let session = s:session()
  if empty(session)
    echomsg '[wbx-tui] Joined Teams require a connected joined-teams-v1 backend and known grant; no connection or query started.' | return
  endif
  if !wbx#lists#admit('joined-teams') | return | endif
  if a:mode && (!wbx#joined_teams#bound() || a:mode == 1 && (!wbx#joined_teams#current() || !b:wbx_joined_teams_snapshot.more))
    echomsg '[wbx-tui] No current/next joined-Team query in this session. Start a fresh explicit :WebexJoinedTeams.' | return
  endif
  if !empty(s:pending) && s:pending.session !=# session | let s:pending = {} | let s:serial += 1 | endif
  if !empty(s:pending) | echomsg '[wbx-tui] A joined-Team read is pending. Nothing queued or automatically retried.' | return | endif
  let params = a:mode == 1 ? {'more': v:true, 'revision': b:wbx_joined_teams_snapshot.revision} : {}
  let s:serial += 1
  let origin = {'serial': s:serial, 'session': session, 'intent': wbx#view#intent(),
        \ 'page_revision': a:mode == 1 ? params.revision : 0}
  let s:pending = origin
  if wbx#rpc('teams.joined', params, function('s:received', [origin])) < 0
        \ && get(s:pending, 'serial', 0) == origin.serial | let s:pending = {} | endif
endfunction
function! wbx#joined_teams#selected() abort
  if line('.') < 6 || !wbx#joined_teams#current() | return {} | endif
  let id = wbx#lists#selected_id()
  return empty(id) ? {} : deepcopy(get(filter(copy(b:wbx_joined_teams_snapshot.items), 'v:val.teamId ==# id'), 0, {}))
endfunction
function! wbx#joined_teams#filter() abort
  let team = wbx#joined_teams#selected()
  if empty(team) | echomsg '[wbx-tui] Choose an exact, unchanged, unexpired joined-Team row in its original session.' | return | endif
  let rooms = filter(copy(get(wbx#state(), 'rooms', [])), '!get(v:val, "cached", 0) && get(v:val, "teamId", "") ==# team.teamId')
  if empty(rooms)
    let loaded_count = len(get(wbx#state(), 'rooms', []))
    echomsg '[wbx-tui] No matching spaces are currently loaded (not proof of absence). '
          \ . (loaded_count >= 500 ? 'The 500-room catalogue cap is reached; paging cannot bypass it. Use Webex for unloaded Team spaces.'
          \ : ':WebexMoreSpaces explicitly loads one global page while below the 500-room cap; a Team result does not guarantee its spaces are reachable.')
          \ . ' No membership change is needed; no rooms were fetched and nothing joined.' | return
  endif
  call wbx#teams#filter(team.teamId)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
