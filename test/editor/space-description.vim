" MF23 contract-first actual-demo description preparation/editing, expected red.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'mark_read_on_open': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
let g:description_accept = 0 | let g:description_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:description_prompts, a:text)\nreturn g:description_accept\nendfunction"
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  call feedkeys("iRetained ordinary draft\<CR>Native second line\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let normal = bufnr('%') | let normal_tree = undotree() | let normal_text = getline(1, '$')
  let normal_color = execute('highlight Normal')
  let before = deepcopy(wbx#state()) | let remove_key = maparg('\Wnr', 'n')
  call assert_equal(2, exists(':WebexDescribeSpace'), 'description is a named action, not a generic settings command')
  for race in ['text', 'draft', 'file', 'window']
    WebexDescribeSpace
    if race ==# 'text' | call setline(1, 'Newer normal work during metadata read')
    elseif race ==# 'draft'
      let old_draft = get(b:, 'wbx_draft_id', '') | let b:wbx_draft_id = 'different-during-read'
    elseif race ==# 'file' | let b:wbx_staged_upload = {'attachmentId': repeat('a', 32), 'name': 'Different file', 'bytes': 1}
    elseif race ==# 'window'
      let source_window = win_getid() | wincmd w | call win_gotoid(source_window)
    endif
    call s:wait('!wbx#conversations#pending()')
    call assert_equal(normal, bufnr('%'), race . ' changed the read source; a late response must not open/focus an edit')
    call assert_false(exists('b:wbx_space_description'))
    if race ==# 'draft' | let b:wbx_draft_id = old_draft | endif
    if race ==# 'file' | let b:wbx_staged_upload = {} | endif
  endfor
  let normal_text = getline(1, '$') | let normal_tree = undotree()
  WebexDescribeSpace
  call s:wait('exists("b:wbx_space_description")')
  let edit = bufnr('%') | let window = win_getid() | let snapshot = deepcopy(b:wbx_space_description)
  call assert_match('^wbx://space-description/', bufname('%'))
  call assert_equal('nofile', &buftype) | call assert_false(&swapfile) | call assert_false(&undofile)
  call assert_equal(before.room.id, snapshot.roomId) | call assert_equal(before.room.title, snapshot.expectedTitle)
  call assert_equal(snapshot.expectedDescription, join(getline(1, '$'), "\n"))
  call assert_equal(before.messages, wbx#state().messages, 'preparation is not a send/history fetch')
  let initial = getline(1, '$')
  call cursor(1, 1)
  call feedkeys("A | let g:description_executed=1\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let body = getline(1, '$') | let tree = undotree()
  silent! write
  call assert_false(wbx#conversations#pending(), 'write/Enter do not submit metadata')
  WebexDescriptionSubmit
  call assert_false(wbx#conversations#pending(), 'default-Cancel confirmation does not send')
  call assert_equal(tree, undotree())
  let g:description_accept = 1
  WebexDescriptionSubmit
  call s:wait('!wbx#conversations#pending() && get(b:, "wbx_space_description_status", "") ==# "changed"')
  call assert_equal(edit, bufnr('%')) | call assert_equal(window, win_getid())
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree(), 'ACK changes status only, not native text/full undo')
  call assert_false(exists('g:description_executed'))
  call assert_equal(before.room, wbx#state().room, 'description result never republishes title/room flags/activity')
  call assert_equal(before.rooms, wbx#state().rooms) | call assert_equal(before.messages, wbx#state().messages)
  call assert_match(snapshot.roomId, g:description_prompts[-1])
  call assert_match(snapshot.expectedTitle, g:description_prompts[-1])
  call assert_match('title', tolower(g:description_prompts[-1]))
  call assert_match('race\|concurrent\|atomic', tolower(g:description_prompts[-1]))
  normal! u
  call assert_equal(initial, getline(1, '$'), 'native typing remains independently undoable after metadata ACK')
  execute 'buffer ' . normal
  call assert_equal(normal_text, getline(1, '$')) | call assert_equal(normal_tree, undotree())
  WebexDescribeSpace
  call s:wait('bufnr("%") != ' . normal . ' && exists("b:wbx_space_description")')
  call feedkeys("A retained canceled text\<Esc>", 'xt')
  let canceled = getline(1, '$') | let canceled_tree = undotree()
  WebexDescriptionCancel
  WebexDescriptionSubmit
  call assert_false(wbx#conversations#pending())
  call assert_equal(canceled, getline(1, '$')) | call assert_equal(canceled_tree, undotree())
  let active = []
  for i in range(1, 8)
    execute 'buffer ' . normal
    WebexDescribeSpace
    call s:wait('bufnr("%") != ' . normal . ' && exists("b:wbx_space_description") && !wbx#conversations#pending()')
    call add(active, bufnr('%'))
  endfor
  execute 'buffer ' . normal
  WebexDescribeSpace
  call assert_false(wbx#conversations#pending(), 'ninth active preparation is refused before IO')
  call assert_equal(normal, bufnr('%'))
  call assert_false(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexDescribeSpace"')[0].available)
  execute 'buffer ' . active[0]
  let retained = getline(1, '$') | let retained_tree = undotree()
  WebexDescriptionCancel
  call assert_equal(retained, getline(1, '$')) | call assert_equal(retained_tree, undotree())
  execute 'buffer ' . normal
  WebexDescribeSpace
  call s:wait('bufnr("%") != ' . normal . ' && exists("b:wbx_space_description") && !wbx#conversations#pending()')
  call assert_equal(normal_color, execute('highlight Normal'))
  call assert_equal(remove_key, maparg('\Wnr', 'n'), 'existing conversation keys are unchanged')
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n'))
  call assert_equal(2, exists(':WebexDescriptionSubmit'), 'named-only submission survives key opt-out')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
