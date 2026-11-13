" MF23 native demo tests retained from the contract-first red boundary.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
let g:rename_accept = 0 | let g:rename_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:rename_prompts, a:text)\nreturn g:rename_accept\nendfunction"
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
  call feedkeys("iRetained unsent normal draft\<CR>Native second line\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let composer = bufnr('%') | let tree = undotree() | let text = getline(1, '$') | let window = win_getid()
  let before = deepcopy(wbx#state()) | let draft = wbx#drafts#draft_id(composer)
  let normal_color = execute('highlight Normal')
  let remove_key = maparg('\Wnr', 'n')
  call assert_equal(2, exists(':WebexRenameSpace'), 'rename is a named action in the existing catalogue')
  WebexRenameSpace New standalone name
  call assert_false(wbx#conversations#pending(), 'default-Cancel consent does not admit rename')
  call assert_equal(before.room.title, wbx#state().room.title)
  call assert_equal(tree, undotree())
  let g:rename_accept = 1
  call wbx#conversations#action('rename', 'Planning % | literal title')
  call s:wait('!wbx#conversations#pending() && wbx#state().room.title ==# "Planning % | literal title"')
  call assert_equal(before.room.id, wbx#state().room.id)
  call assert_equal(before.messages, wbx#state().messages, 'rename is not a message')
  call assert_equal(before.room.lastActivity, wbx#state().room.lastActivity, 'rename cannot invent activity')
  call assert_equal(composer, bufnr('%')) | call assert_equal(window, win_getid())
  call assert_equal(draft, wbx#drafts#draft_id(composer))
  call assert_equal(text, getline(1, '$')) | call assert_equal(tree, undotree(), 'metadata ACK preserves full native undo')
  call assert_equal(normal_color, execute('highlight Normal'), 'rename cannot replace colorscheme styling')
  call assert_match(before.room.id, g:rename_prompts[-1])
  call assert_match('race\|concurrent\|atomic', tolower(g:rename_prompts[-1]))
  call assert_equal(remove_key, maparg('\Wnr', 'n'), 'Wnr remains Remove Member')
  let action = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexRenameSpace"')[0]
  call assert_true(action.available)
  silent! write
  call assert_equal('Planning % | literal title', wbx#state().room.title, 'write cannot rename or send')
  WebexRenameSpace Literal | let g:mf23_executed=1
  call s:wait('!wbx#conversations#pending() && wbx#state().room.title ==# "Literal | let g:mf23_executed=1"')
  call assert_false(exists('g:mf23_executed'), 'named command treats bars and Ex-looking titles as inert text')
  " Metadata-only publication must preserve annotated history and reply/file work.
  let history = wbx#buffers().history
  execute 'buffer ' . history
  setlocal modifiable
  call append(1, 'Private native history annotation')
  let annotation = getline(1, '$') | let history_tree = undotree()
  WebexRenameSpace Annotated standalone
  call s:wait('!wbx#conversations#pending() && wbx#state().room.title ==# "Annotated standalone"')
  call assert_equal(annotation, getline(1, '$')) | call assert_equal(history_tree, undotree())
  let root = wbx#state().messages[0].id
  call wbx#drafts#reply(wbx#state().room.id, root)
  call wbx#compose()
  call feedkeys("iRetained reply work\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  WebexFormat markdown
  let path = $WBX_EDITOR_RESULT . '.rename.bin'
  call writefile(['Immutable file'], path, 'b')
  call wbx#uploads#stage(path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  let reply = bufnr('%') | let reply_tree = undotree() | let file = wbx#drafts#upload(reply)
  let reply_draft = wbx#drafts#draft_id(reply) | let before_messages = deepcopy(wbx#state().messages)
  WebexRenameSpace Reply preserving rename
  call s:wait('!wbx#conversations#pending() && wbx#state().room.title ==# "Reply preserving rename"')
  call assert_equal(reply, bufnr('%')) | call assert_equal(root, b:wbx_parent)
  call assert_equal(reply_draft, wbx#drafts#draft_id(reply)) | call assert_equal('markdown', b:wbx_format)
  call assert_equal(file, wbx#drafts#upload(reply))
  call assert_equal(['Retained reply work'], getline(1, '$')) | call assert_equal(reply_tree, undotree())
  call assert_equal(before_messages, wbx#state().messages)
  setlocal buftype=
  WebexRenameSpace Promoted work cannot authorize this
  call assert_false(wbx#conversations#pending())
  call assert_equal('Reply preserving rename', wbx#state().room.title)
  call assert_equal(reply_tree, undotree())
  setlocal buftype=nofile
  execute 'buffer ' . composer
  call assert_equal(text, getline(1, '$')) | call assert_equal(tree, undotree())
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n'))
  call assert_equal(2, exists(':WebexRenameSpace'), 'named action survives mapping opt-out')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
