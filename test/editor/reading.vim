" Rich native reading and mark-on-open. Private synthetic backend; no Webex I/O.
set encoding=utf-8 hidden noswapfile lines=60 columns=160 nowrap
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const rooms = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id: 'read-' + id, title: 'Space ' + id, type: 'group', ...(id === 'c' ? {} : { unread: id !== 'b' }) }));
  let revision = 0, behavior = 'ok', confirmReceipt = false;
  let state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false, readStatus: 'ready' };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const audit = value => appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  const messages = () => [
    { id: 'first', author: 'Synthetic', created: '2026-11-09T12:00:00Z', text: 'A long line '.repeat(50) },
    { id: 'latest', author: 'Synthetic', created: '2026-11-09T12:01:00Z', text: 'Plain alternative', quoted: true,
      markdown: '## A body heading\n**bold** and *italic* with `code`\n- item\n[Link](https://example.test)\n> Original author\n> Original text' }
  ];
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line), p = request.params || {};
    const reply = result => write({ jsonrpc: '2.0', id: request.id, result });
    switch (request.method) {
      case 'hello': reply({ version: 1, state, meeting: { active: false, ready: false } }); break;
      case 'session.start': state = { ...state, state: 'ready', rooms }; publish(); reply(null); break;
      case 'test.control': behavior = p.behavior; confirmReceipt = p.receipt === 'confirmed'; reply(null); break;
      case 'test.publish': state = { ...state, ...p }; publish(); reply(null); break;
      case 'test.confirm-read': state.rooms = state.rooms.map(room => room.id === p.roomId ? { ...room, unread: false } : room); publish(); reply(null); break;
      case 'rooms.select': {
        audit({ method: request.method }); const selected = behavior; behavior = 'ok';
        setTimeout(() => {
          if (selected !== 'error') { state = { ...state, rooms: selected === 'late-unread' ? state.rooms.map(room => room.id === p.roomId ? { ...room, unread: true } : room) : state.rooms, room: rooms.find(room => room.id === (selected === 'stale' ? 'read-b' : p.roomId)), ready: true, loading: false, messages: selected === 'empty' ? [] : messages() }; publish(); }
          setTimeout(() => {
            if (selected === 'error') write({ jsonrpc: '2.0', id: request.id, error: { code: -1, message: 'Synthetic selection failure' } });
            else reply(null);
            audit({ method: 'selection.complete' });
          }, 40);
        }, 20); break;
      }
      case 'rooms.read':
        audit({ method: request.method, ...p });
        if (confirmReceipt) reply(null);
        else write({ jsonrpc: '2.0', id: request.id, error: { code: -1, message: 'Synthetic receipt outcome unknown; no retry' } });
        break;
      case 'shutdown': reply(null); process.exit(0); break;
      default: reply(null);
    }
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'read_status': 1, 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
let s:ordinary = bufnr('%')
let s:ordinary_window = win_getid()
call setline(1, 'Unrelated work')
let s:controls = 0
" Silent Ex Vim has no drawn screen (w$ may precede w0). Positive receipt
" acceptance runs in headless Neovim's virtual UI or an explicitly drawn Vim;
" undrawn Vim must conservatively issue zero receipts, including on opens.
let s:drawn = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
function! s:receipts(count) abort
  return s:drawn ? a:count : 0
endfunction
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:controlled(message) abort
  let s:controls += 1
endfunction
function! s:control(method, params) abort
  let expected = s:controls + 1
  call wbx#rpc(a:method, a:params, function('s:controlled'))
  call WaitFor('s:controls == ' . expected)
