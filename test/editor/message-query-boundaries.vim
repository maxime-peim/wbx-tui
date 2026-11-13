" Synthetic selected-read RPC only. Rendering, choice, jumps and drafts must not send.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:query_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return g:query_available', 'endfunction',
      \ 'function! wbx#context_epoch() abort', 'return g:query_epoch', 'endfunction',
      \ 'function! wbx#buffers() abort', 'return {"history": g:query_history}', 'endfunction',
      \ 'function! wbx#compose(...) abort', 'let g:query_composes += 1', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid message query DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:query_requests, [a:method, deepcopy(a:params)])',
      \ 'if g:query_hold | let g:QueryCallback = a:Callback | return 1 | endif',
      \ 'call call(a:Callback, [{"result": deepcopy(g:query_result)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:query_available = 1 | let g:query_epoch = 1 | let g:query_hold = 0 | let g:query_composes = 0
let g:query_requests = []
let g:query_pwned = 0
let s:root = {'id': 'root', 'author': 'Label', 'created': '2026-11-15T10:00:00.000Z', 'text': ':let g:query_pwned = 1', 'fileCount': 0, 'contentPartial': v:false}
let s:reply = extend(deepcopy(s:root), {'id': 'reply', 'parentId': 'root', 'text': 'Remote reply'})
let g:query_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'room', 'title': 'Synthetic'},
      \ 'messages': [deepcopy(s:root)], 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:query_result = {'sessionId': repeat('a', 32), 'roomId': 'room', 'kind': 'mentions', 'coverage': 'room-mentions-me',
      \ 'observedAt': localtime() * 1000, 'revision': 1, 'partial': v:true, 'more': v:true, 'limit': 'none',
      \ 'items': [deepcopy(s:root)]}
