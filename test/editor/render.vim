" No-op rendering must preserve native editor state; no Webex/media is used.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'demo': 1, 'config': $WBX_CONFIG}
let g:wbx_render_events = 0
augroup wbx_render_test
  autocmd!
  autocmd User WbxState let g:wbx_render_events += 1
augroup END
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression)
      return
    endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! Publish(state) abort
  let a:state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': deepcopy(a:state)})
endfunction
function! Views(buffer) abort
  let views = {}
  for window in win_findbuf(a:buffer)
    call win_execute(window, 'let g:wbx_render_view = winsaveview()')
    let views[window] = g:wbx_render_view
  endfor
  return views
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call WaitFor('wbx#state().ready')
  let buffers = wbx#buffers()
  let snapshot = wbx#state()
  let snapshot.messages = map(range(1, 500), '{"id": "message-" . v:val, "author": "Synthetic", "created": "2026-01-01T00:00:00Z", "text": "Message " . v:val . " " . repeat("x", 1000)}')
  call Publish(snapshot)
  call win_gotoid(win_findbuf(buffers.history)[0])
  normal! 120Gzt
  let undo_before = undotree()
  execute 'tab sbuffer ' . buffers.history
  normal! 240Gzt
  let views_before = Views(buffers.history)
  let history_tick = getbufvar(buffers.history, 'changedtick')
  let rooms_tick = getbufvar(buffers.rooms, 'changedtick')
  let events_before = g:wbx_render_events
  tabnew
  call setline(1, 'Unrelated native work')
  let ordinary = bufnr('%')
  let ordinary_window = win_getid()
  for iteration in range(1, 20)
    call Publish(snapshot)
  endfor
  call assert_equal(history_tick, getbufvar(buffers.history, 'changedtick'), 'identical large histories are not rewritten')
  call assert_equal(rooms_tick, getbufvar(buffers.rooms, 'changedtick'), 'identical spaces are not rewritten')
  call assert_equal(views_before, Views(buffers.history), 'all history window cursors and viewports survive no-op updates')
  call assert_equal(events_before + 20, g:wbx_render_events, 'accepted revisions still reach native state hooks')
  call assert_equal(ordinary_window, win_getid(), 'no-op updates do not take focus')
  call win_execute(win_findbuf(buffers.history)[0], 'let g:wbx_render_undo = undotree()')
  " Native tab/window commands can close an undo block without adding a change.
  call remove(undo_before, 'synced')
  call remove(g:wbx_render_undo, 'synced')
  call assert_equal(undo_before, g:wbx_render_undo, 'no-op updates create no native undo changes')

  " Real polling emits loading=true and then false, even for unchanged history.
  " Neither half may insert/remove chrome above messages or rewrite the view.
  let history_before = getbufline(buffers.history, 1, '$')
  let events_before = g:wbx_render_events
  call win_gotoid(win_findbuf(buffers.history)[0])
  let reading_window = win_getid()
  for iteration in range(1, 5)
    let snapshot.loading = v:true
    call Publish(snapshot)
    call assert_true(wbx#state().loading, 'polling status remains available to native state consumers')
    call assert_equal(history_tick, getbufvar(buffers.history, 'changedtick'), 'poll start never rewrites already loaded history')
    call assert_equal(history_before, getbufline(buffers.history, 1, '$'), 'poll start does not insert a loading row above messages')
    call assert_equal(views_before, Views(buffers.history), 'poll start preserves all reading cursors and viewports')
    let snapshot.loading = v:false
    call Publish(snapshot)
    call assert_equal(history_tick, getbufvar(buffers.history, 'changedtick'), 'poll completion never rewrites unchanged history')
    call assert_equal(views_before, Views(buffers.history), 'poll completion preserves all reading cursors and viewports')
  endfor
  call assert_equal(events_before + 10, g:wbx_render_events, 'both halves of each poll still reach native state hooks')
  call assert_equal(reading_window, win_getid(), 'polling never moves focus away from the reader')
  call win_gotoid(ordinary_window)

  let snapshot.loadingRooms = v:true
  call Publish(snapshot)
  call assert_equal(history_tick, getbufvar(buffers.history, 'changedtick'), 'spaces-only loading does not rewrite history')
  call assert_true(rooms_tick < getbufvar(buffers.rooms, 'changedtick'), 'changed spaces loading guidance is still rendered')
  let snapshot.loadingRooms = v:false
  call Publish(snapshot)
  let snapshot.messages = snapshot.messages[-2:]
  call Publish(snapshot)
  let shortened_blocks = getbufvar(buffers.history, 'wbx_message_blocks')
  call assert_equal(2, len(shortened_blocks), 'shorter projections retain exactly the remaining messages')
  call assert_equal(shortened_blocks[-1].end, len(getbufline(buffers.history, 1, '$')), 'shorter projections remove old trailing history without hardcoding navigation chrome size')
  call assert_match('Message 500', join(getbufline(buffers.history, 1, '$'), "\n"))
  call assert_notmatch('Message 498', join(getbufline(buffers.history, 1, '$'), "\n"))
  call setbufvar(buffers.history, '&modifiable', 1)
  call setbufline(buffers.history, 1, 'Hidden local annotation')
  call Publish(snapshot)
  call assert_equal('Hidden local annotation', getbufline(buffers.history, 1)[0], 'dirty-view ownership checks precede projection equality')
  call win_gotoid(win_findbuf(buffers.history)[0])
  WebexRefresh!
  call assert_match('Message 500', join(getbufline(buffers.history, 1, '$'), "\n"), 'explicit reset restores the cached projection')

  call win_gotoid(ordinary_window)
  let snapshot.messages = []
  call Publish(snapshot)
  let empty_tick = getbufvar(buffers.history, 'changedtick')
  let snapshot.loading = v:true
  call Publish(snapshot)
  call assert_equal(empty_tick, getbufvar(buffers.history, 'changedtick'), 'polling an already loaded empty space is also quiet')
  call assert_match('No messages in this space', join(getbufline(buffers.history, 1, '$'), "\n"))
  let snapshot.loading = v:false
  call Publish(snapshot)
  call assert_equal(empty_tick, getbufvar(buffers.history, 'changedtick'))
  let snapshot.ready = v:false
  let snapshot.loading = v:true
  call Publish(snapshot)
  call assert_match('Loading history', join(getbufline(buffers.history, 1, '$'), "\n"), 'the initial history load is still visible')
  let snapshot.loading = v:false
  let snapshot.notice = 'Synthetic read failure'
  call Publish(snapshot)
  call assert_match('Synthetic read failure', join(getbufline(buffers.history, 1, '$'), "\n"), 'quiet polling never hides actual errors')
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'meeting', 'params': {'active': v:false, 'ready': v:false, 'session': v:null, 'attach': [], 'display': 'editor'}})
  let meeting = wbx#buffers().meeting
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'meeting.event', 'params': {'type': 'audio-state', 'enabled': v:false}})
  let meeting_tick = getbufvar(meeting, 'changedtick')
  for enabled in [v:false, v:false, v:false]
    call wbx#_receive({'jsonrpc': '2.0', 'method': 'meeting.event', 'params': {'type': 'audio-state', 'enabled': enabled}})
  endfor
  call assert_equal(meeting_tick, getbufvar(meeting, 'changedtick'), 'events without visible changes do not rewrite meeting status')
  call assert_equal(ordinary_window, win_getid())
  call assert_equal(['Unrelated native work'], getbufline(ordinary, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
