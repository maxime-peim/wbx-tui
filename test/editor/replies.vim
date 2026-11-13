" Native message blocks and reply drafts. Synthetic backend, no Webex I/O.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
let maplocalleader = ','
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
" Retain positive coverage of the explicit legacy rail style. The new default
" gutter and real statuscolumn integrations have independent positive fixtures.
filetype plugin on
syntax enable
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const rooms = ['a', 'b'].map(id => ({ id: 'reply-' + id, title: 'Space ' + id, type: 'group' }));
  rooms.push({ id: 'reply-a/reply/root', title: 'URI collision guard', type: 'group' });
  const messages = () => [
    { id: 'root', author: 'Alice', created: '2026-11-09T12:00:00Z', text: 'Deployment notes', markdown: '# Raw heading\n**bold** raw\nAlice · 2026-11-09 12:00\n> quoted line\n```md\n## Unclosed example' },
    { id: 'intervening', author: 'Carol', created: '2026-11-09T12:01:00Z', text: 'Intervening top-level message' },
    { id: 'answer', parentId: 'root', author: 'Bob', created: '2026-11-09T12:02:00Z', text: 'Reply alternative', markdown: '**Reply bold**\n' + 'A wrapped answer '.repeat(20) + '\nLast reply line' },
    { id: 'orphan', parentId: 'unloaded-root', author: 'Dana', created: '2026-11-09T12:03:00Z', text: 'The original parent is not loaded' },
    { id: 'quoted', author: 'Erin', created: '2026-11-09T12:04:00Z', text: 'A quote, not a thread', markdown: '> Original text', quoted: true }
  ];
  let revision = 0, outcome = 'sent';
  let state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false, readStatus: 'off' };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const audit = value => appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line), p = request.params || {};
    const reply = result => write({ jsonrpc: '2.0', id: request.id, result });
    switch (request.method) {
      case 'hello': reply({ version: 1, capabilities: process.env.WBX_REPLY_LEGACY === '1' ? ['delivery-resolution-v1'] : ['message-replies','delivery-resolution-v1'], state, meeting: { active: false, ready: false } }); break;
      case 'session.start': state = { ...state, state: 'ready', rooms }; publish(); reply(null); break;
      case 'rooms.select': state = { ...state, room: rooms.find(room => room.id === p.roomId), messages: messages(), ready: true }; publish(); reply(null); break;
      case 'test.publish': state = { ...state, ...p }; publish(); reply(null); break;
      case 'test.outcome': outcome = p.status; reply(null); break;
      case 'messages.send': {
        audit({ method: request.method, ...p }); const status = outcome; outcome = 'sent';
        setTimeout(() => {
          write({ jsonrpc: '2.0', method: 'delivery', params: { requestId: p.requestId, roomId: p.roomId, ...(p.parentId ? { parentId: status === 'wrong-parent' ? 'wrong-root' : p.parentId } : {}), status: status === 'wrong-parent' ? 'sent' : status, message: 'Synthetic reply result' } });
          reply(null);
        }, 120); break;
      }
      case 'delivery.resolve': reply(null); break;
      case 'delivery.resolveBound': reply({ roomId: p.roomId }); break;
      case 'rooms.read': audit({ method: request.method }); reply(null); break;
      case 'shutdown': reply(null); process.exit(0); break;
      default: reply(null);
    }
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'send_with_ctrl_s': 0, 'threaded_history': 0, 'message_borders': 'rails', 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
let s:controls = 0
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
function! s:posts() abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "messages.send"')
endfunction
function! s:block(id) abort
  return filter(copy(getbufvar(s:buffers.history, 'wbx_message_blocks', [])), 'v:val.id ==# a:id')[0]
endfunction
function! s:history(id) abort
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  call cursor(s:block(a:id).body, 1)
endfunction
function! s:reply(id) abort
  call s:history(a:id)
  WebexReply
  stopinsert
