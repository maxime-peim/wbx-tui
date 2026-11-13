" Pure local display projection, with immutable authoritative input and no jobs.
set encoding=utf-8
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
function! s:message(id, second) abort
  return {'id': a:id, 'author': 'Synthetic', 'created': printf('2026-11-11T12:00:%02d.000Z', a:second), 'text': 'Original'}
endfunction
function! s:state() abort
  let room = {'id': 'a', 'title': 'A', 'unread': v:true, 'unreadActivity': '2026-11-11T12:00:00.000Z'}
  return {'state': 'ready', 'readStatus': 'ready', 'ready': v:true, 'historyLatest': v:true, 'room': copy(room), 'rooms': [room], 'messages': [s:message('initial', 0)]}
endfunction
function! s:flag(state) abort
  return wbx#unread#display(a:state.rooms[0]).unread
endfunction
try
  let state = s:state()
  let original = deepcopy(state)
  call wbx#unread#open(state)
  call assert_false(s:flag(state), 'a successful explicit open immediately clears local emphasis')
  call assert_equal(original, state, 'the overlay cannot change authoritative data')
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'old unread=true snapshots cannot undo a local open')
  let state.readStatus = 'failed'
  let state.rooms[0].unreadStale = v:true
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'an outage is not a new message')
  let state.rooms[0].cached = v:true
  call assert_true(s:flag(state), 'cached rows stay historical/browse-only without a local override')
  call remove(state.rooms[0], 'cached')
  let state.readStatus = 'ready'
  let state.rooms[0].unreadStale = v:false
  let state.room = {'id': 'b', 'title': 'B'}
  let state.messages = []
  let state.rooms[0].lastActivity = '2027-01-01T00:00:00.000Z'
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'REST lastActivity alone cannot restore unread')
  let state.rooms[0].unreadActivity = '2026-11-11T12:00:01.000Z'
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'new SDK activity restores an already-unread unselected space')
  call wbx#unread#reset()
  let state = s:state()
  call remove(state.rooms[0], 'unread')
  call remove(state.rooms[0], 'unreadActivity')
  let state.room = copy(state.rooms[0])
  let state.readStatus = 'failed'
  call wbx#unread#open(state)
  call assert_false(s:flag(state), 'opening also clears a locally unknown status without inventing a server flag')
  call assert_false(has_key(state.rooms[0], 'unread'))
  call add(state.messages, s:message('new', 1))
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'actual incoming messages restore unread before sync recovers')
  call wbx#unread#open(state)
  call assert_false(s:flag(state))
  call insert(state.messages, {'id': 'old-page', 'created': '2026-11-10T12:00:00.000Z', 'text': 'Old'})
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'older history pages do not restore unread')
  let state.messages[-1].text = 'Image decode / body edit'
  call wbx#unread#observe(state)
  call assert_false(s:flag(state))
  call wbx#unread#sent('a', 'own')
  call add(state.messages, s:message('own', 2))
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'a local successful send is not incoming unread activity')
  let state.rooms[0].unread = v:true
  let state.rooms[0].unreadActivity = '2026-11-11T12:00:02.000Z'
  let state.readStatus = 'ready'
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'the matching SDK activity of that own send is also quiet')
  call add(state.messages, s:message('incoming', 3))
  let state.rooms[0].unread = v:false
  let state.rooms[0].unreadStale = v:true
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'a stale server-read flag cannot hide observed incoming content')
  let state.rooms[0].unreadStale = v:false
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'an older activity watermark cannot confirm the newer endpoint')
  let state.rooms[0].unreadActivity = '2026-11-11T12:00:03.000Z'
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'fresh server-read status covering the new activity confirms it')
  let state.readStatus = 'failed'
  call wbx#unread#observe(state)
  call assert_false(s:flag(state), 'an outage cannot resurrect already-confirmed content')
  let state.readStatus = 'ready'
  let state.rooms[0].unread = v:true
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'a subsequent confirmed read-to-unread cycle is honored')
  call wbx#unread#open(state)
  let state.historyLatest = v:false
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'an endpoint overtaking a full loaded window restores local unread')
  call wbx#unread#open(state)
  let state.historyLatest = v:true
  let state.messages = [s:message('initial', 0), s:message('tie', 0)]
  call wbx#unread#open(state)
  call add(state.messages, s:message('another-tie', 0))
  call wbx#unread#observe(state)
  call assert_true(s:flag(state), 'new IDs at the same timestamp still count')
  call wbx#unread#reset()
  let state = s:state()
  let state.rooms[0].cached = v:true
  call wbx#unread#open(state)
  call assert_equal(0, wbx#unread#status().tracked, 'cached metadata cannot create local read anchors')
  call remove(state.rooms[0], 'cached')
  for i in range(0, 550)
    let state.room.id = 'bounded-' . i | let state.rooms[0].id = state.room.id
    call wbx#unread#open(state)
  endfor
  call assert_equal(500, wbx#unread#status().tracked)
  call wbx#unread#observe({'state': 'idle'})
  call assert_equal(0, wbx#unread#status().tracked, 'disconnect/account replacement cannot retain markers')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#unread#reset()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
