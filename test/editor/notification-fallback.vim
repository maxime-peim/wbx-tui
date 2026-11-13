" Degraded creation events, genuine SDK activity and synthetic time only.
set encoding=utf-8
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:now = wbx#notify_events#time('2026-11-11T12:00:00Z')
let s:options = {'messages': 1, 'preview': 1, 'sender_names': 1, 'suppress_visible': 1}
function! s:state() abort
  return {'state': 'ready', 'ready': v:true, 'room': {'id': 'selected', 'title': 'Selected'}, 'messages': [],
        \ 'readStatus': 'ready', 'rooms': [{'id': 'other', 'title': 'Other', 'unread': v:false,
        \ 'unreadActivity': '2026-11-11T11:59:59Z'}], 'messageEvents': {'state': 'live', 'received': 0, 'items': []}}
endfunction
function! s:observe() abort
  return wbx#notify_events#observe(s:tracker, s:state, s:now, s:options, '')
endfunction
function! s:event(id, stamp) abort
  return {'id': a:id, 'roomId': 'other', 'created': a:stamp, 'self': v:false,
        \ 'observedAt': s:now, 'preview': 'PRIVATE excerpt', 'senderName': 'PRIVATE sender'}
endfunction
try
  let s:tracker = wbx#notify_events#new()
  let s:state = s:state()
  call assert_equal([], s:observe(), 'startup is a baseline')
  let s:state.messageEvents.state = 'polling'
  let s:state.rooms[0].unread = v:true
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:00Z'
  let events = s:observe()
  call assert_equal(1, len(events), 'fresh SDK unread activity survives a failed creation listener')
  if !empty(events)
    call assert_equal('unread', events[0].kind, 'fallback is not invented message-created evidence')
    call assert_equal('', events[0].preview)
    call assert_false(has_key(events[0], 'sender'))
  endif
  call assert_equal([], s:observe(), 'unchanged polling cannot replay activity')
  let s:state.messageEvents.items = [s:event('late', '2026-11-11T12:00:00Z')]
  call assert_equal([], s:observe(), 'a delayed creation covered by the generic fallback cannot duplicate it')
  let s:state.messageEvents.state = 'live'
  call assert_equal([], s:observe(), 'restoring event delivery never replays the fallback')
  call add(s:state.messageEvents.items, s:event('live', '2026-11-11T12:00:01Z'))
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:01Z'
  let events = s:observe()
  call assert_equal(1, len(events))
  if !empty(events) | call assert_equal('message', events[0].kind) | endif
  let s:state.messageEvents.state = 'polling'
  call assert_equal([], s:observe(), 'later unread metadata cannot repeat an already consumed creation')
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:02Z'
  call assert_equal(1, len(s:observe()), 'later activity in an already-unread space gets a generic alert')
  let s:options.messages = 0
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:03Z'
  call assert_equal([], s:observe())
  let s:options.messages = 1
  call add(s:state.messageEvents.items, s:event('muted-late', '2026-11-11T12:00:03Z'))
  call assert_equal([], s:observe(), 'muted fallback activity and its late creation are consumed, not replayed')
  call wbx#notify_events#sent(s:tracker, 'other', 'own')
  call add(s:state.messageEvents.items, s:event('own', '2026-11-11T12:00:04Z'))
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:04Z'
  call assert_equal([], s:observe(), 'an exact acknowledged plugin creation cannot become a generic duplicate')
  let item = s:event('same-account', '2026-11-11T12:00:05Z') | let item.self = v:true
  call add(s:state.messageEvents.items, item)
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:05Z'
  call assert_equal([], s:observe(), 'same-account other-client posts stay suppressed, including their unread fallback')
  call add(s:state.messageEvents.items, s:event('incoming-after-self', '2026-11-11T12:00:05Z'))
  call assert_equal(1, len(s:observe()), 'self suppression does not consume another actor creation at the same timestamp')
  call assert_equal([], s:observe(), 'neither self nor incoming creations replay on another publication')

  for change in [{'unreadStale': v:true}, {'cached': v:true}, {'unreadActivity': '2026-11-11T10:00:00Z'},
        \ {'unreadActivity': '2026-11-11T12:00:06Z'}, {'unreadActivity': 'invalid'}]
    let s:tracker = wbx#notify_events#new() | let s:state = s:state()
    call s:observe()
    let s:state.messageEvents.state = 'polling'
    call extend(s:state.rooms[0], extend({'unread': v:true, 'unreadActivity': '2026-11-11T12:00:00Z'}, change), 'force')
    call assert_equal([], s:observe(), 'no fallback for stale/cache/old/future/malformed activity: ' . string(change))
  endfor
  for health in ['failed', 'connecting', 'off', 'live']
    let s:tracker = wbx#notify_events#new() | let s:state = s:state()
    call s:observe()
    let s:state.messageEvents.state = health | let s:state.rooms[0].unread = v:true
    let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:00Z'
    call assert_equal([], s:observe(), 'only known degraded/polling delivery permits fallback: ' . health)
  endfor
  let s:tracker = wbx#notify_events#new() | let s:state = s:state()
  call s:observe()
  let s:state.readStatus = 'failed' | let s:state.messageEvents.state = 'polling'
  let s:state.rooms[0].unread = v:true | let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:00Z'
  call assert_equal([], s:observe())
  let s:state.readStatus = 'ready'
  call assert_equal([], s:observe(), 'read-source recovery is a new baseline, not fresh continuity')
  let s:state.rooms = []
  call s:observe()
  call assert_equal({}, get(s:tracker, 'fallbackActivity', {}), 'room removal prunes generic fallback watermarks')
  call assert_equal({}, get(s:tracker, 'globalActivity', {}), 'room removal prunes creation activity watermarks')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
