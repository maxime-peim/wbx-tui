" Actual keyboard UX, using a private synthetic backend (never Webex or media).
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let g:maplocalleader = ','
let g:wbx_keyboard_saved = 0
let g:wbx_keyboard_user_send = 0
let g:wbx_keyboard_control = 0
nnoremap <silent> <C-s> :let g:wbx_keyboard_saved += 1<CR>
inoremap <silent> <C-s> <C-o>:let g:wbx_keyboard_saved += 1<CR>
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const rooms = ['a', 'b', 'c', 'd'].map(id => ({ id: 'keyboard-' + id, title: 'Space ' + id, type: 'group' }));
  let revision = 0, behavior = 'ok';
  let state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const audit = value => appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line), p = request.params || {};
    const reply = result => write({ jsonrpc: '2.0', id: request.id, result });
    switch (request.method) {
      case 'hello': reply({ version: 1, capabilities: ['delivery-resolution-v1'], state, meeting: { active: false, ready: false } }); break;
      case 'delivery.resolveBound': reply({ roomId: p.roomId }); break;
      case 'session.start': state = { ...state, state: 'ready', rooms }; publish(); reply(null); break;
      case 'test.control': behavior = p.behavior || 'ok'; reply(null); break;
      case 'test.publish': state = { ...state, ...p }; publish(); reply(null); break;
      case 'rooms.select': {
        audit({ method: request.method, room: p.roomId });
        const selected = behavior; behavior = 'ok';
        setTimeout(() => {
          if (selected !== 'error') {
            const room = rooms.find(room => room.id === (selected === 'stale' ? 'keyboard-a' : p.roomId));
            const messages = Array.from({ length: 80 }, (_, index) => ({ id: room.id + '-history-' + index, author: 'Synthetic',
              created: new Date(Date.UTC(2026, 0, 1, 12, index)).toISOString(),
              text: index === 79 ? 'Latest message ' + room.id + '\nLatest detail ' + room.id : 'Message ' + (index + 1) + ' ' + room.id }));
            state = { ...state, room, ready: true, loading: false, messages }; publish();
          }
          const complete = () => {
            if (selected === 'error') write({ jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Synthetic selection failure' } });
            else reply(null);
            audit({ method: 'selection.complete' });
          };
          if (!globalThis.firstSelectionReleased) globalThis.heldSelection = complete;
          else setTimeout(complete, 70);
        }, 40);
        break;
      }
      case 'test.release': globalThis.firstSelectionReleased = true; globalThis.heldSelection?.(); globalThis.heldSelection = null; reply(null); break;
      case 'messages.send':
        audit({ method: request.method, room: p.roomId, text: p.text });
        setTimeout(() => {
          const status = p.text === 'unknown' ? 'unknown' : 'sent';
          if (status === 'sent') {
            state.messages.push({ id: 'message-' + revision, author: 'Synthetic', created: '2026-01-01T00:00:00Z', text: p.text }); publish();
          }
          write({ jsonrpc: '2.0', method: 'delivery', params: { requestId: p.requestId, roomId: p.roomId, status, message: 'Synthetic ' + status } }); reply(null);
        }, 30);
        break;
      case 'shutdown': reply(null); process.exit(0); break;
      default: reply(null);
    }
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'send_with_ctrl_s': 0,
      \ 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
let s:ordinary = bufnr('%')
let s:ordinary_window = win_getid()
call setline(1, 'Unrelated native work')
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
function! s:count(method) abort
  return len(filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method'))
endfunction
function! s:controlled(message) abort
  let g:wbx_keyboard_control += 1
endfunction
function! s:control(method, params) abort
  let expected = g:wbx_keyboard_control + 1
  call wbx#rpc(a:method, a:params, function('s:controlled'))
  call WaitFor('g:wbx_keyboard_control == ' . expected)
endfunction
function! s:row(id) abort
  return index(get(b:, 'wbx_room_ids', []), a:id) + 1
endfunction
function! s:enter(id) abort
  call cursor(s:row(a:id), 1)
  execute "normal \<CR>"
endfunction
function! s:finish(count) abort
  call WaitFor('s:count("selection.complete") == ' . a:count)
  sleep 30m
endfunction
function! s:text(buffer) abort
  return join(getbufline(a:buffer, 1, '$'), "\n")
endfunction
try
  call assert_equal(0, wbx#transport#running(), 'loading/mapping never starts a backend')
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 4')
  let s:buffers = wbx#buffers()
  let s:rooms_window = win_getid()
  call assert_equal(3, line('.'), 'first spaces fill lands on an actual destination, not its header')
  normal! 5G
  call s:control('test.publish', {'notice': 'Synthetic keyboard notice'})
  call assert_equal(5, line('.'), 'subsequent room notifications preserve the user selection')
  call assert_equal(s:rooms_window, win_getid(), 'first-fill positioning never redirects passive focus')
  call assert_notmatch('Enter opens space', s:text(s:buffers.rooms), 'normal chrome is not a keyboard tutorial')
  call assert_notmatch('WebexPickSpace', s:text(s:buffers.rooms))
  call assert_equal('<Plug>(WebexSelectSpace)', maparg('<CR>', 'n'))
  call assert_false(get(maparg('j', 'n', 0, 1), 'buffer', 0), 'j remains a native motion')
  call assert_false(get(maparg('k', 'n', 0, 1), 'buffer', 0), 'k remains a native motion')
  normal! gg
  normal j
  call assert_equal(2, line('.'))
  normal k
  call assert_equal(1, line('.'))
  for s:row in range(1, line('$'))
    if empty(get(b:wbx_room_ids, s:row - 1, ''))
      call cursor(s:row, 1)
      execute "normal \<CR>"
    endif
  endfor
  sleep 30m
  call assert_equal(0, s:count('rooms.select'), 'Enter on informational rows cannot select')
  setlocal modifiable
  call setline(3, 'Edited destination label')
  call s:enter('keyboard-b')
  sleep 30m
  call assert_equal(0, s:count('rooms.select'), 'Enter on edited rows cannot select')
  WebexRefresh!

  call s:enter('keyboard-b')
  call WaitFor('type(wbx#state().room) == v:t_dict && wbx#state().room.id ==# "keyboard-b"')
  call assert_equal(s:rooms_window, win_getid(), 'state notification alone does not focus history')
  call s:control('test.release', {})
  call s:finish(1)
  call assert_equal(s:buffers.history, bufnr('%'), 'Enter opens the highlighted space history after completion')
  call assert_match('Space b', getline(1))
  redraw
  call assert_equal(line('$'), line('.'), 'opening a long conversation jumps to its end, not its heading')
  " Silent Ex Vim has no drawn screen (w$ can even precede w0). Its cursor is
  " checked above; inspect screen visibility in Neovim or an interactive PTY.
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call assert_true(line('w0') <= line('$') - 1 && line('w$') >= line('$') - 1, 'the newest message body is visible at the bottom of the viewport')
  endif
  call assert_equal('Latest detail keyboard-b', getline(line('$') - 1), 'the full last multiline message is above the end cursor')
  normal! 15Gzt
  let s:reading_view = winsaveview()
  call s:control('test.publish', {'loading': v:true})
  call s:control('test.publish', {'loading': v:false})
  call assert_equal(s:reading_view, winsaveview(), 'later poll transitions do not jump back to the end')
  let s:messages = wbx#state().messages + [{'id': 'keyboard-b-newer', 'author': 'Synthetic', 'created': '2026-01-02T00:00:00Z', 'text': 'A newer incoming message'}]
  call s:control('test.publish', {'messages': s:messages})
  call assert_equal(s:reading_view, winsaveview(), 'incoming messages preserve a reader who scrolled up')
  call assert_equal('<Plug>(WebexComposeInsert)', maparg('i', 'n'))
  call feedkeys("iFirst line\<CR>Second line\<Esc>", 'xt')
  let s:b = bufnr('%')
  call assert_equal('keyboard-b', get(b:, 'wbx_room', ''), 'history i chooses the owned destination composer')
  call assert_equal(['First line', 'Second line'], getline(1, '$'), 'history i enters native Insert; Enter creates a newline')
  call assert_equal(0, s:count('messages.send'), 'typing/newlines never send')
  call assert_false(get(maparg('<BS>', 'n', 0, 1), 'buffer', 0), 'composer editing keeps native Backspace')
  call assert_equal('', maparg(',s', 'i'), 'localleader send never steals Insert text')
  call assert_false(get(maparg('<C-s>', 'n', 0, 1), 'buffer', 0), 'Ctrl+s off keeps the global normal save map')
  call assert_false(get(maparg('<C-s>', 'i', 0, 1), 'buffer', 0), 'Ctrl+s off keeps the global Insert save map')
  execute "normal \<C-s>"
  call feedkeys("i\<C-s>\<Esc>", 'xt')
  call assert_equal(2, g:wbx_keyboard_saved)
  call assert_equal(0, s:count('messages.send'), 'global save mappings cannot send')
  normal ,s
  call WaitFor('s:count("messages.send") == 1 && getbufline(' . s:b . ', 1, "$") ==# [""]')
  call assert_equal("First line\nSecond line", json_decode(readfile($WBX_EDITOR_AUDIT)[-1]).text, 'normal localleader explicitly sends the draft')
  call assert_notmatch('i compose · Backspace spaces\|:Webex', s:text(s:buffers.history), 'navigation discovery stays in help')
  call setline(1, 'unknown')
  normal ,s
  call assert_true(wbx#destination().pending, 'an explicit send immediately reports its pending draft')
  normal ,s
  call WaitFor('s:count("messages.send") == 2 && get(wbx#destination(' . s:b . '), "uncertain", 0)')
  call assert_equal(['unknown'], getline(1, '$'), 'unknown delivery retains the draft without automatically retrying')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')

  call setline(1, 'Retained b draft')
  call win_execute(s:rooms_window, 'call cursor(3, 1)')
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  execute "normal \<BS>"
  call assert_equal(s:buffers.rooms, bufnr('%'), 'history Backspace returns to the spaces explorer')
  call assert_equal(s:row('keyboard-b'), line('.'), 'explicit return restores the open conversation row')
  normal! 5G
  call s:control('test.publish', {'notice': 'Another synthetic keyboard notice'})
  call assert_equal(5, line('.'), 'passive updates do not restore the open conversation row')
  call assert_match('^● Space b \[draft\]$', getbufline(s:buffers.rooms, s:row('keyboard-b'))[0], 'open marker and local draft badge are independent of the cursor')
  setlocal modifiable
  call setline(3, 'Private spaces annotation')
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  execute "normal \<BS>"
  call assert_equal(5, line('.'), 'explicit return preserves the cursor in edited spaces')
  call assert_equal('Private spaces annotation', getline(3), 'explicit return preserves edited spaces')
  WebexRefresh!
  call s:enter('keyboard-a')
  call s:finish(2)
  call assert_equal(line('$'), line('.'), 'switching to another space also opens at the end')
  call feedkeys("iRetained a draft\<Esc>", 'xt')
  let s:a = bufnr('%')
  call assert_equal('keyboard-a', b:wbx_room)
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  execute "normal \<BS>"
  call s:enter('keyboard-b')
  call s:finish(3)
  call assert_equal(line('$'), line('.'), 'returning to a previously opened space starts at the latest message')
  WebexCompose
  call assert_equal(s:b, bufnr('%'), 'legacy compose command still focuses without entering Insert')
  call feedkeys("l\<Esc>", 'xt')
  call assert_equal(['Retained b draft'], getline(1, '$'))
  call assert_equal(['Retained a draft'], getbufline(s:a, 1, '$'), 'each destination retains its native draft')

  " Leaving the origin window, even if returning before the response, cancels focus.
  call win_gotoid(s:rooms_window)
  call s:enter('keyboard-a')
  call win_gotoid(s:ordinary_window)
  call s:finish(4)
  call assert_equal(s:ordinary_window, win_getid(), 'async selection never steals moved window focus')
  call win_gotoid(s:rooms_window)
  call s:enter('keyboard-b')
  call win_gotoid(s:ordinary_window)
  call win_gotoid(s:rooms_window)
  call s:finish(5)
  call assert_equal(s:rooms_window, win_getid(), 'leaving then returning still cancels stale focus')
  call s:enter('keyboard-a')
  enew
  call setline(1, 'New native buffer in the origin window')
  let s:origin_work = bufnr('%')
  call s:finish(6)
  call assert_equal(s:origin_work, bufnr('%'), 'async selection never replaces a changed origin buffer')
  execute 'buffer ' . s:buffers.rooms
  call wbx#select('keyboard-b')
  call s:finish(7)
  call assert_equal(s:buffers.rooms, bufnr('%'), 'programmatic selection remains focus-neutral')

  call s:control('test.control', {'behavior': 'error'})
  call s:enter('keyboard-a')
  call s:finish(8)
  call assert_equal(s:buffers.rooms, bufnr('%'), 'failed selection does not open history')
  call s:control('test.control', {'behavior': 'stale'})
  " This injects a stale provider result, not a normal same-space resume.
  call wbx#select('keyboard-b', 1, 1, 1)
  call s:finish(9)
  call assert_equal(s:buffers.rooms, bufnr('%'), 'success for a stale destination does not focus the wrong history')
  call setbufvar(s:buffers.history, '&modifiable', 1)
  call setbufline(s:buffers.history, 1, 'Private history annotation')
  call s:enter('keyboard-b')
  call s:finish(10)
  call assert_equal(s:buffers.rooms, bufnr('%'), 'edited history is not presented as the new destination')
  call assert_equal('Private history annotation', getbufline(s:buffers.history, 1)[0])
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  WebexRefresh!
  call win_gotoid(s:rooms_window)
  execute 'bwipeout! ' . s:buffers.history
  call s:enter('keyboard-a')
  call s:finish(11)
  let s:buffers = wbx#buffers()
  call assert_equal(s:buffers.history, bufnr('%'), 'an explicitly opened wiped history is safely recreated')
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.promoted-history')
  setlocal buftype= modifiable
  call setline(1, 'Promoted history is ordinary user work')
  let s:promoted_history = bufnr('%')
  let s:promoted_history_text = getline(1, '$')
  call win_gotoid(s:rooms_window)
  execute 'bwipeout! ' . bufnr('^wbx://history$')
  let s:collision = bufadd('wbx://history')
  call bufload(s:collision)
  call setbufline(s:collision, 1, 'Unrelated reserved-name work')
  call s:enter('keyboard-b')
  call s:finish(12)
  call assert_equal(s:buffers.rooms, bufnr('%'), 'history name collision leaves focus alone')
  call assert_equal(['Unrelated reserved-name work'], getbufline(s:collision, 1, '$'))
  call assert_equal('', getbufvar(s:collision, '&buftype'), 'a reserved-name collision is never adopted')
  execute 'sbuffer ' . s:collision
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.collision-notes')
  let s:renamed_collision = bufnr('%')
  " Native :file leaves an empty alternate-name entry for this ordinary file.
  " Only the test explicitly closes that placeholder; the plugin must not.
  let s:placeholder = bufnr('^wbx://history$')
  if s:placeholder > 0
    execute 'bwipeout ' . s:placeholder
  endif
  call win_gotoid(s:rooms_window)
  call s:enter('keyboard-a')
  call s:finish(13)
  let s:buffers = wbx#buffers()
  call assert_equal(s:buffers.history, bufnr('%'))
  call assert_equal(['Unrelated reserved-name work'], getbufline(s:renamed_collision, 1, '$'))
  call assert_equal(s:promoted_history_text, getbufline(s:promoted_history, 1, '$'))
  let s:history_window = win_getid()
  call win_gotoid(s:rooms_window)
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.promoted-spaces')
  setlocal buftype= modifiable
  call setline(1, 'Promoted spaces are ordinary user work')
  let s:promoted_rooms = bufnr('%')
  let s:promoted_rooms_text = getline(1, '$')
  call win_gotoid(s:history_window)
  execute "normal \<BS>"
  let s:buffers = wbx#buffers()
  call assert_equal(s:buffers.rooms, bufnr('%'), 'keyboard return does not reuse a promoted spaces window')
  call assert_notequal(s:promoted_rooms, bufnr('%'))
  call assert_equal(s:promoted_rooms_text, getbufline(s:promoted_rooms, 1, '$'))
  call win_gotoid(s:history_window)
  execute 'bwipeout! ' . s:buffers.rooms
  execute "normal \<BS>"
  let s:buffers = wbx#buffers()
  let s:rooms_window = win_getid()
  call assert_equal(s:buffers.rooms, bufnr('%'), 'keyboard return safely recreates wiped spaces')

  " FileType maps win; Ctrl+s remains independently opt-in, with explicit Plug targets.
  augroup wbx_keyboard_hooks
    autocmd!
    autocmd FileType wbx-compose if get(b:, 'wbx_room', '') ==# 'keyboard-c' | nnoremap <silent><buffer> ,s :let g:wbx_keyboard_user_send += 1<CR> | endif
  augroup END
  let g:wbx_tui.send_with_ctrl_s = 1
  call s:enter('keyboard-c')
  call s:finish(14)
  call feedkeys("iCtrl-s default\<Esc>", 'xt')
  call assert_equal('<Plug>(WebexSend)', maparg('<C-s>', 'n'), 'Ctrl+s defaults remain available when enabled')
  call assert_equal('<Plug>(WebexSend)', maparg('<C-s>', 'i'))
  normal ,s
  call assert_equal(1, g:wbx_keyboard_user_send, 'FileType localleader send map wins')
  call assert_equal(2, s:count('messages.send'))
  execute "normal \<C-s>"
  call WaitFor('s:count("messages.send") == 3 && getline(1) ==# ""')
  call feedkeys("iInsert explicit send\<C-s>\<Esc>", 'xt')
  call WaitFor('s:count("messages.send") == 4 && getline(1) ==# ""')
  call assert_equal(2, g:wbx_keyboard_saved, 'enabled Ctrl+s explicitly sends instead of invoking global save')

  call win_gotoid(win_findbuf(s:buffers.history)[0])
  normal! 15Gzt
  let s:resumed_view = winsaveview()
  let s:resumed_tick = b:changedtick
  call win_gotoid(s:rooms_window)
  call s:enter('keyboard-c')
  call assert_equal(s:buffers.history, bufnr('%'))
  call assert_equal(s:resumed_view, winsaveview(), 're-entering the loaded space preserves the reading position')
  call assert_equal(s:resumed_tick, b:changedtick)
  call assert_equal(14, s:count('selection.complete'), 'resume has no backend history request')

  " Ownership release removes only defaults, using the original localleader.
  execute 'sbuffer ' . s:a
  let g:maplocalleader = ';'
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.promoted-draft')
  setlocal buftype=
  call assert_equal('', maparg(',s', 'n'), 'promotion removes the installed send key even after localleader changes')
  call assert_equal(['Retained a draft'], getline(1, '$'), 'promotion retains the user draft')
  let g:wbx_tui.mappings = 0
  call win_gotoid(s:rooms_window)
  call wbx#select('keyboard-d')
  call s:finish(15)
  WebexCompose
  call assert_false(get(maparg('<C-s>', 'n', 0, 1), 'buffer', 0), 'master false disables normal send defaults')
  call assert_false(get(maparg('<C-s>', 'i', 0, 1), 'buffer', 0), 'master false disables Insert send defaults')
  call assert_equal('', maparg(';s', 'n'), 'master false also disables localleader send')
  call assert_notmatch('WebexPickSpace', s:text(wbx#buffers().rooms), 'mapping opt-out does not add command tutorials')
  call assert_equal(['Unrelated native work'], getbufline(s:ordinary, 1, '$'))
  call assert_equal(['New native buffer in the origin window'], getbufline(s:origin_work, 1, '$'))
  call assert_equal(4, s:count('messages.send'), 'navigation, background work and promotion never send')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