command! WebexQueryRefresh call wbx#queries#page(0)
command! WebexQueryMore call wbx#queries#page(1)
command! WebexQueryMessage call wbx#queries#message()
command! WebexQueryJump call wbx#queries#jump()
command! WebexQueryReply call wbx#queries#reply()
try
  call setline(1, 'Unrelated native work')
  let original = bufnr('%')
  let g:query_history = 0
  call wbx#queries#thread()
  call assert_equal([], g:query_requests, 'remote source must come from exact unchanged main history')
  let g:query_available = 0
  call wbx#queries#mentions()
  call assert_equal([], g:query_requests, 'old/missing backend capability cannot start a read')
  let g:query_available = 1
  call wbx#queries#mentions()
  call assert_equal([['messages.mentions', {'roomId': 'room'}]], g:query_requests)
  let mentions = bufnr('%')
  call assert_match('PARTIAL', getline(2))
  call assert_match('room room', getline(1), 'origin space remains visible even after selection changes')
  call assert_match('@all coverage unverified', getline(3))
  let g:query_result.revision = 2
  let g:query_result.items += [deepcopy(s:reply)]
  let g:query_result.partial = v:false | let g:query_result.more = v:false
  normal ]p
  call assert_equal(['messages.mentions', {'roomId': 'room', 'more': v:true, 'revision': 1}], g:query_requests[-1])
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal(mentions, bufnr('%'))
  call cursor(6, 1)
  let requests = len(g:query_requests)
  execute "normal \<CR>"
  call assert_equal('query-message', b:wbx_list_kind)
  call assert_match('Remote reply', join(getline(1, '$'), ' '))
  call assert_equal(requests, len(g:query_requests), 'opening retained inert body performs zero requests')
  call assert_equal(0, g:query_pwned)
  call wbx#queries#reply()
  call assert_equal(0, g:query_composes, 'mentions cannot become caller-supplied root drafts')
  normal q
  let g:query_hold = 1
  normal r
  let LateCallback = g:QueryCallback
  let g:query_epoch += 2
  let text = getline(1, '$')
  call call(LateCallback, [{'result': g:query_result}])
  call assert_equal(text, getline(1, '$'))
  call assert_false(wbx#queries#current(), 'away-and-return revokes native query choices')
  let g:query_hold = 0
  call wbx#queries#mentions()
  call assert_true(wbx#queries#current())
  let b:wbx_query_snapshot.observedAt -= 120001
  call cursor(5, 1)
  call wbx#queries#message()
  call wbx#queries#reply()
  call assert_equal(mentions, bufnr('%'))
  call assert_equal(0, g:query_composes)
  let requests = len(g:query_requests)
  normal r
  call assert_equal(requests + 1, len(g:query_requests), 'explicit refresh still works after age expiry')
  call assert_equal(['messages.mentions', {'roomId': 'room'}], g:query_requests[-1])
  call assert_true(wbx#queries#current())
  call wbx#queries#mentions()
  let g:query_hold = 1
  normal r
  let OldCallback = g:QueryCallback
  let old = deepcopy(g:query_result)
  let g:query_state.localContext.sessionId = repeat('b', 32)
  let g:query_result.sessionId = repeat('b', 32)
  let g:query_hold = 0
  call wbx#queries#mentions()
  call assert_true(wbx#queries#current(), 'dropped callback from replaced session cannot wedge current requests')
  call call(OldCallback, [{'result': old}])
  call assert_equal(repeat('b', 32), b:wbx_query_snapshot.sessionId)
  let invalid = deepcopy(g:query_result)
  let invalid.items[0].files = ['https://evil.invalid/original']
  call assert_false(wbx#protocol#message_query(invalid), 'no original file URL registry in query DTO')
  let invalid = deepcopy(g:query_result) | let invalid.items[0].authorId = 'not-permission'
  call assert_false(wbx#protocol#message_query(invalid))
  let invalid = deepcopy(g:query_result) | let invalid.limit = 'bytes'
  call assert_false(wbx#protocol#message_query(invalid), 'limited data can never be marked complete')
  setlocal modifiable
  call setline(1, 'Private query annotation')
  let tree = undotree()
  let requests = len(g:query_requests)
  normal r
  normal ]p
  normal q
  call assert_equal(requests, len(g:query_requests))
  call assert_equal('Private query annotation', getline(1))
  call assert_equal(tree, undotree())
  execute 'bwipeout! ' . mentions
  enew
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let g:query_history = bufnr('%')
  let view = wbx#history#render(g:query_state.messages, 0)
  call setline(1, view.lines)
  let b:wbx_message_blocks = view.blocks | let b:wbx_render_tick = b:changedtick
  setlocal nomodifiable nomodified
  let b:wbx_paging_edge = b:wbx_message_blocks[0].start
  let g:query_state.moreHistory = v:true
  call wbx#paging#sync(g:query_state)
  call cursor(line('$'), 1)
  call wbx#paging#baseline()
  call cursor(view.blocks[0].body, 1)
  let g:query_result.kind = 'thread' | let g:query_result.coverage = 'room-thread'
  let g:query_result.rootId = 'root' | let g:query_result.sourceId = 'root'
  let g:query_result.items = [deepcopy(s:root), deepcopy(s:reply)]
  call wbx#queries#thread()
  call assert_equal(['messages.thread', {'roomId': 'room', 'messageId': 'root'}], g:query_requests[-1])
  let thread = bufnr('%')
  call wbx#queries#reply()
  call assert_equal(1, g:query_composes)
  call assert_equal('root', wbx#drafts#reply('room'), 'existing native root-draft owner, not a second registry')
  let g:query_state.messages = []
  call wbx#queries#reply()
  call assert_equal(1, g:query_composes, 'unreferenced root refuses without new write authority')
  let g:query_state.messages = [deepcopy(s:root)]
  call cursor(index(b:wbx_query_rows, 'root') + 1, 1)
  WebexQueryJump
  call assert_equal(g:query_history, bufnr('%'))
  call assert_equal('root', wbx#view#message_at(bufnr('%'), line('.')), 'exact main-history ID, never nearest-row substitution')
  call assert_false(wbx#paging#navigation('history', 1), 'programmatic result jump cannot admit a hidden older-history page')
  call assert_equal(0, g:query_pwned, 'message text stays inert')
  let g:query_state.messages = [deepcopy(s:root), deepcopy(s:reply)]
  let view = wbx#history#render(g:query_state.messages, 0)
  setlocal modifiable
  call setline(1, view.lines)
  let b:wbx_message_blocks = view.blocks | let b:wbx_render_tick = b:changedtick
  setlocal nomodifiable nomodified foldmethod=manual foldenable foldlevel=0
  execute '1,' . line('$') . 'fold'
  let history_window = win_getid()
  let reply_body = filter(copy(view.blocks), 'v:val.id ==# "reply"')[0].body
  let closed = foldclosed(reply_body)
  call assert_true(closed >= 0)
  call win_gotoid(win_findbuf(thread)[0])
  call cursor(index(b:wbx_query_rows, 'reply') + 1, 1)
  WebexQueryJump
  call assert_equal(thread, bufnr('%'), 'closed root fold cannot substitute its identity for the requested reply')
  call win_execute(history_window, 'let w:query_test_fold = foldclosed(' . reply_body . ')')
  call assert_equal(closed, wbx#view#window_var(history_window, 'query_test_fold', -1), 'result navigation preserves native fold choices')
  call win_execute(history_window, 'normal! zR')
  WebexQueryJump
  call assert_equal('reply', wbx#view#message_at(bufnr('%'), line('.')), 'explicitly opened fold permits exact reply navigation')
  call assert_false(wbx#paging#navigation('history', 1))
  call win_gotoid(win_findbuf(thread)[0])
  let g:wbx_tui = {'mappings': 0}
  call wbx#lists#setup()
  call assert_equal('', maparg('<CR>', 'n'))
  call assert_equal('', maparg('r', 'n'))
  call assert_equal('', maparg(']p', 'n'))
  call assert_true(empty(filter(copy(g:query_requests), 'index(["messages.thread", "messages.mentions"], v:val[0]) < 0')), 'no receipt, send, lookup, scan or opener operations')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
