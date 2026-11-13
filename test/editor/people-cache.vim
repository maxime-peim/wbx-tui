" Observation caching is distinct from bounded HTTP relevance and exact session authority.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#supports_people_viewport() abort', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'people_status': 1}
try
  let rooms = map(range(300), '{"id": "cache-" . v:val, "type": "direct", "title": "Synthetic"}')
  let state = {'state': 'ready', 'room': v:null, 'rooms': rooms,
        \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'},
        \ 'peopleStatus': {'capability': 'ready', 'state': 'unknown', 'presence': 'unknown', 'customStatus': 'unsupported', 'reason': 'not-selected'}}
  for batch in range(3)
    let state.peopleViewport = map(copy(rooms[batch * 100 : batch * 100 + 99]),
          \ '{"roomId": v:val.id, "capability": "ready", "state": "fresh", "presence": "active", "customStatus": "unsupported", "observedAt": localtime() * 1000}')
    call wbx#people#observe(state)
  endfor
  for index in [0, 99, 150, 299]
    call assert_equal('WbxPresenceActive', wbx#people#badge(rooms[index]).group, 'scrolling past 128 observations retains known rows')
  endfor
  call remove(state, 'peopleViewport')
  call wbx#people#observe(state)
  let state.peopleViewport = map(copy(rooms[:7]), '{"roomId": v:val.id, "capability": "ready", "state": "unknown", "presence": "unknown", "customStatus": "unsupported", "reason": "not-loaded"}')
  call wbx#people#observe(state)
  call assert_equal('WbxPresenceActive', wbx#people#badge(rooms[0]).group, 'cache misses from the rolling identity window cannot erase a fresh observation')
  let state.rooms[0].type = 'group'
  call wbx#people#observe(state)
  call assert_equal('WbxPresenceUnknown', wbx#people#badge({'id': 'cache-0', 'type': 'direct'}).group, 'loss of live direct-row authority prunes its cache')
  let state.peopleStatus = {'capability': 'unavailable', 'state': 'unavailable', 'presence': 'unknown', 'customStatus': 'unsupported', 'reason': 'denied'}
  call wbx#people#observe(state)
  call assert_equal('WbxPresenceUnknown', wbx#people#badge(rooms[299]).group, 'denial clears prior observations')
  let state.peopleStatus = {'capability': 'ready', 'state': 'unknown', 'presence': 'unknown', 'customStatus': 'unsupported', 'reason': 'not-selected'}
  let state.localContext.sessionId = repeat('b', 32)
  call wbx#people#observe(state)
  call assert_equal('WbxPresenceUnknown', wbx#people#badge(rooms[150]).group, 'cache never crosses sessions/accounts')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
