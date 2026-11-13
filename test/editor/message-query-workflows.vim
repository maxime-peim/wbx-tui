" Real demo backend, native keys, read-only remote queries and existing root drafts.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
syntax enable
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0}
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 6 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  call assert_true(wbx#supports('message-queries-v1'))
  let history = wbx#buffers().history
  let before = wbx#state().messages
  WebexCompose
  call feedkeys("iNormal draft retained\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let normal_draft = bufnr('%') | let normal_undo = undotree()
  execute 'buffer ' . history
  call cursor(b:wbx_message_blocks[0].body, 1)
  let root = b:wbx_message_blocks[0].id
  call feedkeys("\\WvH", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "remote-thread" && exists("b:wbx_query_snapshot")')
  let thread = bufnr('%')
  call assert_match('REMOTE thread', getline(1))
  call assert_match('API query exhausted.*not atomic', getline(2))
  call assert_equal(root, b:wbx_query_snapshot.rootId)
  call assert_equal(before, wbx#state().messages)
  call assert_false(wbx#view#owned(thread,'history'),'queried presentation cannot grant main-history authority')
  call assert_false(empty(b:wbx_message_blocks))
  call assert_true(exists('b:wbx_history_syntax_rows'),'remote thread reuses presentation-only syntax boundaries')
  call assert_equal('expr',&l:foldmethod)
  let thread_head = b:wbx_message_blocks[0].start
  call cursor(thread_head,1)
  normal! zc
  call assert_equal(thread_head,foldclosed(thread_head),'queried threads support ordinary native folds')
  let before_revision = b:wbx_query_snapshot.revision
  WebexQueryRefresh
  call s:wait('wbx#queries#current() && b:wbx_query_snapshot.revision > ' . before_revision)
  call assert_equal(thread_head,foldclosed(thread_head),'explicit query refresh preserves presentation folds')
  normal! zR
  WebexReply
  stopinsert
  call assert_equal(root, b:wbx_parent)
  let reply = bufnr('%')
  call feedkeys("iRetained fetched-thread reply\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let reply_undo = undotree()
  call win_gotoid(win_findbuf(thread)[0])
  call feedkeys("\\WaR", 'xt')
  stopinsert
  call assert_equal(reply, bufnr('%'), 'query reply reuses the existing exact-root draft owner')
  call assert_equal(reply_undo, undotree())
  call assert_equal(['Retained fetched-thread reply'], getline(1, '$'))
  call win_gotoid(win_findbuf(thread)[0])
  let observation = b:wbx_query_snapshot.observedAt
  let b:wbx_query_snapshot.observedAt -= 180001
  call assert_false(wbx#queries#current())
  call feedkeys("\\WaR", 'xt')
  call assert_equal(thread, bufnr('%'), 'expired queried views never fall back to main-history reply authority')
  WebexReply
  call assert_equal(thread, bufnr('%'))
  let b:wbx_query_snapshot.observedAt = observation
  call feedkeys("\\WaR", 'xt')
  stopinsert
  call assert_equal(reply, bufnr('%'))
  WebexCancelReply
  call assert_equal(normal_draft, bufnr('%'))
  call assert_equal(normal_undo, undotree(), 'query navigation/reply never changes normal draft undo')
  call feedkeys("\\Wvi", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "mentions" && exists("b:wbx_query_snapshot")')
  let mentions = bufnr('%')
  call assert_match('SELECTED SPACE.*@me', getline(1))
  call assert_match('@all coverage unverified', getline(3))
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal(mentions, bufnr('%'), 'heading is not a message row')
  call cursor(5, 1)
  execute "normal \<CR>"
  call assert_equal('query-message', b:wbx_list_kind)
  call assert_match('Synthetic @me query result', join(getline(1, '$'), ' '))
  let detail = bufnr('%')
  WebexQueryJump
  call assert_equal(detail, bufnr('%'), 'unloaded result cannot fetch/select/nearest-jump silently')
  WebexQueryReply
  call assert_equal(detail, bufnr('%'), 'mentions do not authorize an arbitrary-root reply')
  set lines=16 columns=46
  redraw!
  set lines=60 columns=160
  normal q
  call assert_equal(mentions, bufnr('%'))
  normal q
  call assert_equal(normal_draft, bufnr('%'))
  call assert_equal(normal_undo, undotree())
  call assert_equal(before, wbx#state().messages, 'queries never seed main history or create local/incoming messages')
  call assert_equal(['Retained fetched-thread reply'], getbufline(reply, 1, '$'))
  call win_gotoid(win_findbuf(thread)[0])
  WebexQueryReply
  stopinsert
  WebexSend
  call s:wait('getbufline(' . reply . ', 1, "$") ==# [""]')
  call assert_equal(root, wbx#state().messages[-1].parentId, 'only explicit Send posts through the existing exact-root backend/ACK path')
  call assert_equal('Retained fetched-thread reply', wbx#state().messages[-1].text)
  call assert_equal(['Normal draft retained'], getbufline(normal_draft, 1, '$'))
  call win_gotoid(win_findbuf(thread)[0])
  setlocal modifiable
  call setline(1, 'Retained fetched-thread annotation')
  call feedkeys("i\<Esc>", 'xt')
  let annotated = [getline(1, '$'), undotree()]
  call feedkeys("\\WaR", 'xt')
  WebexReply
  call assert_equal(thread, bufnr('%'), 'edited queries cannot fall back to loaded-history reply authority')
  call assert_equal(annotated, [getline(1, '$'), undotree()])
  call wbx#select('demo-engineering')
  call s:wait('get(wbx#state(), "ready", 0) && wbx#state().room.id ==# "demo-engineering"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0) && wbx#state().room.id ==# "demo-general"')
  execute 'buffer ' . mentions
  call assert_false(wbx#queries#current(), 'away-and-return invalidates selection-bound results')
  WebexMentions
  call s:wait('wbx#queries#current()')
  setlocal modifiable
  call setline(1, 'Retained mentions annotation')
  let tree = undotree()
  normal r
  normal q
  call assert_equal('Retained mentions annotation', getline(1))
  call assert_equal(tree, undotree())
  setlocal buftype=
  WebexMentions
  call assert_equal('', &buftype)
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
