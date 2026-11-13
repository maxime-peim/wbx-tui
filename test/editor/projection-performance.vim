" Deterministic projection work/invalidation checks; no backend or live service.
set encoding=utf-8 hidden noswapfile lines=50 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 0, 'notifications': 0,
      \ 'mark_read_on_open': 0, 'upcoming_meetings': 0, 'folds': 0}
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let g:wbx_projection_events = 0
augroup wbx_projection_work_test
  autocmd!
  autocmd User WbxState let g:wbx_projection_events += 1
augroup END
function! s:publish(state) abort
  " Detach the revision envelope, deliberately reuse nested caller containers.
  let a:state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': copy(a:state)})
endfunction
function! s:work() abort
  return getbufvar(wbx#buffers().history, 'wbx_render_work', {})
endfunction
try
  call wbx#buffers()
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Layout = function('<SNR>' . sid . '_layout')
  call Layout()
  let state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:true,
        \ 'room': {'id': 'room', 'title': 'Projection work', 'type': 'group'},
        \ 'rooms': [{'id': 'room', 'title': 'Projection work', 'type': 'group'}],
        \ 'messages': [], 'readStatus': 'off', 'historyLatest': v:true}
  for index in range(1, 50)
    call add(state.messages, {'id': 'message-' . index, 'author': 'Synthetic',
          \ 'created': '2026-11-01T12:00:00.000Z', 'text': 'Body ' . index . "\n**native Markdown**"})
  endfor
  call s:publish(state)
  let buffers = wbx#buffers()
  let history = buffers.history
  call win_gotoid(win_findbuf(history)[0])
  normal! 80Gzt
  let view = winsaveview()
  let tick = b:changedtick
  let events = g:wbx_projection_events
  for iteration in range(1, 5)
    call s:publish(state)
    call assert_equal({'history': 0, 'images': 0, 'status': 0}, s:work(), 'identical revisions reuse body projection without image work or forced redraw')
  endfor
  call assert_equal(events + 5, g:wbx_projection_events, 'projection reuse never suppresses public state hooks')
  call assert_equal(tick, b:changedtick)
  call assert_equal(view, winsaveview())
  let state.loading = v:true
  call s:publish(state)
  call assert_equal({'history': 0, 'images': 0, 'status': 0}, s:work(), 'background polling status is still admitted without repainting unchanged history')
  call assert_true(wbx#state().loading)
  let state.loading = v:false
  let state.loadingRooms = v:true
  call s:publish(state)
  call assert_equal(0, s:work().history, 'spaces-only display changes do not rebuild message bodies')
  call assert_match('Loading spaces', join(getbufline(buffers.rooms, 1, '$'), "\n"))
  let state.loadingRooms = v:false

  let state.messages[-1].text = 'Changed body with the same ID and timestamp'
  call s:publish(state)
  call assert_equal(1, s:work().history, 'body edits invalidate detached cache inputs')
  call assert_match('Changed body with the same ID', join(getline(1, '$'), "\n"))
  call s:publish(state)
  call assert_equal(0, s:work().history)
  let state.room.title = 'Renamed projection'
  call s:publish(state)
  call assert_equal(0, s:work().history, 'a same-height title change reuses the independent body projection')
  call assert_equal('# Renamed projection', getline(1))
  call assert_equal(1, s:work().status, 'destination title changes still refresh status')

  let old_body = b:wbx_message_blocks[0].body
  let state.notice = "New visible notice\nSecond line"
  call s:publish(state)
  call assert_equal(1, s:work().history, 'header height changes invalidate absolute message row offsets')
  call assert_true(b:wbx_message_blocks[0].body > old_body)
  call assert_match('New visible notice', join(getline(1, '$'), "\n"))
  call remove(state, 'notice')
  call s:publish(state)
  call assert_equal(old_body, b:wbx_message_blocks[0].body)

  let g:wbx_tui.threaded_history = 0
  call s:publish(state)
  call assert_equal(1, s:work().history, 'display options belong to the projection key')
  let state.messages[1].images = [{'id': repeat('a', 64), 'state': 'unsupported'}]
  let g:wbx_tui.images = 'unicode'
  call s:publish(state)
  call assert_equal(1, s:work().history)
  call assert_match('Attachment: no supported image preview', join(getline(1, '$'), "\n"))
  let g:wbx_tui.images = 0
  call s:publish(state)
  call assert_equal(1, s:work().history)
  call assert_notmatch('Attachment: no supported image preview', join(getline(1, '$'), "\n"))

  " Buffer metadata is not a writable alias of the private cached projection.
  let expected_body = b:wbx_message_blocks[0].body
  let b:wbx_message_blocks[0].body += 1
  call s:publish(state)
  call assert_equal(expected_body, b:wbx_message_blocks[0].body)
  execute 'bunload! ' . history
  execute 'sbuffer ' . history
  call assert_match('Changed body with the same ID', join(getline(1, '$'), "\n"), 'clean explicit reload restores the cached projection')

  let focus = win_getid()
  let state.room.id = 'room-b'
  call add(state.rooms, copy(state.room))
  call s:publish(state)
  call assert_equal(1, s:work().history, 'another room cannot reuse the prior destination cache even with identical title and messages')
  call assert_equal('room-b', b:wbx_history_room)
  let composer = wbx#buffers().drafts['room-b']
  call assert_equal('room-b', wbx#destination(composer).id)
  call assert_equal(focus, win_getid())

  let state.readStatus = 'ready'
  let state.room.unread = v:true
  let state.room.unreadStale = v:true
  let state.rooms[-1].unread = v:true
  let state.rooms[-1].unreadStale = v:true
  call s:publish(state)
  call assert_equal(0, s:work().history, 'authority changes do not require rebuilding the independent body projection')
  call assert_true(wbx#state().room.unreadStale)
  call assert_true(g:wbx_tui_event.room.unreadStale, 'accepted authority changes still reach public state hooks')
  let receipt = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexMarkRead"')[0]
  call assert_false(receipt.available, 'stale newest evidence is unavailable in discovery too')
  call assert_equal(wbx#local_action_reason('mark-read'), receipt.reason)
  call wbx#mark_read()
  call assert_false(wbx#transport#running(), 'cached body completeness cannot authorize a stale receipt or start transport')
  call assert_true(wbx#state().ready, 'a stale manual receipt was rejected before backend startup could reset the session')
  let state.readStatus = 'failed'
  call s:publish(state)
  call assert_equal(0, s:work().history)
  call wbx#mark_read()
  call assert_true(wbx#state().ready)
  call assert_false(wbx#transport#running())
  let state.readStatus = 'off'
  for status in ['off', 'connecting', 'failed']
    let state.readStatus = status
    call s:publish(state)
    let receipt = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexMarkRead"')[0]
    call assert_false(receipt.available)
    call assert_equal(wbx#local_action_reason('mark-read'), receipt.reason)
    call assert_match(escape(receipt.reason, '.()'), execute('call wbx#mark_read()'), 'owner and discovery share the exact local refusal')
  endfor
  let state.readStatus = 'off'

  setlocal modifiable
  call setline(1, 'Annotation before unloading')
  execute 'bunload! ' . history
  let state.messages[-1].text = 'Newest server body while annotations are unloaded'
  call s:publish(state)
  execute 'sbuffer ' . history
  call assert_equal('Annotation before unloading', getline(1), 'cache advancement while unloaded never overwrites retained annotations')
  " Exercise only the projection half of explicit Refresh!, without its RPC.
  setlocal nomodified
  let b:wbx_render_tick = b:changedtick
  let Render = function('<SNR>' . sid . '_render')
  call Render()
  call assert_match('Newest server body while annotations are unloaded', join(getline(1, '$'), "\n"), 'explicit discard uses the newest authoritative projection, not the pre-annotation snapshot')
  call assert_notmatch('Annotation before unloading', getline(1))
  let state.ready = v:false
  call s:publish(state)
  call assert_equal(1, s:work().status, 'destination readiness remains live even when body content is cached')
  call assert_match('History not ready', join(getline(1, '$'), "\n"))
  let state.ready = v:true
  call s:publish(state)
  setlocal modifiable
  call setline(1, 'Native annotation')
  call s:publish(state)
  call assert_equal('Native annotation', getline(1), 'ownership/dirty checks precede cache reuse and never discard native edits')
  call assert_false(wbx#transport#running(), 'no fixture action can start the fail-closed backend')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