endfunction
function! s:count(method) abort
  return len(filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method'))
endfunction
function! s:open(id) abort
  call win_gotoid(s:rooms_window)
  call cursor(index(b:wbx_room_ids, a:id) + 1, 1)
  let expected = s:count('selection.complete') + 1
  " Force a fresh synthetic history result for the fault/receipt scenarios.
  " Plain Enter/resume behavior is covered independently in media-resume.vim.
  call wbx#select(a:id, 1, 1, 1)
  call WaitFor('s:count("selection.complete") == ' . expected)
  sleep 30m
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 5')
  let s:buffers = wbx#buffers()
  let s:rooms_window = win_getid()
  call assert_false(&l:wrap, 'spaces retain their native option instead of global wrapping')
  call s:open('read-a')
  call WaitFor('s:count("rooms.read") == s:receipts(1)')
  call assert_equal(s:buffers.history, bufnr('%'))
  call assert_true(&l:wrap && &l:linebreak, 'history defaults to native word wrapping')
  call assert_equal(2, &l:conceallevel, 'native Markdown markup is concealed for reading')
  call assert_equal('nc', &l:concealcursor)
  call assert_equal(line('$'), line('.'))
  call assert_match('## A body heading', join(getline(1, '$'), "\n"), 'the Markdown alternative is displayed')
  call assert_notmatch('Plain alternative', join(getline(1, '$'), "\n"))
  let row = search('^## A body heading$', 'nw')
  call assert_notequal('WbxMessageHeader', synIDattr(synID(row, 4, 1), 'name'), 'body headings cannot spoof message metadata')
  let row = search('^\*\*bold', 'nw')
  call assert_match('^markdown', synIDattr(synID(row, 3, 1), 'name'), 'rich body receives native emphasis')
  call assert_equal(1, synconcealed(row, 1)[0], 'bold delimiters are actually concealed')
  let row = search('^↪ Quoted / forwarded content$', 'nw')
  call assert_equal('WbxQuoteLabel', synIDattr(synID(row, 1, 1), 'name'), 'quoted/forwarded content has distinct styling')
  call assert_true(index(getbufvar(s:buffers.rooms, 'wbx_unread_rows'), 3) < 0, 'explicit successful opening clears local emphasis even if its receipt fails')
  call assert_true(wbx#state().rooms[0].unread, 'local presentation never rewrites the server unread flag')
  if s:drawn
    let receipt = filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "rooms.read"')[0]
    call assert_equal({'method': 'rooms.read', 'roomId': 'read-a', 'messageId': 'latest'}, receipt)
  endif
  close
  call s:open('read-a')
  call assert_true(&l:wrap && &l:linebreak, 'reopening a closed history window retains its native wrapping defaults')
  call assert_equal(2, &l:conceallevel, 'reopening a closed history window retains Markdown display')
  setlocal nowrap conceallevel=0
  call s:control('test.publish', {'loading': v:true})
  call s:control('test.publish', {'loading': v:false})
  call assert_false(&l:wrap, 'background state does not erase native option overrides')
  call assert_equal(0, &l:conceallevel)
  call s:open('read-a')
  call assert_equal(s:receipts(1), s:count('rooms.read'), 'failed/unknown automatic receipts are not retried by reopening')
  let cached_rooms = wbx#state().rooms
  let cached_rooms[0].unread = v:false
  let cached_rooms[0].unreadStale = v:true
  call s:control('test.publish', {'rooms': cached_rooms, 'readStatus': 'failed'})
  call s:control('test.publish', {'readStatus': 'ready'})
  normal R
  call assert_equal(s:receipts(1), s:count('rooms.read'), 'cached read values cannot authorize a manual receipt even while other rooms recover')
  let cached_rooms[0].unread = v:true
  let cached_rooms[0].unreadStale = v:false
  call s:control('test.publish', {'rooms': cached_rooms})
  call s:open('read-a')
  call assert_equal(s:receipts(1), s:count('rooms.read'), 'stale read history never clears the failed automatic-receipt deduplication')
  call assert_false(&l:wrap, 'reopening retains a later native wrap override')
  call s:open('read-b')
  call s:open('read-c')
  call assert_equal(s:receipts(1), s:count('rooms.read'), 'read and unknown spaces do not trigger an automatic receipt')
  call win_gotoid(s:rooms_window)
  let expected = s:count('selection.complete') + 1
  call wbx#select('read-d')
  call WaitFor('s:count("selection.complete") == ' . expected)
  call assert_equal(s:buffers.rooms, bufnr('%'), 'programmatic selection remains focus-neutral')
  call assert_equal(s:receipts(1), s:count('rooms.read'), 'programmatic selection alone does not mark a space read')
  let g:wbx_tui.mark_read_on_open = 0
  call s:open('read-d')
  call assert_equal(s:receipts(1), s:count('rooms.read'), 'mark-on-open has an independent opt-out')
  let g:wbx_tui.mark_read_on_open = 1
  call s:open('read-d')
  " selection.complete precedes the separate backend receipt audit; wait for
  " that positive event instead of assuming the fixed post-open sleep suffices.
  call WaitFor('s:count("rooms.read") == s:receipts(2)')
  call assert_equal(s:receipts(2), s:count('rooms.read'))
  call s:control('test.control', {'behavior': 'error'})
  call s:open('read-e')
  call s:control('test.control', {'behavior': 'stale'})
  call s:open('read-e')
  call assert_equal(s:receipts(2), s:count('rooms.read'), 'failed and stale opens cannot acknowledge a different conversation')
  call win_gotoid(s:rooms_window)
  let expected = s:count('selection.complete') + 1
  call wbx#select('read-e', 1)
  call win_gotoid(s:ordinary_window)
  call WaitFor('s:count("selection.complete") == ' . expected)
  sleep 30m
  call assert_equal(s:ordinary_window, win_getid())
  call assert_false(&l:wrap, 'unrelated work keeps its original window option')
  call assert_equal(s:receipts(2), s:count('rooms.read'), 'canceled focus also cancels automatic acknowledgment')
  call setbufvar(s:buffers.history, '&modifiable', 1)
  call setbufline(s:buffers.history, 1, 'Private annotation')
  call s:open('read-e')
  call assert_equal(s:receipts(2), s:count('rooms.read'), 'edited history cannot automatically acknowledge unseen content')
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  WebexRefresh!
  call s:control('test.publish', {'readStatus': 'failed'})
  call s:open('read-e')
  call assert_equal(s:receipts(2), s:count('rooms.read'), 'unavailable sync cannot issue a receipt')
  call s:control('test.publish', {'readStatus': 'ready'})
  call s:control('test.control', {'behavior': 'empty'})
  call s:open('read-e')
  call assert_equal(s:receipts(2), s:count('rooms.read'), 'empty history has no endpoint to acknowledge')
  call s:open('read-e')
  call assert_equal(s:receipts(3), s:count('rooms.read'))
  let rooms = wbx#state().rooms
  let rooms[-1].unread = v:false
  call s:control('test.publish', {'rooms': rooms})
  call assert_true(index(getbufvar(s:buffers.rooms, 'wbx_unread_rows'), 7) < 0, 'server-confirmed read agrees with the local read presentation')
  let rooms[-1].unread = v:true
  call s:control('test.publish', {'rooms': rooms})
  call s:open('read-e')
  call assert_equal(s:receipts(4), s:count('rooms.read'), 'a new server-unread cycle after confirmed read can be acknowledged again')
  call s:control('test.control', {'behavior': 'late-unread'})
  call s:open('read-c')
  call assert_equal(s:receipts(5), s:count('rooms.read'), 'unread status arriving during successful history loading is also acknowledged')
  let rooms = wbx#state().rooms
  let rooms[1].unread = v:true
  call s:control('test.publish', {'rooms': rooms})
  call s:control('test.control', {'behavior': 'ok', 'receipt': 'confirmed'})
  call s:open('read-b')
  call assert_equal(s:receipts(6), s:count('rooms.read'), 'opening an unread space issues exactly one successful receipt')
  call assert_true(wbx#state().rooms[1].unread, 'a successful receipt ACK still awaits authoritative server confirmation')
  let rooms_tick = getbufvar(s:buffers.rooms, 'changedtick')
  let reading_view = winsaveview()
  let reading_window = win_getid()
  call s:control('test.confirm-read', {'roomId': 'read-b'})
  call assert_false(wbx#state().rooms[1].unread, 'server confirmation after opening clears the actual unread state')
  call assert_equal(rooms_tick, getbufvar(s:buffers.rooms, 'changedtick'), 'confirmation changes styling without rewriting titles')
  let row = index(getbufvar(s:buffers.rooms, 'wbx_room_ids'), 'read-b') + 1
  call win_execute(s:rooms_window, 'let g:wbx_reading_marker_group = synIDattr(synID(' . row . ', 1, 1), "name")')
  call win_execute(s:rooms_window, 'let g:wbx_reading_title_group = synIDattr(synID(' . row . ', 5, 1), "name")')
  call assert_equal('WbxRoom', g:wbx_reading_title_group, 'the opened, server-read title is normal rather than still colored as selected')
  call assert_equal('WbxSelected', g:wbx_reading_marker_group, 'only its open marker remains accented')
  call assert_equal(reading_window, win_getid())
  call assert_equal(reading_view, winsaveview(), 'confirmation never moves the history reader')
  let rooms = wbx#state().rooms
  let rooms[1].unread = v:true
  call s:control('test.publish', {'rooms': rooms})
  " Probe left-to-right like the renderer. Silent Ex Vim otherwise reuses a
  " prior mid-line synID() result across a metadata-only syntax replacement.
  call win_execute(s:rooms_window, 'call synID(' . row . ', 1, 1)')
  call win_execute(s:rooms_window, 'let g:wbx_reading_title_group = synIDattr(synID(' . row . ', 5, 1), "name")')
  call assert_equal('WbxUnread', g:wbx_reading_title_group, 'new server-unread activity still emphasizes an already-open space')
  call assert_equal(s:receipts(6), s:count('rooms.read'), 'later incoming activity does not automatically send another receipt')
  call assert_equal(['Unrelated work'], getbufline(s:ordinary, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'positive_receipts': s:drawn ? 'virtual/drawn UI' : 'NOT RUN: undrawn silent Ex; zero receipts verified'})], $WBX_EDITOR_RESULT)
qa!
