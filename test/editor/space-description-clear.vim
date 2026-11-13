" MF23 contract-first separate clear assertions, now exercised offline.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'mark_read_on_open': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
let g:clear_accept = 0 | let g:clear_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:clear_prompts, a:text)\nreturn g:clear_accept\nendfunction"
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let root = wbx#state().messages[0].id
  call wbx#drafts#reply(wbx#state().room.id, root)
  call wbx#compose()
  call feedkeys("iRetained reply and file\<Esc>", 'xt')
  WebexFormat markdown
  let path = $WBX_EDITOR_RESULT . '.clear.bin'
  call writefile(['Immutable staged file'], path, 'b')
  call wbx#uploads#stage(path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  call feedkeys("i\<Esc>", 'xt')
  let normal = bufnr('%') | let normal_tree = undotree() | let file = wbx#drafts#upload(normal)
  let draft = wbx#drafts#draft_id(normal) | let before = deepcopy(wbx#state())
  let color = execute('highlight Normal') | let remove_key = maparg('\Wnr', 'n')
  call assert_equal(2, exists(':WebexDescriptionClear'), 'clear must be a separate named-only action')
  WebexDescriptionClear
  call assert_false(wbx#conversations#pending())
  call assert_equal([], g:clear_prompts, 'selected-space composer alone is not a private clear preparation')
  WebexDescribeSpace
  call s:wait('exists("b:wbx_space_description") && !wbx#conversations#pending()')
  let edit = bufnr('%') | let window = win_getid() | let snapshot = deepcopy(b:wbx_space_description)
  let initial = getline(1, '$')
  call feedkeys("A retained unsubmitted description edit\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let edited = getline(1, '$') | let tree = undotree()
  WebexDescriptionClear
  call assert_false(wbx#conversations#pending())
  call assert_equal([], g:clear_prompts, 'clear cannot discard newer edited text by treating it as consent to the old preimage')
  call assert_equal(edited, getline(1, '$')) | call assert_equal(tree, undotree())
  normal! u
  call assert_equal(initial, getline(1, '$'))
  let tree = undotree()
  WebexDescriptionClear
  call assert_false(wbx#conversations#pending(), 'default Cancel sends no sentinel PUT')
  call assert_equal(tree, undotree()) | call assert_equal(initial, getline(1, '$'))
  let g:clear_accept = 1
  WebexDescriptionClear
  call s:wait('!wbx#conversations#pending() && get(b:, "wbx_space_description_status", "") ==# "changed"')
  call assert_equal(edit, bufnr('%')) | call assert_equal(window, win_getid())
  call assert_equal(initial, getline(1, '$'), 'clear ACK retires preparation but never clears native text or writes the sentinel')
  call assert_equal(tree, undotree()) | call assert_equal(before, wbx#state())
  call assert_match(snapshot.roomId, g:clear_prompts[-1]) | call assert_match(snapshot.expectedTitle, g:clear_prompts[-1])
  call assert_match('remove\|clear', tolower(g:clear_prompts[-1]))
  call assert_match('description', tolower(g:clear_prompts[-1]))
  call assert_match('title', tolower(g:clear_prompts[-1]))
  call assert_match('race\|concurrent\|atomic', tolower(g:clear_prompts[-1]))
  let prompts = len(g:clear_prompts)
  WebexDescriptionClear
  silent! write
  call assert_equal(prompts, len(g:clear_prompts), 'completed preparation/write cannot clear again')
  execute 'buffer ' . normal
  call assert_equal(['Retained reply and file'], getline(1, '$')) | call assert_equal(normal_tree, undotree())
  call assert_equal(file, wbx#drafts#upload(normal)) | call assert_equal(root, b:wbx_parent)
  call assert_equal('markdown', b:wbx_format) | call assert_equal(draft, wbx#drafts#draft_id(normal))
  WebexDescribeSpace
  call s:wait('exists("b:wbx_space_description") && !wbx#conversations#pending()')
  call assert_equal('', b:wbx_space_description.expectedDescription, 'explicit synthetic empty is not an echoed sentinel')
  call assert_false(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexDescriptionClear"')[0].available)
  WebexDescriptionClear
  call assert_equal(prompts, len(g:clear_prompts), 'empty preimages are not destructive clear intents')
  let body = getline(1, '$') | let tree = undotree()
  WebexDescriptionCancel
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  new wbx://space-description/forged
  setlocal buftype=nofile
  let b:wbx_space_description = deepcopy(snapshot) | let b:wbx_space_description_stale = 0
  call setline(1, split(snapshot.expectedDescription, "\n", 1))
  call feedkeys("i\<Esc>", 'xt')
  let tree = undotree()
  call assert_false(wbx#conversations#is_description(bufnr('%')), 'mutable buffer variables never create private preparation ownership')
  WebexDescriptionClear
  call assert_false(wbx#conversations#pending()) | call assert_equal(prompts, len(g:clear_prompts))
  call assert_equal(tree, undotree())
  call assert_equal(color, execute('highlight Normal')) | call assert_equal(remove_key, maparg('\Wnr', 'n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n')) | call assert_equal(2, exists(':WebexDescriptionClear'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
