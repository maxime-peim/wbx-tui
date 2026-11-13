" Paging indices/admission/hysteresis. Synthetic state only, never a backend.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 0, 'notifications': 0, 'folds': 0, 'mark_read_on_open': 0, 'statusline': 0}
runtime plugin/wbx.vim
function! s:publish(state) abort
  let a:state.revision += 1
  if !wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': a:state}) | throw 'Invalid synthetic paging state' | endif
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': deepcopy(a:state)})
endfunction
function! s:move(row, kind) abort
  call cursor(a:row, 1)
  return wbx#paging#navigation(a:kind)
endfunction
function! s:edge() abort
  return filter(copy(b:wbx_message_blocks), 'v:val.id ==# b:wbx_history_oldest')[0].start
endfunction
try
  call wbx#buffers()
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'), [])
  let state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:true,
        \ 'room': {'id': 'room', 'title': 'Paging indices', 'type': 'group'},
        \ 'rooms': [{'id': 'room', 'title': 'Paging indices', 'type': 'group'}],
        \ 'messages': [{'id': 'oldest-reply', 'parentId': 'root', 'author': 'Synthetic', 'created': '2026-11-12T12:00:00Z', 'text': 'Oldest body'}],
        \ 'moreHistory': v:true, 'moreRooms': v:true, 'historyLatest': v:true}
  for i in range(1, 20)
    call add(state.messages, {'id': 'other-' . i, 'author': 'Synthetic', 'created': printf('2026-11-12T12:00:%02dZ', i), 'text': 'Other body'})
  endfor
  call add(state.messages, {'id': 'root', 'author': 'Root', 'created': '2026-11-12T12:05:00Z', 'text': 'Root body'})
  for i in range(1, 10)
    call add(state.messages, {'id': 'reply-' . i, 'parentId': 'root', 'author': 'Synthetic', 'created': printf('2026-11-12T12:06:%02dZ', i), 'text': 'Later body'})
  endfor
  call s:publish(state)
  let buffers = wbx#buffers()
  call win_gotoid(win_findbuf(buffers.history)[0])
  let edge = s:edge()
  call assert_true(edge > b:wbx_message_blocks[0].start + 40, 'canonical oldest may be inside the last displayed thread')
  call assert_equal(edge, get(b:, 'wbx_paging_edge', 0), 'projection pre-indexes the canonical paging anchor')
  call cursor(edge + 15, 1)
  call wbx#paging#baseline()
  let blocks = b:wbx_message_blocks
  try
    " A cold-only container must not be borrowed by the keypress callback.
    let b:wbx_message_blocks = [v:null]
    call assert_equal(1, s:move(edge + 3, 'history'), 'warm paging uses the installed scalar, not all-message metadata')
  catch
    call add(v:errors, 'keypress read cold block metadata: ' . v:exception)
  finally
    let b:wbx_message_blocks = blocks
  endtry
  let token = wbx#paging#begin('history', state, 1)
  call assert_false(empty(token))
  call assert_equal({}, wbx#paging#begin('history', state, 0), 'manual/automatic admission shares one in-flight token')
  call assert_equal(0, s:move(edge + 15, 'history'))
  call assert_equal(0, w:wbx_page_edge, 'moving away rearms hysteresis even while a page is in flight')
  call assert_equal(0, s:move(edge + 3, 'history'), 'in-flight work cannot produce another paging intent')
  call assert_equal(1, w:wbx_page_edge, 'blocked near-edge motion is consumed rather than replayed after completion')
  call assert_true(wbx#paging#finish(token, {'result': v:null}, state))
  call assert_match('no progress', wbx#paging#status('history', state))
  call s:move(edge + 15, 'history')
  call assert_equal(0, s:move(edge + 3, 'history'), 'no-progress completion requires explicit retry')
  let retry = wbx#paging#begin('history', state, 0)
  call assert_false(empty(retry), 'manual retry is still admitted')
  let wrong = extend(copy(retry), {'generation': retry.generation + 1})
  call assert_false(wbx#paging#finish(wrong, {'result': v:null}, state))
  call assert_match('Loading page', wbx#paging#status('history', state), 'a stale callback cannot release current admission')
  call wbx#paging#finish(retry, {'error': {}}, state)
  call assert_match('Page failed', wbx#paging#status('history', state))

  let late = wbx#paging#begin('history', state, 0)
  let state.room.id = 'room-b'
  let state.rooms[0].id = 'room-b'
  call s:publish(state)
  let current = wbx#paging#begin('history', state, 0)
  call assert_false(wbx#paging#finish(late, {'result': v:null}, state))
  call assert_match('Loading page', wbx#paging#status('history', state))
  call wbx#paging#finish(current, {'error': {}}, state)
  call wbx#paging#reset()
  let state.notice = "Extra chrome\nAnother chrome row"
  call s:publish(state)
  call assert_equal(s:edge(), b:wbx_paging_edge, 'header-height and room changes refresh the indexed row')
  let indexed = b:wbx_paging_edge
  let b:wbx_paging_edge = -100
  call s:publish(state)
  call assert_equal(indexed, b:wbx_paging_edge, 'cached display projections restore detached index metadata')

  for blocked in ['cap', 'exhausted', 'loading', 'not-ready']
    let state.messages = map(range(1, blocked ==# 'cap' ? 500 : 40), '{"id":"bounded-" . v:val,"author":"Synthetic","created":"","text":"Body"}')
    let state.moreHistory = blocked !=# 'exhausted' ? v:true : v:false
    let state.loading = blocked ==# 'loading' ? v:true : v:false
    let state.ready = blocked !=# 'not-ready' ? v:true : v:false
    call s:publish(state)
    let edge = s:edge()
    call cursor(edge + 15, 1)
    call wbx#paging#baseline()
    let blocks = b:wbx_message_blocks
    try
      let b:wbx_message_blocks = [v:null]
      call assert_equal(0, s:move(edge + 3, 'history'), blocked . ': disabled paging never reads all blocks or admits intent')
    catch
      call add(v:errors, blocked . ': ' . v:exception)
    finally
      let b:wbx_message_blocks = blocks
    endtry
  endfor
  let state.loading = v:false | let state.ready = v:true | let state.moreHistory = v:true
  call wbx#paging#reset()
  call s:publish(state)
  let edge = s:edge()
  call assert_equal(0, s:move(edge + 2, 'history'), 'recovery does not replay previously consumed edge motion')
  call s:move(edge + 15, 'history')
  call assert_equal(1, s:move(edge + 3, 'history'), 'explicitly restored readiness permits deliberate edge navigation')
  call assert_equal(0, s:move(edge + 2, 'history'), 'hysteresis consumes repeated edge motion')
  split
  call cursor(edge + 15, 1) | call wbx#paging#baseline()
  call assert_equal(1, s:move(edge + 3, 'history'), 'a second window has its own navigation baseline and edge latch')
  close
  call assert_equal(0, s:move(edge + 1, 'history'), 'another window cannot rearm the first window')

  let state.rooms = map(range(1, 40), '{"id":"space-" . v:val,"title":"Space " . v:val}')
  call s:publish(state)
  call win_gotoid(win_findbuf(buffers.rooms)[0])
  let edge = match(b:wbx_room_ids, 'space-40') + 1
  call assert_equal(edge, get(b:, 'wbx_paging_edge', 0), 'spaces anchor excludes trailing footer rows')
  call cursor(edge - 15, 1) | call wbx#paging#baseline()
  let ids = b:wbx_room_ids
  try
    let b:wbx_room_ids = [v:null]
    call assert_equal(1, s:move(edge - 3, 'rooms'), 'room keypresses also use pre-indexed row metadata')
  finally
    let b:wbx_room_ids = ids
  endtry
  for blocked in ['cap', 'exhausted']
    let state.rooms = map(range(1, blocked ==# 'cap' ? 500 : 40), '{"id":"space-" . v:val,"title":"Space " . v:val}')
    let state.moreRooms = blocked ==# 'cap' ? v:true : v:false
    call s:publish(state)
    let edge = b:wbx_paging_edge
    call cursor(edge - 15, 1) | call wbx#paging#baseline()
    let ids = b:wbx_room_ids
    try
      let b:wbx_room_ids = [v:null]
      call assert_equal(0, s:move(edge - 3, 'rooms'), blocked . ': rooms admission also short-circuits at its dataset boundary')
    finally
      let b:wbx_room_ids = ids
    endtry
    call assert_equal({}, wbx#paging#begin('rooms', state, 0), 'manual paging retains the same cap/exhaustion guards')
  endfor
  let state.rooms = state.rooms[:19] | let state.moreRooms = v:true
  call s:publish(state)
  let room_token = wbx#paging#begin('rooms', state, 1)
  let state.state = 'failed'
  call s:publish(state)
  call assert_false(wbx#paging#finish(room_token, {'result': v:null}, state), 'connection loss invalidates admission generations')
  call assert_false(wbx#transport#running(), 'pure paging intent/index work cannot start a backend, send or acknowledge')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
