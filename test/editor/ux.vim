" Native-only UX regression fixture. The backend is synthetic; no meeting job runs.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
setglobal statusline=UX-USER
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
syntax off
let g:wbx_tui = {'demo': 1, 'statusline': 0, 'backend': [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs']}
let g:wbx_injected = 0
let g:wbx_ux_key = 0
augroup wbx_ux_hooks
  autocmd!
  autocmd FileType wbx-compose nnoremap <silent><buffer> <C-s> :let g:wbx_ux_key = 1<CR>
  autocmd FileType wbx-compose inoremap <silent><buffer> <C-s> <C-o>:let g:wbx_ux_key = 2<CR>
  autocmd FileType wbx-rooms nnoremap <silent><buffer> r :let g:wbx_ux_key = 3<CR>
  autocmd FileType wbx-history setlocal nowrap conceallevel=0 | nnoremap <silent><buffer> i :let g:wbx_ux_key = 4<CR>
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
function! s:publish(changes) abort
  let state = extend(wbx#state(), deepcopy(a:changes), 'force')
  let state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': state})
endfunction
function! s:emit(method, params) abort
  call wbx#_receive({'jsonrpc': '2.0', 'method': a:method, 'params': deepcopy(a:params)})
endfunction
function! s:text(buffer) abort
  return join(getbufline(a:buffer, 1, '$'), "\n")
endfunction
function! s:promote_on_filetype() abort
  silent! nunmap <buffer> <C-s>
  silent! iunmap <buffer> <C-s>
  setlocal buftype=
endfunction
try
  call assert_equal({}, wbx#destination(), 'ordinary buffers have no send destination')
  WebexDestination
  call assert_equal(0, wbx#transport#running(), 'destination inspection never starts a backend')
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  let buffers = wbx#buffers()
  call assert_match('wbx_ux_key = 3', maparg('r', 'n'), 'initial spaces FileType mapping wins')
  call assert_equal(1, len(b:wbx_default_maps), 'only the installed Enter default is tracked')
  call wbx#select('fixture-room')
  call WaitFor('wbx#state().ready')
  let room = deepcopy(wbx#state().room)
  WebexCompose
  let composer = bufnr('%')
  let composer_window = win_getid()
  call assert_match('wbx_ux_key = 1', maparg('<C-s>', 'n'), 'initial normal-mode save mapping wins')
  call assert_match('wbx_ux_key = 2', maparg('<C-s>', 'i'), 'initial insert-mode save mapping wins')
  call assert_equal(2, len(b:wbx_default_maps), 'only Normal-mode send and cancel-reply shortcuts are plugin defaults')
  call assert_true(index(map(copy(b:wbx_default_maps), 'v:val[1]'), '<C-s>') < 0, 'FileType save mappings are not claimed as plugin defaults')
  execute "normal \<C-s>"
  call assert_equal(1, g:wbx_ux_key)
  call feedkeys("i\<C-s>\<Esc>", 'xt')
  call assert_equal(2, g:wbx_ux_key)
  call assert_equal([], readfile($WBX_EDITOR_AUDIT), 'user save mappings never send')
  let destination = wbx#destination()
  call assert_equal(room.id, destination.id)
  call assert_equal(room.title, destination.title)
  call assert_true(destination.selected && destination.ready && !destination.uncertain && !destination.pending)
  call assert_match('Destination ID: fixture-room', execute('WebexDestination'))
  call assert_equal(0, g:wbx_injected, 'destination titles are text, never Ex commands')
  call assert_equal([''], getline(1, '$'), 'destination metadata is never inserted into sendable text')
  call assert_equal('UX-USER', &statusline, 'destination inspection preserves the user statusline')
  if has('nvim')
    lua assert(require('wbx-tui').destination().id == 'fixture-room')
    lua assert(require('wbx-tui').buffer_status():find('Unicode', 1, true))
  endif
  call setline(1, 'Unsent native draft')
  tabnew
  call setline(1, 'Unrelated user work')
  let ordinary = bufnr('%')
  let ordinary_window = win_getid()
  let window_count = len(getwininfo())
  WebexCompose
  call assert_equal(composer_window, win_getid(), 'explicit compose focuses the existing window across tabs')
  call assert_equal(window_count, len(getwininfo()), 'cross-tab compose creates no duplicate split')
  call assert_equal(['Unsent native draft'], getline(1, '$'))
  call win_gotoid(ordinary_window)
  execute 'sbuffer ' . composer
  let local_composer_window = win_getid()
  call win_gotoid(ordinary_window)
  WebexCompose
  call assert_equal(local_composer_window, win_getid(), 'an existing current-tab composer is preferred')
  close
  call win_gotoid(ordinary_window)
  WebexMeetingStatus
  let meeting_window = win_getid()
  let meeting_buffer = bufnr('%')
  let window_count = len(getwininfo())
  WebexMeetingStatus
  call assert_equal(meeting_window, win_getid())
  call assert_equal(window_count, len(getwininfo()), 'repeated status inspection creates no duplicate')
  call win_gotoid(composer_window)
  WebexMeetingStatus
  call assert_equal(meeting_window, win_getid(), 'explicit status inspection focuses across tabs')
  call assert_equal(window_count, len(getwininfo()))
  call win_gotoid(ordinary_window)

  " Every injected state retains the required protocol fields; copy before mutation.
  call s:publish({'rooms': [], 'room': v:null, 'messages': [], 'ready': v:false,
        \ 'loadingRooms': v:true, 'roomsStatus':'loading', 'notice': 'Synthetic space-read notice'})
  call assert_match('Loading spaces', s:text(buffers.rooms))
  call assert_match('Synthetic space-read notice', s:text(buffers.rooms), 'loading does not hide notices')
  call assert_match('\[No space selected\]', s:text(buffers.history))
  call assert_notmatch(':Webex\|Backspace.*Enter', s:text(buffers.history))
  call s:publish({'loadingRooms': v:false, 'roomsStatus':'ready', 'notice': ''})
  call assert_match('\[No spaces found\]', s:text(buffers.rooms))
  call s:publish({'rooms': [room], 'room': room, 'loading': v:true, 'moreRooms': v:true, 'moreHistory': v:true})
  call assert_match('Loading history', s:text(buffers.history))
  call assert_match('\[More spaces available\]', s:text(buffers.rooms))
  call assert_match('\[Older messages available\]', s:text(buffers.history))
  call assert_notmatch(':Webex', s:text(buffers.rooms) . s:text(buffers.history))
  let ids = getbufvar(buffers.rooms, 'wbx_room_ids')
  call assert_equal(len(getbufline(buffers.rooms, 1, '$')), len(ids), 'all informational rows have explicit empty IDs')
  call assert_equal([room.id], filter(copy(ids), '!empty(v:val)'))
  call win_gotoid(win_findbuf(buffers.rooms)[0])
  for row in range(1, len(ids))
    if empty(ids[row - 1])
      call cursor(row, 1)
      call wbx#select_current()
    endif
  endfor
  call assert_equal(room.id, wbx#state().room.id, 'informational rows cannot choose a destination')
  call win_gotoid(ordinary_window)
  call s:publish({'loading': v:false, 'ready': v:true})
  call assert_match('\[No messages in this space\]', s:text(buffers.history))
  call assert_notmatch('Loading history', s:text(buffers.history))
  call s:publish({'state': 'connecting', 'auth': 'authorizing', 'ready': v:false})
  call assert_match('\[Complete sign-in in your browser\]', s:text(buffers.rooms))
  call s:publish({'state': 'failed', 'notice': 'Synthetic read failure'})
  call assert_match('\[Connection failed\]', s:text(buffers.rooms))
  call assert_match('Synthetic read failure', s:text(buffers.history))
  call s:publish({'state': 'ready', 'auth': 'demo', 'ready': v:true, 'notice': '', 'moreRooms': v:false, 'moreHistory': v:false})
  call assert_equal(ordinary_window, win_getid(), 'passive render states never take focus')
  let other = {'id': 'ux-other', 'title': 'Other destination', 'type': 'group'}
  call s:publish({'room': other, 'rooms': [room, other]})
  call assert_equal(room.id, wbx#destination(composer).id, 'inspection is bound to the draft, not global selection')
  call assert_equal(room.title, wbx#destination(composer).title)
  call assert_false(wbx#destination(composer).selected)
  call assert_match('NOT SELECTED', wbx#buffer_status(composer))
  call s:publish({'room': room, 'rooms': [room]})
  call assert_equal(['Unsent native draft'], getbufline(composer, 1, '$'))
  call setbufvar(buffers.history, '&modifiable', 1)
  call setbufline(buffers.history, 1, 'Local history annotation')
  call s:publish({'notice': 'Synthetic refresh notice'})
  call assert_equal('Local history annotation', getbufline(buffers.history, 1)[0], 'repaint preserves edited views')
  call assert_match('EDITED VIEW', wbx#buffer_status(buffers.history))
  call win_gotoid(win_findbuf(buffers.history)[0])
  call assert_false(&l:wrap, 'history FileType wrap override wins over native defaults')
  call assert_equal(0, &l:conceallevel, 'history FileType conceal override wins over native defaults')
  call assert_match('wbx_ux_key = 4', maparg('i', 'n'), 'initial history FileType mapping wins')
  WebexRefresh!
  call win_gotoid(ordinary_window)
  call s:publish({'notice': ''})

  " These are text-only meeting snapshots. No attach argv, terminal or media job.
  let meeting = {'active': v:true, 'ready': v:true, 'display': 'kitty', 'session': 'wbx-ux-a', 'attach': []}
  call s:emit('meeting', meeting)
  call s:emit('meeting.event', {'type': 'send-state', 'kind': 'microphone', 'state': 'on', 'requestId': 1})
  call s:emit('meeting.event', {'type': 'sources', 'sources': [{'id': 'video', 'label': 'Old source', 'kind': 'video', 'available': v:true}]})
  call s:emit('meeting.event', {'type': 'status', 'state': 'connected'})
  let meeting.ready = v:false
  call s:emit('meeting', meeting)
  call assert_match('Last reported microphone: on', s:text(meeting_buffer), 'unavailable controls do not imply confirmed current transmission')
  call assert_match('Old source', s:text(meeting_buffer), 'same-call readiness changes retain last reported detail')
  let meeting.session = 'wbx-ux-b'
  let meeting.ready = v:true
  call s:emit('meeting', meeting)
  call assert_notmatch('Old source\|microphone: on\|Call: connected', s:text(meeting_buffer), 'new call identity clears all old meeting events')
  call s:emit('meeting.event', {'type': 'send-state', 'kind': 'microphone', 'state': 'off', 'requestId': 2})
  call s:emit('meeting', meeting)
  call assert_match('microphone: off', s:text(meeting_buffer), 'same-call notifications retain current events')
  let meeting.active = v:false
  let meeting.ready = v:false
  call s:emit('meeting', meeting)
  let meeting.active = v:true
  let meeting.ready = v:true
  call s:emit('meeting', meeting)
  call assert_notmatch('microphone: off', s:text(meeting_buffer), 'reactivating a reused session starts with an empty event cache')
  call s:emit('meeting.event', {'type': 'send-state', 'kind': 'microphone', 'state': 'off', 'requestId': 3})
  call assert_equal(ordinary_window, win_getid(), 'passive meeting state never focuses its status view')
  call assert_equal(0, len(filter(getbufinfo(), 'get(v:val.variables, "wbx_meeting_terminal", 0)')), 'synthetic meeting states never launch a terminal')

  call win_gotoid(composer_window)
  call setline(1, 'unknown')
  WebexSend
  call assert_true(wbx#destination().pending, 'pending delivery is inspectable immediately')
  call win_gotoid(ordinary_window)
  call WaitFor('get(wbx#destination(' . composer . '), "uncertain", 0)')
  call assert_match('Delivery uncertain.*check Webex before retrying', s:text(buffers.history), 'local uncertainty is visible without a backend uncertain flag')
  call assert_match('DELIVERY UNCERTAIN', wbx#buffer_status(composer))
  call assert_equal(ordinary_window, win_getid(), 'delivery notifications never take focus')
  call assert_equal(['unknown'], getbufline(composer, 1, '$'))
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call win_gotoid(composer_window)
  call setline(1, 'crash')
  WebexSend
  call win_gotoid(ordinary_window)
  call WaitFor('!wbx#transport#running()')
  call assert_equal('idle', wbx#state().state)
  call assert_false(wbx#state().ready)
  call assert_match('disconnected', getbufline(buffers.rooms, 1)[0], 'exit repaints the formerly ready header')
  call assert_match('Disconnected.*drafts retained', s:text(buffers.history))
  call assert_match('Delivery uncertain.*check Webex before retrying', s:text(buffers.history))
  call assert_match('STATUS UNKNOWN.*backend disconnected', s:text(meeting_buffer))
  call assert_match('Controls: unavailable', s:text(meeting_buffer))
  call assert_match('Last reported microphone: off', s:text(meeting_buffer))
  call assert_true(wbx#meeting_state().active, 'backend exit never claims that the media owner stopped')
  call assert_equal(['crash'], getbufline(composer, 1, '$'))
  call assert_equal(ordinary_window, win_getid(), 'backend exit does not steal focus')
  call assert_equal(['Unrelated user work'], getbufline(ordinary, 1, '$'))
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select(room.id)
  call WaitFor('wbx#state().ready')
  WebexCompose
  call assert_true(wbx#destination().uncertain, 'local uncertainty remains inspectable across backend restart')
  call assert_match('Delivery uncertain', s:text(buffers.history))
  call assert_notmatch('microphone: off', s:text(meeting_buffer), 'hello also clears a previous call event cache')
  WebexSend
  sleep 30m
  call assert_equal(2, len(readfile($WBX_EDITOR_AUDIT)), 'inspection/repaint/restart never retries a send')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call assert_false(wbx#destination().uncertain)
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.notes.txt')
  setlocal buftype=
  write
  call assert_equal({}, wbx#destination(), 'renamed drafts lose inspectable send ownership')
  call assert_match('wbx_ux_key = 1', maparg('<C-s>', 'n'), 'ownership release retains initial user mappings')
  call assert_match('wbx_ux_key = 2', maparg('<C-s>', 'i'))
  call assert_equal(['crash'], readfile(bufname('%')), 'native write only saves the explicitly promoted copy')
  call assert_equal(2, len(readfile($WBX_EDITOR_AUDIT)), 'writing never sends')
  call s:publish({})
  let fresh = wbx#buffers().drafts[room.id]
  augroup wbx_ux_promote_hook
    autocmd!
    autocmd FileType wbx-compose call s:promote_on_filetype()
  augroup END
  execute 'sbuffer ' . fresh
  call assert_equal('', get(b:, 'wbx_kind', ''), 'ownership is rechecked after native FileType hooks promote a buffer')
  call assert_false(get(maparg('<C-s>', 'n', 0, 1), 'buffer', 0), 'defaults are not installed after a hook releases ownership')
  call assert_false(get(maparg('<C-s>', 'i', 0, 1), 'buffer', 0))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