endfunction
function! s:prefix(row) abort
  if has('nvim')
    let namespace = nvim_get_namespaces()['wbx-message-blocks']
    let marks = nvim_buf_get_extmarks(bufnr('%'), namespace, [a:row - 1, 0], [a:row - 1, -1], {'details': v:true})
    return marks[0][3].virt_text[0][0]
  endif
  return prop_list(a:row, {'types': ['WbxBlockPrefix']})[0].text
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  call wbx#select('reply-a')
  call WaitFor('wbx#state().ready')
  let s:buffers = wbx#buffers()
  call s:history('root')
  call assert_equal(['root', 'intervening', 'answer', 'orphan', 'quoted'], map(copy(b:wbx_message_blocks), 'v:val.id'), 'reply indentation never reorders chronological history')
  call assert_equal(has('nvim') ? 'nvim-inline' : 'vim-props', b:wbx_block_display, 'the actual editors use native virtual borders, not a source-text fallback')
  call assert_equal('┌ ', s:prefix(s:block('root').start))
  call assert_equal('│ ', s:prefix(s:block('root').body))
  call assert_equal('  ┌ ', s:prefix(s:block('answer').start))
  call assert_equal('  │ ', s:prefix(s:block('answer').body))
  call assert_equal('  └─', s:prefix(s:block('answer').end))
  call assert_equal(0, s:block('quoted').indent, 'a quote alone never invents a reply relationship')
  call assert_equal('# Raw heading', getline(s:block('root').body), 'Markdown is not prefixed/indented in the actual buffer')
  normal! yy
  call assert_equal("# Raw heading\n", getreg('"'), 'ordinary native yanks contain the original Markdown without rails')
  call assert_equal('WbxMessageHeader', synIDattr(synID(s:block('answer').start, 1, 1), 'name'), 'an unclosed Markdown fence cannot consume the next sender header')
  call assert_match('^markdown', synIDattr(synID(s:block('answer').body, 3, 1), 'name'), 'the following reply starts its own Markdown context')
  call assert_match('parent not loaded', getline(s:block('orphan').start + 1))
  call assert_match('^↪ Reply to Alice', getline(s:block('answer').start + 1))
  call assert_notmatch('Raw heading\|— “', getline(s:block('answer').start + 1), 'reply context never repeats the original body')
  call assert_equal(1, count(getline(1, '$'), '# Raw heading'), 'the parent body occurs only in its own message')
  if $WBX_EDITOR_SCREEN ==# '1'
    setlocal nonumber norelativenumber signcolumn=no foldcolumn=0
    vertical resize 60
    normal! ggzt
    redraw!
    let left = getwininfo(win_getid())[0].wincol
    let root_header = screenpos(win_getid(), s:block('root').start, 1)
    let answer_header = screenpos(win_getid(), s:block('answer').start, 1)
    let fake_header = screenpos(win_getid(), s:block('root').body + 2, 1)
    let wrapped = screenpos(win_getid(), s:block('answer').body + 1, 1)
    call assert_true(root_header.row > 0 && wrapped.row > 0, 'message boundaries are tested on an actually drawn screen')
    call assert_equal('┌', screenstring(root_header.row, left), 'sender headers have a structural corner, not a Markdown heading')
    call assert_equal('│', screenstring(fake_header.row, left), 'sender-looking body text stays behind a body rail')
    call assert_equal('┌', screenstring(answer_header.row, left + 2), 'actual replies are indented two columns on screen')
    call assert_equal('│', screenstring(wrapped.row, left + 2))
    call assert_equal('│', screenstring(wrapped.row + 1, left + 2), 'wrapped answers retain an indented continuation rail')
    call assert_equal('A', screenstring(root_header.row, left + 2))
    call assert_equal('B', screenstring(answer_header.row, left + 4), 'reply indentation is visual, not whitespace in Markdown')
  endif
  let view = winsaveview()
  let tick = b:changedtick
  call s:control('test.publish', {'loading': v:true})
  call s:control('test.publish', {'loading': v:false})
  call assert_equal(tick, b:changedtick, 'polling only reuses native decorations without rewriting history')
  call assert_equal(view, winsaveview(), 'message decoration never moves a scrolled-up reader')

  WebexCompose
  let normal_draft = bufnr('%')
  if !empty(get(b:, 'wbx_send_hint', ''))
    call assert_true(stridx(b:wbx_reply_banner[1], b:wbx_send_hint) >= 0, 'normal composers show their effective send/help hint without adding draft text')
  endif
  let composer_windows = len(getwininfo())
  call setline(1, 'Normal draft retained')
  call s:reply('root')
  let root_draft = bufnr('%')
  call assert_notequal(normal_draft, root_draft)
  call assert_equal(composer_windows, len(getwininfo()), 'a reply reuses the owned composer instead of growing the layout')
  call assert_equal('root', wbx#destination().parentId)
  call assert_match('Replying to Alice', wbx#buffer_status())
  call assert_match('Replying to Alice', b:wbx_reply_banner[1])
  if !empty(get(b:, 'wbx_send_hint', ''))
    call assert_true(stridx(b:wbx_reply_banner[1], b:wbx_send_hint) >= 0, 'send guidance preserves the reply context in the same virtual banner')
  endif
  call assert_equal([''], getline(1, '$'), 'the reply banner is not draft content')
  if $WBX_EDITOR_SCREEN ==# '1'
    redraw!
    let composer_info = getwininfo(win_getid())[0]
    call assert_equal('↪', screenstring(composer_info.winrow, composer_info.wincol), 'the reply target is visibly shown above the draft, not merely stored in metadata')
  endif
  call feedkeys("iFirst line\<CR>Second line\<Esc>", 'xt')
  call assert_equal(['First line', 'Second line'], getline(1, '$'), 'Enter in a reply is still an ordinary editor newline')
  call assert_equal([], s:posts(), 'typing a reply never implicitly sends')
  normal! u
  call assert_equal([''], getline(1, '$'), 'virtual reply context does not disturb native undo')
  call setline(1, 'Root reply retained')
  WebexCancelReply
  call assert_equal(composer_windows, len(getwininfo()), 'canceling a reply restores the normal draft without another split')
  call assert_equal(normal_draft, bufnr('%'))
  call assert_equal(['Normal draft retained'], getline(1, '$'))
  call assert_equal(['Root reply retained'], getbufline(root_draft, 1, '$'))
  call s:reply('answer')
  call assert_equal(root_draft, bufnr('%'), 'answering a reply uses the Webex thread root, not nested parent IDs')
  call s:reply('orphan')
  call assert_equal(composer_windows, len(getwininfo()), 'switching thread drafts does not accumulate composer panes')
  let orphan_draft = bufnr('%')
  call setline(1, 'Independent orphan-thread draft')
  call assert_equal('unloaded-root', wbx#destination().parentId)
  call assert_match('parent not loaded', wbx#buffer_status())
  call s:reply('root')
  call assert_equal(['Root reply retained'], getline(1, '$'), 'each room/thread pair retains its own draft')
  call assert_equal(['Independent orphan-thread draft'], getbufline(orphan_draft, 1, '$'))
  call assert_equal([], s:posts(), 'reply selection, editing, cancel and Enter do not send')
  call wbx#select('reply-a/reply/root')
  call WaitFor('wbx#state().room.id ==# "reply-a/reply/root"')
  WebexCompose
  call assert_notequal(root_draft, bufnr('%'), 'base64/path-like room IDs cannot alias an existing reply draft')
  call assert_equal('reply-a', wbx#destination(root_draft).id, 'a URI collision cannot retarget another draft')
  call wbx#select('reply-a')
  call WaitFor('wbx#state().room.id ==# "reply-a"')
  call s:reply('root')

  call setline(1, 'Acknowledgment must retain newer edits')
  WebexSend
  call setline(1, 'Edited while reply was pending')
  call WaitFor('!wbx#destination().pending')
  call assert_equal(['Edited while reply was pending'], getline(1, '$'))
  call setline(1, 'Clear only this reply after a matching ACK')
  WebexSend
  WebexCancelReply
  call wbx#select('reply-b')
  call WaitFor('wbx#state().room.id ==# "reply-b"')
  WebexCompose
  let other_draft = bufnr('%')
  call setline(1, 'Other-space draft')
  call WaitFor('getbufline(' . root_draft . ', 1, "$") ==# [""]')
  call assert_equal(['Other-space draft'], getline(1, '$'), 'a delayed reply ACK never clears the currently visible unrelated draft')
  call assert_equal(['Normal draft retained'], getbufline(normal_draft, 1, '$'))
  call assert_equal('root', s:posts()[1].parentId)
  call wbx#select('reply-a')
  call WaitFor('wbx#state().room.id ==# "reply-a"')
  call s:reply('quoted')
  call setline(1, 'Saved copy of a pending reply')
  WebexSend
  let promoted = bufnr('%')
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.reply-copy')
  setlocal buftype=
  call assert_equal({}, wbx#destination(), 'promoting a reply releases its room AND parent binding')
  sleep 180m
  call assert_equal(['Saved copy of a pending reply'], getline(1, '$'), 'late reply ACKs never clear a promoted ordinary file')

  call s:reply('root')
  call setline(1, 'Unknown reply retained')
  call s:control('test.outcome', {'status': 'unknown'})
  WebexSend
  call WaitFor('wbx#destination().uncertain')
  call assert_equal(['Unknown reply retained'], getline(1, '$'))
  let posts = len(s:posts())
  WebexSend
  WebexCancelReply
  WebexSend
  sleep 30m
  call assert_equal(posts, len(s:posts()), 'uncertain reply delivery blocks both reply and normal drafts without retry')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call s:reply('root')
  call s:control('test.outcome', {'status': 'wrong-parent'})
  WebexSend
  call WaitFor('!wbx#transport#running()')
  call assert_equal(['Unknown reply retained'], getbufline(root_draft, 1, '$'), 'wrong-parent delivery ACKs fail closed without erasing a draft')

  let $WBX_REPLY_LEGACY = '1'
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  call wbx#select('reply-a')
  call WaitFor('wbx#state().ready')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call s:history('root')
  WebexReply
  call assert_equal(s:buffers.history, bufnr('%'), 'an older backend cannot silently create an unthreaded reply')
  WebexCompose
  WebexSend
  sleep 30m
  call assert_equal(posts + 1, len(s:posts()), 'retained reply drafts also refuse sending through a legacy backend')
  let $WBX_REPLY_LEGACY = ''
  let clipped = wbx#history#render([{'id': 'huge', 'author': 'Synthetic', 'created': '', 'text': repeat("line\n", 2000)}], 0)
  call assert_false(clipped.complete)
  call assert_true(len(clipped.lines) <= 1003, 'native decoration work is bounded for newline-heavy content')
  call s:control('test.publish', {'readStatus': 'ready', 'messages': [{'id': 'huge', 'author': 'Synthetic', 'created': '', 'text': repeat("line\n", 2000)}]})
  call s:history('huge')
  normal! G
  WebexMarkRead
  call assert_false(b:wbx_history_complete)
  call assert_equal([], filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "rooms.read"'), 'clipped content cannot acknowledge unseen message text')
  setlocal modifiable
  call setline(1, 'An edited copy without the original message rows')
  if line('$') > 1
    call deletebufline(bufnr('%'), 2, '$')
  endif
  call wbx#_setup_buffer()
  call assert_equal(['An edited copy without the original message rows'], getline(1, '$'), 'reentering a shortened annotated view neither discards text nor places stale decorations')

  " Complete native -> compiled RPC -> real EditorEngine -> in-memory demo API
  " round trip. This does not authorize or use live OAuth/HTTP.
  call wbx#transport#stop()
  let g:wbx_tui.backend = []
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3 && wbx#state().rooms[0].id ==# "demo-general"')
  call wbx#select('demo-general')
  call WaitFor('wbx#state().ready')
  call win_gotoid(win_findbuf(s:buffers.history)[0])
  WebexRefresh!
  let real_parent = wbx#state().messages[0].id
  call s:reply(real_parent)
  let real_reply = bufnr('%')
  call setline(1, ['Native-to-engine threaded demo', 'Literal **plaintext**'])
  WebexSend
  call WaitFor('getbufline(' . real_reply . ', 1, "$") ==# [""] && len(wbx#state().messages) == 3')
  call assert_equal(real_parent, wbx#state().messages[-1].parentId, 'the actual compiled backend retains the exact thread root')
  call assert_equal("Native-to-engine threaded demo\nLiteral **plaintext**", wbx#state().messages[-1].text)
  call assert_equal(2, getbufvar(s:buffers.history, 'wbx_message_blocks')[-1].indent)
  call assert_false(has_key(wbx#destination(), 'parentId'), 'confirmed delivery automatically restores the real normal draft without a lingering thread target')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
