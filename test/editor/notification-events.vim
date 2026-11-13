" Pure notification detection: synthetic data/time, no UI, jobs or backend.
set encoding=utf-8
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:o = {'messages': 1, 'meetings': 1, 'preview': 0, 'suppress_visible': 1, 'meeting_minutes': [5, 0]}
let s:now = wbx#notify_events#time('2026-11-11T12:00:00.000Z')
function! s:message(id, time) abort
  return {'id': a:id, 'author': 'Synthetic', 'created': a:time, 'text': 'PRIVATE message body'}
endfunction
function! s:observe(state, visible) abort
  return wbx#notify_events#observe(s:t, a:state, s:now, s:o, a:visible)
endfunction
function! s:agenda(start) abort
  return {'state': 'ready', 'observedAt': s:now, 'items': [{'id': 'm', 'title': 'Synthetic meeting', 'start': a:start, 'end': '2026-11-11T13:00:00.000Z'}]}
endfunction
try
  call assert_equal(0, wbx#notify_events#time('1970-01-01T00:00:00Z'))
  call assert_equal(1709164800000, wbx#notify_events#time('2024-02-29T00:00:00Z'))
  call assert_equal(-1, wbx#notify_events#time('2023-02-29T00:00:00Z'))
  call assert_equal(-1, wbx#notify_events#time('2026-13-01T00:00:00Z'))
  call assert_equal(wbx#notify_events#time('2026-11-11T12:00:00.100Z'), wbx#notify_events#time('2026-11-11T12:00:00.1Z'))
  let epoch = wbx#notify_events#time('2000-02-29T00:00:00Z')
  for [fraction, milliseconds] in [['', 0], ['.0', 0], ['.00', 0], ['.000', 0], ['.1', 100], ['.10', 100], ['.100', 100], ['.01', 10], ['.001', 1], ['.999', 999]]
    let stamp = '2000-02-29T00:00:00' . fraction . 'Z'
    call assert_equal(epoch + milliseconds, wbx#notify_events#time(stamp))
    call assert_equal(epoch + milliseconds, wbx#notify_events#time(stamp), 'cached fractions preserve exact UTC arithmetic')
  endfor
  call assert_equal(13574563200000, wbx#notify_events#time('2400-02-29T00:00:00Z'))
  for invalid in ['', '1969-12-31T23:59:59Z', '1900-02-29T00:00:00Z', '2100-02-29T00:00:00Z', '2026-00-01T00:00:00Z',
        \ '2026-01-00T00:00:00Z', '2026-04-31T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z',
        \ '2026-01-01T00:00:60Z', '2026-01-01T00:00:00.Z', '2026-01-01T00:00:00.0000Z', '2026-01-01T00:00:00z',
        \ '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00', "2026-01-01T00:00:00Z\n", ' 2026-01-01T00:00:00Z']
    call assert_equal(-1, wbx#notify_events#time(invalid))
    call assert_equal(-1, wbx#notify_events#time(invalid), 'invalid results remain invalid on cache hits')
  endfor
  for invalid in [0, -1, 1.5, v:true, v:false, v:null, [], {}]
    call assert_equal(-1, wbx#notify_events#time(invalid), 'non-string inputs cannot collide with string cache keys')
  endfor
  let s:t = wbx#notify_events#new()
  let s:state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Room'}, 'messages': [s:message('old', '2026-11-11T11:00:00Z')],
        \ 'readStatus': 'ready', 'rooms': [{'id': 'other', 'title': 'Other', 'unread': v:false}]}
  call assert_equal([], s:observe(s:state, ''), 'initial history and initial unread state are baselines')
  call add(s:state.messages, s:message('new', '2026-11-11T12:00:00Z'))
  let events = s:observe(s:state, '')
  call assert_equal(1, len(events))
  call assert_equal('message', events[0].kind)
  call assert_equal('', events[0].preview, 'private body is not retained when previews are explicitly disabled')
  call assert_equal([], s:observe(s:state, ''), 'polls never repeat messages')
  let s:state.messages[-1].text = 'Edited content / decoded image'
  call assert_equal([], s:observe(s:state, ''), 'edits and image updates are not messages')
  call insert(s:state.messages, s:message('older-page', '2026-11-10T11:00:00Z'))
  call assert_equal([], s:observe(s:state, ''), 'older paging never creates alerts')
  call add(s:state.messages, s:message('same-ms', '2026-11-11T12:00:00.000Z'))
  call assert_equal(1, len(s:observe(s:state, '')), 'different IDs sharing a timestamp remain distinct')
  call wbx#notify_events#sent(s:t, 'r', 'own')
  call extend(s:state.messages, [s:message('own', '2026-11-11T12:00:01Z'), s:message('incoming', '2026-11-11T12:00:02Z')])
  call assert_equal(1, s:observe(s:state, '')[0].count, 'exact own-send exclusion preserves simultaneous incoming messages')
  call add(s:state.messages, s:message('visible', '2026-11-11T12:00:03Z'))
  call assert_equal([], s:observe(s:state, 'r'), 'visible latest message is quietly consumed')
  call assert_equal([], s:observe(s:state, ''), 'leaving the reader cannot replay suppressed messages')
  let s:state.rooms[0].unread = v:true
  call assert_equal('unread', s:observe(s:state, '')[0].kind)
  call assert_equal([], s:observe(s:state, ''), 'an already-unread space does not invent additional messages')
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:00.000Z'
  call assert_equal([], s:observe(s:state, ''), 'first SDK activity observation establishes its own baseline')
  let s:state.rooms[0].lastActivity = '2027-01-01T00:00:00.000Z'
  call assert_equal([], s:observe(s:state, ''), 'REST ordering changes never trigger notifications')
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:01.000Z'
  let events = s:observe(s:state, '')
  call assert_equal(1, len(events), 'an already-unread non-selected space can notify again on new fresh SDK activity')
  call assert_true(events[0].activity)
  call assert_equal([], s:observe(s:state, ''), 'repeated SDK activity has no duplicate notification')
  let s:state.readStatus = 'failed'
  call s:observe(s:state, '')
  let s:state.readStatus = 'ready'
  call assert_equal([], s:observe(s:state, ''), 'unread recovery establishes a baseline, not backlog')
  let s:state.rooms[0].unread = v:false
  let s:state.rooms[0].unreadStale = v:true
  call s:observe(s:state, '')
  let s:state.rooms[0].unread = v:true
  let s:state.rooms[0].unreadStale = v:false
  call assert_equal([], s:observe(s:state, ''), 'stale-to-fresh transitions do not authorize alerts')
  let s:state.rooms[0].cached = v:true
  call assert_equal([], s:observe(s:state, ''), 'cached spaces do not notify')
  call remove(s:state.rooms[0], 'cached')
  call assert_equal([], s:observe(s:state, ''))
  let s:state.ready = v:false | let s:state.messages = []
  call s:observe(s:state, '')
  let s:state.ready = v:true | let s:state.messages = [s:message('reload', '2026-11-11T12:01:00Z')]
  call assert_equal([], s:observe(s:state, ''), 'explicit history reset/re-entry is not a notification source')
  call wbx#notify_events#sent(s:t, 'r', '')
  call add(s:state.messages, s:message('legacy-own', '2026-11-11T12:01:01Z'))
  call assert_equal([], s:observe(s:state, ''), 'old backends conservatively baseline one batch after local send')
  let s:o.messages = 0
  call add(s:state.messages, s:message('disabled', '2026-11-11T12:01:02Z'))
  call assert_equal([], s:observe(s:state, ''))
  let s:o.messages = 1
  call assert_equal([], s:observe(s:state, ''), 'enabling does not replay disabled messages')
  let s:o.preview = 1
  call add(s:state.messages, s:message('preview', '2026-11-11T12:01:03Z'))
  let s:state.messages[-1].text = "PRIVATE\n" . nr2char(27) . "[31m" . nr2char(0x202e) . 'plain'
  let events = s:observe(s:state, '')
  call assert_notmatch('[\x00-\x1f]', events[0].preview)
  call assert_notmatch(nr2char(0x202e), events[0].preview)
  let s:t = wbx#notify_events#new()
  let s:state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Selected'}, 'messages': [],
        \ 'readStatus': 'ready', 'rooms': [{'id': 'other', 'title': 'Other', 'unread': v:false, 'unreadActivity': '2026-11-11T11:00:00.000Z'}],
        \ 'messageEvents': {'state': 'live', 'received': 0, 'items': []}}
  call assert_equal([], s:observe(s:state, ''))
  let item = {'id': 'global', 'roomId': 'other', 'created': '2026-11-11T12:00:00.000Z', 'self': v:false, 'observedAt': s:now}
  let s:state.messageEvents.items = [item] | let s:state.messageEvents.received = 1
  call assert_equal(1, s:observe(s:state, '')[0].count, 'actual off-space creation notifies with unchanged server-read metadata')
  call assert_equal([], s:observe(s:state, ''), 'repeated snapshots cannot replay the SDK event')
  let s:state.rooms[0].unread = v:true
  let s:state.rooms[0].unreadActivity = '2026-11-11T12:00:00.000Z'
  call assert_equal([], s:observe(s:state, ''), 'later unread reconciliation cannot duplicate a confirmed message alert')
  let item = extend(copy(item), {'id': 'native-own', 'self': v:true})
  call add(s:state.messageEvents.items, item)
  call assert_equal([], s:observe(s:state, ''), 'same-account messages never notify, regardless of client')
  call wbx#notify_events#sent(s:t, 'other', 'exact-own')
  call add(s:state.messageEvents.items, extend(copy(item), {'id': 'exact-own', 'self': v:true}))
  call assert_equal([], s:observe(s:state, ''), 'exact acknowledged plugin sends remain excluded, not the whole account')
  call add(s:state.messageEvents.items, extend(copy(item), {'id': 'selected-sdk', 'roomId': 'r', 'self': v:false}))
  call assert_equal(1, s:observe(s:state, '')[0].count, 'selected-space SDK creation can notify when the reader is not visible')
  call add(s:state.messages, s:message('selected-sdk', '2026-11-11T12:00:00.000Z'))
  call assert_equal([], s:observe(s:state, ''), 'REST cannot duplicate the selected SDK creation or invent self identity')
  let s:state.readStatus = 'failed' | let s:state.rooms[0].unreadStale = v:true
  call add(s:state.messageEvents.items, extend(copy(item), {'id': 'status-unavailable', 'self': v:false}))
  call assert_equal(1, s:observe(s:state, '')[0].count, 'confirmed creation is independent of unread status, not receipt authority')
  call add(s:state.messageEvents.items, extend(copy(item), {'id': 'old', 'self': v:false, 'created': '2026-11-11T11:00:00.000Z'}))
  call assert_equal([], s:observe(s:state, ''), 'reconnect backlog is not a notification')
  let s:o.messages = 0
  call add(s:state.messageEvents.items, extend(copy(item), {'id': 'disabled-sdk', 'self': v:false}))
  call assert_equal([], s:observe(s:state, ''))
  let s:o.messages = 1
  call assert_equal([], s:observe(s:state, ''), 're-enabling cannot replay consumed global events')
  let s:state.rooms[0].notifications = v:false
  call add(s:state.messageEvents.items,extend(copy(item),{'id':'muted-room','self':v:false}))
  call assert_equal([],s:observe(s:state,''),'server-muted rooms cannot notify')
  let s:state.rooms[0].notifications = v:true
  call assert_equal([],s:observe(s:state,''),'unmuting cannot replay consumed creations')
  call add(s:state.messageEvents.items,extend(copy(item),{'id':'unmuted-future','self':v:false}))
  call assert_equal(1,s:observe(s:state,'')[0].count,'fresh future messages in an unmuted room still notify')
  let s:t = wbx#notify_events#new()
  call assert_equal([], s:observe(s:state, ''), 'initial retained SDK events are a baseline, not history replay')
  let s:t = wbx#notify_events#new()
  let agenda = s:agenda('2026-11-11T12:05:00.000Z')
  call assert_equal(1, len(wbx#notify_events#meetings(s:t, agenda, s:now, s:o)), '5-minute reminder is admitted once')
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, s:now, s:o))
  let start = s:now + 300000
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, start, s:o), 'expired ready label alone is not fresh evidence')
  let agenda.observedAt = start
  let agenda.state = 'stale'
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, start, s:o))
  let agenda.state = 'ready'
  call assert_equal(1, len(wbx#notify_events#meetings(s:t, agenda, start, s:o)), 'fresh start reminder is independent of the earlier phase')
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, start, s:o))
  let agenda.items[0].start = '2026-11-11T12:06:00.000Z'
  call assert_equal(1, len(wbx#notify_events#meetings(s:t, agenda, start, s:o)), 'a rescheduled occurrence has its own key')
  let agenda.items = []
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, start, s:o), 'removed meetings cannot remind')
  let s:t = wbx#notify_events#new()
  let s:o.meeting_minutes = [10, 5, 1, 0]
  let agenda = s:agenda('2026-11-11T12:00:30.000Z')
  call assert_equal(1, len(wbx#notify_events#meetings(s:t, agenda, s:now, s:o)), 'late discovery coalesces already-due lead times')
  call assert_equal(3, len(s:t.meetings))
  let s:t = wbx#notify_events#new()
  let s:o.meetings = 0
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, s:now, s:o))
  let s:o.meetings = 1
  call assert_equal([], wbx#notify_events#meetings(s:t, agenda, s:now, s:o), 'suppressed phases are not replayed')
  for i in range(1, 300)
    let agenda.items[0].id = 'bounded-' . i
    call wbx#notify_events#meetings(s:t, agenda, s:now, s:o)
  endfor
  call assert_true(len(s:t.meetings) <= 256, 'meeting deduplication storage is bounded')

  " Cache internals are inspected only in this fresh synthetic editor. No public
  " diagnostic API exposes timestamp keys or message content.
  execute 'source ' . fnameescape($WBX_EDITOR_ROOT . '/autoload/wbx/notify_events.vim')
  let s:time_sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/notify_events.vim$"')[0].sid
  function! s:time_cache() abort
    return getscriptinfo({'sid': s:time_sid})[0].variables
  endfunction
  let limit = s:time_cache().time_cache_limit
  call assert_equal(2048, limit, 'UTC cache has an explicit fixed entry bound')
  let first = '1970-01-01T00:00:00Z'
  let invalid = '2100-02-29T00:00:00Z'
  call assert_equal(0, wbx#notify_events#time(first))
  call assert_equal(-1, wbx#notify_events#time(invalid))
  for i in range(1, limit - 2)
    call assert_equal(-1, wbx#notify_events#time('invalid-' . i))
  endfor
  call assert_equal(limit, len(s:time_cache().time_cache))
  call assert_equal(limit, len(s:time_cache().time_cache_keys))
  call assert_equal(0, wbx#notify_events#time(first), 'a cache hit does not require spare capacity')
  call assert_equal(-1, wbx#notify_events#time(invalid))
  call assert_equal(0, s:time_cache().time_cache_next, 'hits do not churn the FIFO')
  call assert_equal(1, wbx#notify_events#time('1970-01-01T00:00:00.001Z'))
  call assert_false(has_key(s:time_cache().time_cache, first), 'the oldest entry is evicted at capacity')
  call assert_equal(0, wbx#notify_events#time(first), 'evicted valid input is correctly recomputed')
  call assert_false(has_key(s:time_cache().time_cache, invalid), 'invalid entries share the same bounded eviction policy')
  call assert_equal(-1, wbx#notify_events#time(invalid), 'evicted invalid input is correctly recomputed')
  for i in range(limit, limit * 2)
    call wbx#notify_events#time('invalid-' . i)
  endfor
  call assert_equal(limit, len(s:time_cache().time_cache))
  call assert_equal(limit, len(uniq(sort(copy(s:time_cache().time_cache_keys)))), 'ring wrap retains one slot per unique input')
  let wide = repeat('x', 128)
  call assert_equal(-1, wbx#notify_events#time(wide))
  call assert_true(has_key(s:time_cache().time_cache, wide), 'bounded malformed strings are cached too')
  call assert_equal(-1, wbx#notify_events#time(wide . 'x'))
  call assert_false(has_key(s:time_cache().time_cache, wide . 'x'), 'oversized malformed strings are never retained')

  let s:t = wbx#notify_events#new()
  let s:o.messages = 1 | let s:o.preview = 0
  let s:state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Room'}, 'rooms': [],
        \ 'messages': [s:message('retimed', '2026-11-11T11:00:00Z'), s:message('corrected', 'invalid')]}
  call assert_equal([], s:observe(s:state, ''))
  let s:state.messages[0].created = '2026-11-11T12:00:00Z'
  call assert_equal(1, s:observe(s:state, '')[0].count, 'same identity with a changed timestamp uses the new exact input')
  let s:state.messages[1].created = '2026-11-11T12:00:00.001Z'
  call assert_equal(1, s:observe(s:state, '')[0].count, 'correcting malformed input is not hidden by cached invalid data')
  for i in range(1, limit + 1)
    call wbx#notify_events#time('eviction-' . i)
  endfor
  call assert_equal([], s:observe(s:state, ''), 'cache eviction cannot invalidate event deduplication or replay history')

  " Work regression: after warming a full history, poison only the private UTC
  " arithmetic routine. Any accidental reparse fails deterministically, without
  " machine-dependent timing assertions or retaining any actual message text.
  let s:t = wbx#notify_events#new()
  let s:o.messages = 0
  let s:state.messages = []
  for i in range(0, 499)
    call add(s:state.messages, s:message('warm-' . i, printf('2026-11-11T12:%02d:%02d.000Z', i / 60, i % 60)))
  endfor
  let latest = s:state.messages[-1].created
  let s:state.room.unreadActivity = latest
  let s:state.rooms = [extend(copy(s:state.room), {'unread': v:false})]
  let s:state.readStatus = 'ready'
  call assert_equal([], s:observe(s:state, ''))
  call wbx#notify_events#time('')
  call wbx#notify_events#time('invalid')
  let g:wbx_time_parse_calls = 0
  execute 'function! <SNR>' . s:time_sid . "_parse_time(value) abort\nlet g:wbx_time_parse_calls += 1\nthrow 'Unexpected UTC arithmetic on a warmed timestamp'\nendfunction"
  try
    for i in range(1, 8)
      call assert_equal([], s:observe(s:state, ''), 'disabled unchanged history still consumes its baseline without reparsing')
    endfor
    let s:o.messages = 1
    call assert_equal([], s:observe(s:state, ''), 'enabling after warmed disabled observations cannot replay history')
    call remove(s:state.messages, 0)
    call add(s:state.messages, s:message('warm-same-ms', latest))
    call assert_equal(1, s:observe(s:state, '')[0].count, 'cached time does not cache identity-based notification decisions')
    call wbx#notify_events#sent(s:t, 'r', 'warm-own')
    call remove(s:state.messages, 0, 1)
    call extend(s:state.messages, [s:message('warm-own', latest), s:message('warm-incoming', latest)])
    call assert_equal(1, s:observe(s:state, '')[0].count, 'same-time exact plugin send exclusion still preserves incoming messages')
    call assert_equal([], s:observe(s:state, ''))
    call assert_equal(-1, wbx#notify_events#time(''), 'empty invalid input also uses the cache')
    call assert_equal(-1, wbx#notify_events#time('invalid'), 'invalid cache hits bypass UTC arithmetic too')
    call wbx#unread#reset()
    call wbx#unread#open(s:state)
    call wbx#unread#observe(s:state)
    let agenda = s:agenda('2026-11-11T12:05:00.000Z')
    let agenda.items[0].end = latest
    call assert_equal(1, len(wbx#notify_events#meetings(s:t, agenda, s:now, s:o)))
    call assert_equal([], wbx#notify_events#meetings(s:t, agenda, s:now, s:o))
    call assert_equal(0, g:wbx_time_parse_calls, 'notifications, unread and meetings share warmed pure UTC results')
  finally
    execute 'source ' . fnameescape($WBX_EDITOR_ROOT . '/autoload/wbx/notify_events.vim')
    unlet g:wbx_time_parse_calls
  endtry
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
