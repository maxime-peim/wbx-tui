" MF23 expected-red finite lock negotiation, intent fences and outcome validation.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'mark_read_on_open': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! LockConfirm(text) abort
  let race = g:lock_race | let g:lock_race = ''
  if race ==# 'text' | call setline(1, 'Changed during moderation consent')
  elseif race ==# 'draft' | let b:wbx_draft_id = 'another-draft'
  elseif race ==# 'format' | let b:wbx_format = 'markdown'
  elseif race ==# 'root' | let b:wbx_parent = 'another-root'
  elseif race ==# 'destination' | let b:wbx_room = 'another-room'
  elseif race ==# 'file' | let b:wbx_staged_upload = {'attachmentId': repeat('a', 32), 'name': 'Different', 'bytes': 1}
  elseif race ==# 'promote' | setlocal buftype=
  elseif race ==# 'window'
    let window = win_getid() | wincmd w | call win_gotoid(window)
  elseif index(['title', 'session'], race) >= 0
    let changed = deepcopy(g:lock_hello) | let changed.state.revision = wbx#state().revision + 1
    if race ==# 'title' | let changed.state.room.title = 'Changed during consent'
    else | let changed.state.localContext.sessionId = repeat('b', 32) | endif
    call call(g:LockHello, [{'result': changed}])
  endif
  return 1
endfunction
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn LockConfirm(a:text)\nendfunction"
let g:lock_race = ''
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'room-members-v1', 'local-context-v1'],
        \ 'spaceActions': ['rename-v1'], 'spaceDescriptions': ['replace-v1']}
  call assert_true(wbx#protocol#hello(hello), 'old rename/description assertions remain strict and compatible')
  for invalid in ['lock-unlock-v1', v:true, {}, ['toggle-v1'], ['lock-unlock-v1', 'lock-unlock-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'spaceLocks': invalid})))
  endfor
  let supported = extend(deepcopy(hello), {'spaceLocks': ['lock-unlock-v1']})
  call assert_true(wbx#protocol#hello(supported))
  let missing = deepcopy(supported) | call remove(missing.capabilities, index(missing.capabilities, 'room-members-v1'))
  call assert_false(wbx#protocol#hello(missing))
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  let g:LockHello = Hello | let g:lock_hello = deepcopy(supported)
  call call(Hello, [{'result': hello}])
  call assert_true(wbx#supports_space('rename-v1')) | call assert_true(wbx#supports_description('replace-v1'))
  call assert_false(wbx#supports_lock('lock-unlock-v1'), 'rename/description support is not moderation support')
  call assert_false(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexLockSpace"')[0].available)
  call call(Hello, [{'result': supported}])
  call assert_true(wbx#supports_lock('lock-unlock-v1'))
  call setline(1, 'Retained unsent native work')
  let before = deepcopy(wbx#state()) | let draft = wbx#drafts#draft_id(bufnr('%'))
  for race in ['text', 'draft', 'format', 'root', 'destination', 'file', 'promote', 'window', 'title', 'session']
    call feedkeys("i\<Esc>", 'xt')
    let tree = undotree() | let g:lock_race = race
    WebexLockSpace
    call assert_false(wbx#conversations#pending(), race . ' invalidates exact moderation consent')
    if race !=# 'text' | call assert_equal(tree, undotree()) | endif
    call assert_equal(race ==# 'title' ? 'Changed during consent' : before.room.title, wbx#state().room.title)
    setlocal buftype=nofile
    let b:wbx_draft_id = draft | let b:wbx_format = 'plain' | let b:wbx_parent = ''
    let b:wbx_room = before.room.id | let b:wbx_staged_upload = {}
    let supported.state.revision = wbx#state().revision + 1
    call call(Hello, [{'result': supported}])
    call setline(1, 'Retained unsent native work')
  endfor
  let source = bufnr('%')
  new wbx://compose/another-room
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'another-room' | let b:wbx_parent = ''
  call assert_true(wbx#view#owned(bufnr('%'), 'compose'))
  WebexUnlockSpace
  call assert_false(wbx#conversations#pending(), 'unrelated owned draft cannot authorize moderation')
  execute 'buffer ' . source
  let value = {'requestId': 'one', 'action': 'lock', 'status': 'conflict', 'notice': 'Precondition changed',
        \ 'roomId': before.room.id, 'expectedTitle': before.room.title, 'expectedLocked': v:false, 'locked': v:true}
  call assert_true(wbx#protocol#conversation(value))
  for patch in [{'locked': v:false}, {'locked': 'true'}, {'expectedLocked': 0}, {'action': 'create'},
        \ {'title': 'Not a new title'}, {'isModerator': v:true}, {'expectedTitle': ''}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(value), patch)))
  endfor
  call wbx#shutdown()
  call assert_false(wbx#supports_lock('lock-unlock-v1'), 'disconnect cannot retain moderation authority')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
