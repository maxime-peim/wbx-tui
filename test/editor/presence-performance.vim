" Bounded catalogue/presence regression and timings; no backend or live session.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'people_status': 1}
let s:work = []
function! s:valid(state) abort
  return wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': a:state})
endfunction
function! s:peer(id) abort
  return {'roomId': a:id, 'capability': 'ready', 'state': 'fresh', 'presence': 'active',
        \ 'customStatus': 'unsupported', 'observedAt': localtime() * 1000}
endfunction
try
  for [room_count, peer_count] in [[32, 8], [437, 32], [500, 128]]
    let rooms = map(range(room_count), '{"id": "scale-" . v:val, "type": "direct", "title": "Synthetic"}')
    let state = {'revision': 1, 'state': 'ready', 'mode': 'demo', 'ready': v:true,
          \ 'room': copy(rooms[-1]), 'rooms': rooms, 'messages': [],
          \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'},
          \ 'peopleStatus': s:peer(rooms[-1].id),
          \ 'peopleViewport': map(copy(rooms[:peer_count - 1]), 's:peer(v:val.id)')}
    let original = deepcopy(state)
    let samples = {'rooms': room_count, 'peers': peer_count, 'validation_ms': [], 'observation_ms': []}
    for iteration in range(5)
      let start = reltime()
      let valid = s:valid(state)
      call add(samples.validation_ms, reltimefloat(reltime(start)) * 1000)
      call assert_true(valid)
      let start = reltime()
      call wbx#people#observe(state)
      call add(samples.observation_ms, reltimefloat(reltime(start)) * 1000)
    endfor
    call add(s:work, samples)
    call assert_equal(original, state, 'validation/observation cannot mutate wire state')
    for index in [0, peer_count - 1, room_count - 1]
      call assert_equal('WbxPresenceActive', wbx#people#badge(rooms[index]).group)
    endfor
  endfor
  let valid = deepcopy(state)
  for change in ['duplicate-room', 'duplicate-mixed-type', 'duplicate-peer', 'group', 'cached', 'unlisted',
        \ 'case', 'malformed-room', 'malformed-peer', 'wrong-selected', 'oversized', 'late-message', 'session']
    let bad = deepcopy(valid)
    if change ==# 'duplicate-room'
      let bad.rooms[-1] = copy(bad.rooms[0])
    elseif change ==# 'duplicate-mixed-type'
      let bad.rooms[-1] = extend(copy(bad.rooms[0]), {'type': 'group'})
    elseif change ==# 'duplicate-peer'
      let bad.peopleViewport[-1] = copy(bad.peopleViewport[0])
    elseif change ==# 'group'
      let bad.rooms[0].type = 'group'
    elseif change ==# 'cached'
      let bad.rooms[0].cached = v:true
    elseif change ==# 'unlisted'
      let bad.peopleViewport[0].roomId = 'never-listed'
    elseif change ==# 'case'
      let bad.peopleViewport[0].roomId = 'SCALE-0'
    elseif change ==# 'malformed-room'
      let bad.rooms[-1] = 'not a room'
    elseif change ==# 'malformed-peer'
      let bad.peopleViewport[-1].observedAt = 'not a date'
    elseif change ==# 'wrong-selected'
      let bad.peopleStatus.roomId = bad.rooms[0].id
    elseif change ==# 'oversized'
      call add(bad.peopleViewport, s:peer('scale-129'))
    elseif change ==# 'late-message'
      let bad.messages = [{'id': 'late', 'author': 'Synthetic', 'created': '', 'text': 42}]
    else
      let bad.localContext.sessionId = 'not-a-session'
    endif
    call assert_false(s:valid(bad), change . ' still fails after a valid observation')
  endfor
  let state = deepcopy(valid)
  let state.room = {'id': 'selected-unlisted', 'title': 'Selected outside catalogue', 'type': 'direct'}
  let state.peopleStatus = s:peer(state.room.id)
  call assert_true(s:valid(state), 'selected direct presence need not be in the bounded catalogue')
  call wbx#people#observe(state)
  call assert_equal('WbxPresenceActive', wbx#people#badge(state.room).group)
  let state.peopleSpaces = remove(state, 'peopleViewport')[:7]
  call assert_true(s:valid(state), 'legacy eight-peer observations retain the same room checks')
  let state.peopleSpaces[0].roomId = 'never-listed'
  call assert_false(s:valid(state))
  let state = deepcopy(valid)
  let state.room = v:null | let state.ready = v:false
  let state.peopleStatus = {'capability': 'ready', 'state': 'unknown', 'presence': 'unknown',
        \ 'customStatus': 'unsupported', 'reason': 'not-selected'}
  let state.spacesCache = {'state': 'stale', 'verified': v:false, 'observedAt': localtime() * 1000}
  for room in state.rooms | let room.cached = v:true | endfor
  call assert_false(s:valid(state), 'otherwise valid cached rows cannot authorize list presence')
  let state.peopleViewport = []
  call assert_true(s:valid(state), 'cached-only browse state remains valid without list observations')
  for change in ['unlisted', 'group', 'cached']
    let state = deepcopy(valid)
    let state.localContext.sessionId = repeat('b', 32)
    let state.room = v:null
    let state.peopleStatus = {'capability': 'ready', 'state': 'unknown', 'presence': 'unknown',
          \ 'customStatus': 'unsupported', 'reason': 'not-selected'}
    let state.peopleViewport = [s:peer('scale-0')]
    if change ==# 'unlisted'
      call remove(state.rooms, 0)
    elseif change ==# 'group'
      let state.rooms[0].type = 'group'
    else
      let state.rooms[0].cached = v:true
    endif
    call wbx#people#observe(state)
    call assert_equal('WbxPresenceUnknown', wbx#people#badge(valid.rooms[0]).group, change . ' is not ingested')
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'work': s:work})], $WBX_EDITOR_RESULT)
qa!
