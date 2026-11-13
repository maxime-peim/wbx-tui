" Presentation aggregates remain exact and cold-path-only; no provider/backend.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 0, 'notifications': 0, 'folds': 0, 'mark_read_on_open': 0, 'statusline': 0}
runtime plugin/wbx.vim
let g:wbx_state_observed = []
augroup WbxStateOutputGuard
  autocmd!
  autocmd User WbxState call add(g:wbx_state_observed, deepcopy(g:wbx_tui_event))
augroup END
function! s:message(id, second) abort
  return {'id': a:id, 'author': 'Synthetic', 'created': printf('2026-11-12T12:00:%02dZ', a:second), 'text': 'Body'}
endfunction
function! s:counts(read, unread, tracked) abort
  call assert_equal({'read': a:read, 'unread': a:unread, 'tracked': a:tracked}, wbx#unread#status())
endfunction
function! s:publish(state) abort
  let a:state.revision += 1
  if !wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': a:state}) | throw 'Invalid synthetic status state' | endif
  let observed = len(g:wbx_state_observed)
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': deepcopy(a:state)})
  call assert_equal(observed + 1, len(g:wbx_state_observed), 'each admitted full state reaches its public hook')
  call assert_equal(a:state.revision, g:wbx_state_observed[-1].revision)
endfunction
try
  call wbx#unread#reset()
  let room = {'id': 'a', 'title': 'A', 'unread': v:true, 'unreadActivity': '2026-11-12T12:00:00Z'}
  let state = {'state': 'ready', 'ready': v:true, 'room': copy(room), 'rooms': [room], 'messages': [s:message('initial', 0)], 'readStatus': 'ready', 'historyLatest': v:true}
  let state.room.cached = v:true | let state.rooms[0].cached = v:true
  call wbx#unread#open(state) | call s:counts(0, 0, 0)
  call remove(state.room, 'cached') | call remove(state.rooms[0], 'cached')
  call wbx#unread#open(state) | call s:counts(1, 0, 1)
  call wbx#unread#observe(state) | call s:counts(1, 0, 1)
  let state.readStatus = 'failed' | let room.unreadStale = v:true
  call wbx#unread#observe(state) | call s:counts(1, 0, 1)
  let b_room = {'id': 'b', 'title': 'B', 'unread': v:true}
  call add(state.rooms, b_room) | let state.room = copy(b_room)
  call wbx#unread#open(state) | call s:counts(2, 0, 2)
  let state.readStatus = 'ready' | let room.unreadStale = v:false
  let room.unreadActivity = '2026-11-12T12:00:01Z'
  call wbx#unread#observe(state) | call s:counts(1, 1, 2)
  let room.unread = v:false
  call wbx#unread#observe(state) | call s:counts(1, 0, 2)
  let state.room = copy(room)
  call wbx#unread#open(state) | call s:counts(1, 0, 2)
  call wbx#unread#sent('a', 'own')
  call add(state.messages, s:message('own', 2))
  call wbx#unread#observe(state) | call s:counts(1, 0, 2)
  call add(state.messages, s:message('incoming', 3))
  let room.unreadStale = v:true
  call wbx#unread#observe(state) | call s:counts(1, 1, 2)
  let state.readStatus = 'failed'
  call wbx#unread#observe(state) | call s:counts(1, 1, 2)
  call wbx#unread#open(state) | call s:counts(2, 0, 2)
  let copy = wbx#unread#status() | let copy.read = -999
  call s:counts(2, 0, 2)
  call wbx#unread#reset()
  for i in range(0, 499)
    let room = {'id': 'bounded-' . i, 'title': 'Bounded', 'unread': v:true}
    let state.room = copy(room) | let state.rooms = [room]
    call wbx#unread#open(state)
  endfor
  call s:counts(500, 0, 500)
  let first = {'id': 'bounded-0', 'title': 'First', 'unread': v:true}
  let evicted = {'id': 'bounded-1', 'title': 'Evicted', 'unread': v:true}
  let state.room = first | let state.rooms = [first]
  call wbx#unread#open(state) | call s:counts(500, 0, 500)
  let room = {'id': 'bounded-new', 'title': 'New', 'unread': v:true}
  let state.room = room | let state.rooms = [room]
  call wbx#unread#open(state) | call s:counts(500, 0, 500)
  call assert_false(wbx#unread#display(first).unread, 'LRU refresh retains the original local entry')
  call assert_true(wbx#unread#display(evicted).unread, 'eviction removes its old count and local override')
  call wbx#unread#observe({'state': 'idle'}) | call s:counts(0, 0, 0)

  call wbx#buffers()
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'), [])
  let state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:false, 'room': v:null, 'messages': [], 'rooms': [], 'readStatus': 'connecting',
        \ 'spacesCache': {'state': 'stale', 'verified': v:false, 'observedAt': 1794484800000}}
  for i in range(1, 5)
    call add(state.rooms, {'id': 'space-' . i, 'title': 'Synthetic ' . i, 'cached': v:true, 'unread': v:true, 'unreadStale': v:true})
  endfor
  call s:publish(state)
  silent let health = wbx#health()
  call assert_equal(5, health.read_status_cached_rooms) | call assert_equal(5, health.spaces_cache_rows)
  call assert_match('unread syncing', wbx#status())
  for room in state.rooms | call remove(room, 'cached') | endfor
  let state.spacesCache = {'state': 'ready', 'verified': v:true}
  let state.room = copy(state.rooms[0]) | let state.ready = v:true
  let state.readStatus = 'ready' | let state.messages = [s:message('latest', 0)]
  call s:publish(state)
  silent call assert_equal(0, wbx#health().spaces_cache_rows)
  call assert_match('unread partly cached', wbx#status())
  for room in state.rooms | let room.unreadStale = v:false | endfor
  let state.room.unreadStale = v:false
  call s:publish(state)
  silent call assert_equal(0, wbx#health().read_status_cached_rooms)
  call assert_notmatch('unread partly cached', wbx#status())
  let state.rooms[0].unreadStale = v:true | let state.room.unreadStale = v:true
  call s:publish(state)
  silent call assert_equal(1, wbx#health().read_status_cached_rooms, 'same room IDs/length with changed flags invalidate counts')
  let state.loading = v:true | call s:publish(state)
  let state.loading = v:false | call s:publish(state)
  call assert_equal([v:true, v:false], map(deepcopy(g:wbx_state_observed[-2:]), 'v:val.loading'), 'loading/result transitions retain separate public hooks')
  let g:wbx_state_observed[-1].rooms[0].title = 'Foreign hook mutation'
  call assert_equal('Synthetic 1', wbx#state().rooms[0].title, 'hook payloads never alias accepted state')
  let snapshot = wbx#state() | let snapshot.rooms[0].unreadStale = v:false
  silent call assert_equal(1, wbx#health().read_status_cached_rooms, 'returned snapshots cannot mutate cached aggregates')
  call win_gotoid(win_findbuf(wbx#buffers().history)[0])
  call wbx#latest() | call wbx#mark_read()
  call assert_true(wbx#state().ready, 'stale receipts are refused before fail-closed backend startup')
  call assert_false(wbx#transport#running(), 'presentation counts never authorize a receipt')
  let state.readStatus = 'failed'
  call s:publish(state)
  call assert_match('unread cached', wbx#status())
  let state.rooms = [] | let state.room = v:null | let state.ready = v:false | let state.messages = []
  call s:publish(state)
  silent call assert_equal(0, wbx#health().read_status_cached_rooms)
  silent call assert_equal(0, wbx#health().spaces_cache_rows)
  call assert_match('unread unknown', wbx#status())
  let state.rooms = [{'id': 'retained', 'title': 'Retained', 'unread': v:true, 'unreadStale': v:true}]
  call s:publish(state)
  silent call assert_equal(1, wbx#health().read_status_cached_rooms)
  call wbx#_exit(0)
  silent call assert_equal(1, wbx#health().read_status_cached_rooms, 'transport loss retains literal historical flag counts, not fresh authority')
  call assert_match('disconnected.*unread cached', wbx#status())

  " Guard actual executed hot-path scans, without a wall-clock threshold.
  if has('profile')
    execute 'profile start ' . fnameescape($WBX_EDITOR_RESULT . '.profile')
    profile func wbx#status
    profile func wbx#unread#status
    for i in range(1, 50)
      call wbx#status()
      call wbx#unread#status()
    endfor
    profile pause
    profile dump
    let scans = filter(readfile($WBX_EDITOR_RESULT . '.profile'), 'v:val =~# ''^\s*\d\+\s.*\<\%(filter\|values\)(''')
    call assert_equal([], scans, 'status getters must not execute collection scans, even on unchanged redraws')
  endif
  call assert_false(wbx#transport#running())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
