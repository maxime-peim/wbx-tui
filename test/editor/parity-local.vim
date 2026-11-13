" Session-bound local productivity: real demo, actual native keys, no services.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
syntax enable
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0, 'send_with_ctrl_s':0}
let g:maplocalleader = ';'
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
  call assert_true(wbx#supports('local-context-v1'))
  let original_count = len(wbx#state().messages)
  let session = wbx#state().localContext.sessionId
  let history = wbx#buffers().history
  execute 'buffer ' . history
  let source = b:wbx_message_blocks[0].id
  let history_a = win_getid()
  let view_a = winsaveview()
  tabnew
  let tab_b = tabpagenr()
  call assert_true(wbx#view#jump('demo-general',source))
  call assert_equal(tab_b,tabpagenr(),'local source jump creates a history split in the current tab')
  call assert_notequal(history_a,win_getid())
  call assert_equal(view_a,json_decode(trim(win_execute(history_a,'echo json_encode(winsaveview())'))),'other tab reading position remains independent')
  call win_gotoid(history_a)
  tabonly
  call cursor(b:wbx_message_blocks[0].body, 1)
  call feedkeys("\\Wab", 'xt')
  call assert_equal(1, wbx#productivity#bookmark_count())
  call feedkeys("\\Wvb", 'xt')
  call assert_equal('bookmarks', b:wbx_list_kind)
  call assert_match('LOCAL.*session', getline(1))
  call cursor(5, 1)
  execute "normal \<CR>"
  call assert_equal(history, bufnr('%'))
  call assert_equal(source, wbx#view#message_at(history, line('.')))
  WebexThread
  call assert_equal('thread', b:wbx_list_kind)
  call assert_match('LOADED.*PARTIAL', getline(1))
  call assert_false(wbx#view#owned(bufnr('%'),'history'),'thread presentation never gains authoritative-history ownership')
  call assert_false(empty(b:wbx_message_blocks),'loaded thread retains presentation-only message boundaries')
  call assert_equal('wbx-history',get(b:,'current_syntax',''))
  call assert_true(exists('b:wbx_history_syntax_rows'),'thread Markdown syntax is bounded by message metadata')
  call assert_equal('expr',&l:foldmethod)
  let thread_head = b:wbx_message_blocks[0].start
  call cursor(thread_head,1)
  normal! zc
  call assert_equal(thread_head,foldclosed(thread_head))
  call assert_match('UTC',getline(thread_head))
  let folded = foldclosed(thread_head)
  call wbx#productivity#refresh()
  call assert_equal(folded,foldclosed(b:wbx_message_blocks[0].start),'explicit local refresh preserves thread folds')
  normal! zR
  set lines=12 columns=46
  redraw!
  set lines=60 columns=160
  normal q
  call assert_equal(history, bufnr('%'))
  WebexQuote
  WebexCompose
  call feedkeys("iRetained draft\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  nnoremap <buffer> \WS <Nop>
  let native = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  let send_entry = filter(wbx#commands#catalogue(),'v:val.command ==# "WebexSend"')[0]
  call assert_equal([],send_entry.bindings,'shadowed global Send is not advertised')
  call assert_equal([{'lhs':';s','mode':'n'}],send_entry.localBindings,'effective aliases use the installed localleader and respect Ctrl-S opt-out')
  WebexActions context
  call assert_match(';s \[buffer n\].*:WebexSend',join(getline(1,'$'),"\n"))
  call assert_match('Preserved mapping conflict:.*WS',join(getline(1,'$'),"\n"))
  normal q
  call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree()],'contextual key inspection preserves native draft and undo')
  nunmap <buffer> \WS
  let before = getline(1, '$')
  let destination = [b:wbx_room, b:wbx_parent]
  call feedkeys("\\Wai", 'xt')
  call assert_match('Copied text', join(getline(1, '$'), "\n"))
  call assert_equal(before, getline(1, len(before)))
  call assert_equal(destination, [b:wbx_room, b:wbx_parent])
  call assert_equal('plain', get(b:, 'wbx_format', 'plain'))
  call assert_equal(1, len(b:wbx_quote_sources))
  call assert_true(wbx#productivity#draft_valid(bufnr('%'), wbx#state()))
  normal! u
  call assert_equal(before, getline(1, '$'), 'one native undo removes only the insertion')
  normal! u
  call assert_equal([''], getline(1, '$'), 'prior native typing remains independently undoable')
  execute "normal! \<C-r>"
  WebexQuoteInsert
  let composer = bufnr('%')
  let draft = getline(1, '$')
  WebexContent links
  call assert_equal('content', b:wbx_list_kind)
  call assert_match('LOADED.*links', getline(1))
  call assert_match('no fetching', join(getline(1, 4), ' '))
  normal q
  call assert_equal(composer, bufnr('%'))
  call assert_equal(draft, getline(1, '$'))
  execute 'buffer ' . history
  call cursor(get(b:wbx_message_blocks[0], 'body'), 1)
  WebexBookmarks
  setlocal modifiable
  call setline(1, 'My bookmark annotation')
  let tree = undotree()
  normal r
  normal q
  call assert_equal('My bookmark annotation', getline(1))
  call assert_equal(tree, undotree())
  setlocal buftype=
  WebexBookmarks
  call assert_equal('', &buftype)
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  execute 'buffer ' . composer
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wab', 'n'))
  call assert_equal('', maparg('\Wai', 'n'))
  call assert_true(exists(':WebexQuoteInsert') == 2)
  call assert_equal(original_count, len(wbx#state().messages), 'local views/quote insertion never post')
  WebexSend
  call s:wait('getbufline(' . composer . ', 1, "$") ==# [""]')
  call assert_equal([], getbufvar(composer, 'wbx_quote_sources'), 'only matching successful delivery clears source guards with the unchanged draft')
  call assert_equal(original_count + 1, len(wbx#state().messages))
  execute 'buffer ' . history
  call cursor(b:wbx_message_blocks[0].body, 1)
  WebexQuote
  WebexCompose
  call feedkeys("iRetained after confirmed ACK\<Esc>", 'xt')
  WebexQuoteInsert
  let draft = getline(1, '$')
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_equal(0, wbx#productivity#bookmark_count())
  call assert_false(wbx#productivity#draft_valid(composer, wbx#state()), 'retained quotation cannot gain a new account/session')
  call assert_equal(draft, getbufline(composer, 1, '$'))
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call assert_notequal(session, wbx#state().localContext.sessionId)
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
