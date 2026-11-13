" MF23 finite support and native prompt-race boundaries, retained from red.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! RenameConfirm(text) abort
  let race = g:rename_race | let g:rename_race = ''
  if race ==# 'text' | call setline(1, 'Changed during rename consent')
  elseif race ==# 'format' | let b:wbx_format = 'markdown'
  elseif race ==# 'root' | let b:wbx_parent = 'different-root'
  elseif race ==# 'draft' | let b:wbx_draft_id = 'different-draft'
  elseif race ==# 'destination' | let b:wbx_room = 'different-room'
  elseif race ==# 'file' | let b:wbx_staged_upload = {'attachmentId': repeat('a', 32), 'name': 'Different snapshot', 'bytes': 1}
  elseif race ==# 'title'
    let changed = deepcopy(g:rename_hello) | let changed.state.room.title = 'Changed during consent'
    let changed.state.revision = wbx#state().revision + 1
    call call(g:RenameHello, [{'result': changed}])
  elseif race ==# 'session'
    let changed = deepcopy(g:rename_hello) | let changed.state.localContext.sessionId = repeat('b', 32)
    let changed.state.revision = wbx#state().revision + 1
    call call(g:RenameHello, [{'result': changed}])
  elseif race ==# 'promote' | setlocal buftype=
  elseif race ==# 'window'
    let window = win_getid()
    wincmd w
    call win_gotoid(window)
  endif
  return 1
endfunction
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn RenameConfirm(a:text)\nendfunction"
let g:rename_race = ''
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'room-members-v1', 'local-context-v1']}
  call assert_true(wbx#protocol#hello(hello))
  for invalid in ['rename-v1', v:true, {}, ['settings-v1'], ['rename-v1', 'rename-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'spaceActions': invalid})))
  endfor
  let supported = extend(deepcopy(hello), {'spaceActions': ['rename-v1']})
  call assert_true(wbx#protocol#hello(supported))
  let missing = deepcopy(supported) | call remove(missing.capabilities, index(missing.capabilities, 'room-members-v1'))
  call assert_false(wbx#protocol#hello(missing))
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  let g:RenameHello = Hello | let g:rename_hello = deepcopy(supported)
  call call(Hello, [{'result': hello}])
  call assert_false(wbx#supports_space('rename-v1'), 'old create/member capabilities do not enable settings')
  call assert_false(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexRenameSpace"')[0].available)
  call call(Hello, [{'result': supported}])
  call assert_true(wbx#supports_space('rename-v1'))
  call setline(1, 'Retained unsent native work')
  let draft = wbx#drafts#draft_id(bufnr('%')) | let before = deepcopy(wbx#state())
  for race in ['text', 'format', 'root', 'draft', 'destination', 'file', 'promote', 'window', 'title', 'session']
    call feedkeys("i\<Esc>", 'xt')
    let tree = undotree() | let g:rename_race = race
    WebexRenameSpace Must not be admitted
    call assert_false(wbx#conversations#pending(), race . ' invalidates the captured rename intent')
    call assert_equal(race ==# 'title' ? 'Changed during consent' : before.room.title, wbx#state().room.title)
    if race !=# 'text' | call assert_equal(tree, undotree()) | endif
    setlocal buftype=nofile
    let b:wbx_format = 'plain' | let b:wbx_parent = '' | let b:wbx_draft_id = draft
    let b:wbx_room = before.room.id
    let b:wbx_staged_upload = {}
    let supported.state.revision = wbx#state().revision + 1
    call call(Hello, [{'result': supported}])
    call setline(1, 'Retained unsent native work')
  endfor
  let original = bufnr('%')
  new wbx://compose/another-room
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'another-room' | let b:wbx_parent = ''
  call assert_true(wbx#view#owned(bufnr('%'), 'compose'))
  WebexRenameSpace Unrelated draft cannot authorize rename
  call assert_false(wbx#conversations#pending())
  call assert_match('selected-space', wbx#conversations#rename_reason())
  execute 'buffer ' . original
  let result = {'requestId': 'rename', 'action': 'rename', 'status': 'conflict', 'notice': 'Changed since consent',
        \ 'roomId': before.room.id, 'expectedTitle': before.room.title, 'title': 'Requested title'}
  call assert_true(wbx#protocol#conversation(result))
  for patch in [{'expectedTitle': ''}, {'title': before.room.title}, {'title': ' padded '}, {'title': repeat('x', 81)},
        \ {'expectedTitle': nr2char(0x200e) . 'unsafe'}, {'title': 'not' . nr2char(0xa0) . 'canonical'}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(result), patch)))
  endfor
  let missing = deepcopy(result) | call remove(missing, 'expectedTitle')
  call assert_false(wbx#protocol#conversation(missing))
  let result.action = 'create'
  call assert_false(wbx#protocol#conversation(result), 'conflict does not change existing create semantics')
  " Synthetic accepted revisions are ahead of the demo; stop the transport
  " rather than mistaking its now-older idle projection for a newer event.
  call wbx#shutdown()
  call assert_false(wbx#supports_space('rename-v1'), 'disconnect clears optional action authority')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
