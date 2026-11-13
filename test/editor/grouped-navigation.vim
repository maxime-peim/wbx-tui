" Grouped presentation is not canonical chronology. Fake RPC only; no Webex I/O.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const room = { id: 'grouped-room', title: 'Grouped navigation', type: 'group', unread: true, unreadStale: false };
  const root = { id: 'root', author: 'Root', created: '2026-11-09T12:00:00Z', text: 'Root body\nRoot endpoint' };
  let messages = [root, ...Array.from({ length: 30 }, (_, i) => ({ id: 'other-' + i, author: 'Other', created: new Date(Date.parse(root.created) + (i + 1) * 60000).toISOString(), text: 'Unrelated body ' + i })),
    { id: 'latest-reply', parentId: root.id, author: 'Reply', created: '2026-11-09T13:00:00Z', text: 'Latest reply body\nLatest reply endpoint' }];
  let revision = 0, state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false, readStatus: 'ready', historyLatest: true };
  const write = value => process.stdout.write(JSON.stringify(value) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc: '2.0', method: 'state', params: state }); };
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line), p = request.params || {}, reply = result => write({ jsonrpc: '2.0', id: request.id, result });
    switch (request.method) {
      case 'hello': reply({ version: 1, capabilities: ['message-replies'], state, meeting: { active: false, ready: false } }); break;
      case 'session.start': state = { ...state, state: 'ready', rooms: [room] }; publish(); reply(null); break;
      case 'rooms.select': appendFileSync(process.env.WBX_EDITOR_AUDIT, 'select\n'); state = { ...state, room, ready: true, messages, historyLatest: true }; publish(); reply(null); break;
      case 'rooms.read': appendFileSync(process.env.WBX_EDITOR_AUDIT, 'read:' + p.messageId + '\n'); reply(null); break;
      case 'test.publish': messages = p.messages || messages; state = { ...state, ...p }; publish(); reply(null); break;
      case 'shutdown': reply(null); process.exit(0); break;
      default: reply(null);
    }
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'read_status': 1, 'mark_read_on_open': 0, 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
let s:drawn = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:block(id) abort
  return filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')[0]
endfunction
let s:controls = 0
function! s:controlled(message) abort
  let s:controls += 1
endfunction
function! s:publish(params) abort
  let expected = s:controls + 1
  call wbx#rpc('test.publish', a:params, function('s:controlled'))
  call WaitFor('s:controls == ' . expected)
endfunction
function! s:reads() abort
  return filter(readfile($WBX_EDITOR_AUDIT), 'v:val =~# "^read:"')
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select('grouped-room', 1)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && len(get(b:, "wbx_message_blocks", [])) == 32')
  let s:buffers = wbx#buffers()
  call assert_equal(['root', 'latest-reply', 'other-0'], map(copy(b:wbx_message_blocks[:2]), 'v:val.id'), 'grouping changes presentation, not canonical message identity')
  call assert_equal('latest-reply', wbx#state().messages[-1].id, 'backend chronology stays canonical')
  call assert_equal(s:block('latest-reply').end, line('.'), 'explicit open navigates to canonical latest, not the final unrelated root')
  call assert_true(line('.') < line('$') - 50, 'newest message may be well above the final rendered row')
  call assert_equal([], s:reads(), 'navigation alone is not receipt consent')
  let draft = s:buffers.drafts['grouped-room']
  call setbufline(draft, 1, 'Destination-bound unsent draft')
  let draft_tick = getbufvar(draft, 'changedtick')
  let reader = win_getid()
  call cursor(s:block('root').start, 1)
  normal! za
  call assert_equal(s:block('root').start, foldclosed(s:block('latest-reply').start), 'za on a root header hides reply headers too')
  let messages = wbx#state().messages + [{'id': 'newer-reply', 'parentId': 'root', 'author': 'Newer', 'created': '2026-11-09T13:01:00Z', 'text': "Newer reply\nNewest endpoint"}]
  call s:publish({'messages': messages})
  call assert_equal(s:block('root').start, foldclosed(s:block('newer-reply').start), 'a new reply stays inside the existing closed thread')
  call assert_equal(-1, foldclosed(s:block('newer-reply').end), 'the newest thread separator stays outside its closed fold')
  call cursor(s:block('newer-reply').end, 1)
  normal R
  sleep 20m
  call assert_equal([], s:reads(), 'a visible blank separator never stands in for a hidden newest body endpoint')
  WebexLatest
  call assert_equal(s:block('root').start, line('.'), 'latest navigation leaves a closed outer thread closed')
  normal R
  sleep 20m
  call assert_equal([], s:reads(), 'closed whole-thread folds cannot authorize receipts')
  normal! zo
  WebexLatest
  call assert_equal(s:block('newer-reply').end, line('.'))
  normal R
  if s:drawn | call WaitFor('len(s:reads()) == 1') | endif
  call assert_equal(s:drawn ? ['read:newer-reply'] : [], s:reads(), 'manual receipt follows canonical newest ID instead of the last displayed root')
  let g:wbx_tui.mark_read_on_open = 1
  call s:publish({'historyLatest': v:false})
  let selects = len(filter(readfile($WBX_EDITOR_AUDIT), 'v:val ==# "select"'))
  WebexLatest
  call WaitFor('len(filter(readfile($WBX_EDITOR_AUDIT), ''v:val ==# "select"'')) == ' . (selects + 1))
  sleep 30m
  call assert_true(wbx#state().historyLatest, 'explicit latest navigation refetches a capped endpoint')
  call assert_equal(s:drawn ? ['read:newer-reply'] : [], s:reads(), 'refetch-to-latest must not grant automatic receipt consent')
  call assert_equal(reader, win_getid())
  call assert_equal(draft_tick, getbufvar(draft, 'changedtick'))
  call assert_equal(['Destination-bound unsent draft'], getbufline(draft, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
