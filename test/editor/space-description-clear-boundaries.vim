" MF23 contract-first clear negotiation/preparation/consent assertions, now exercised offline.
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
function! ClearConfirm(text) abort
  let race = g:clear_race | let g:clear_race = ''
  if race ==# 'text' | call setline(1, 'Changed during clear consent')
  elseif race ==# 'format' | let b:wbx_format = 'markdown'
  elseif race ==# 'root' | let b:wbx_parent = 'another-root'
  elseif race ==# 'file' | let b:wbx_staged_upload = {'attachmentId': repeat('a', 32), 'name': 'Different', 'bytes': 1}
  elseif race ==# 'destination' | let b:wbx_room = 'other-room'
  elseif race ==# 'draft' | let b:wbx_draft_id = 'other-draft'
  elseif race ==# 'target' | let b:wbx_upload_target = {'roomId': 'other-room'}
  elseif race ==# 'snapshot' | let b:wbx_space_description.expectedDescription = 'Forged preimage'
  elseif race ==# 'age' | let g:clear_now = b:wbx_space_description.observedAt + 120000
  elseif race ==# 'promote' | setlocal buftype=
  elseif race ==# 'window'
    let window = win_getid() | wincmd w | call win_gotoid(window)
  elseif race ==# 'session'
    let changed = deepcopy(g:clear_hello) | let changed.state.revision = wbx#state().revision + 1
    let changed.state.localContext.sessionId = repeat('b', 32)
    call call(g:ClearHello, [{'result': changed}])
  endif
  return 1
endfunction
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn ClearConfirm(a:text)\nendfunction"
execute 'function! <SNR>' . s:sid . "_description_now() abort\nreturn get(g:, 'clear_now', localtime() * 1000)\nendfunction"
let g:clear_race = ''
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  " Exercise real session disconnect before synthetic hello revisions are injected.
  call assert_true(wbx#supports_description_clear('single-space-v1'))
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_description_clear('single-space-v1'))
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'room-members-v1', 'local-context-v1'],
        \ 'spaceActions': ['rename-v1'], 'spaceDescriptions': ['replace-v1'],
        \ 'spaceLocks': ['lock-unlock-v1'], 'spaceAnnouncements': ['enable-disable-v1']}
  call assert_true(wbx#protocol#hello(hello))
  for invalid in ['single-space-v1', v:true, {}, ['clear-v1'], ['single-space-v1', 'single-space-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'spaceDescriptionClears': invalid})))
  endfor
  let supported = extend(deepcopy(hello), {'spaceDescriptionClears': ['single-space-v1']})
  call assert_true(wbx#protocol#hello(supported))
  let missing = deepcopy(supported) | call remove(missing, 'spaceDescriptions')
  call assert_false(wbx#protocol#hello(missing), 'clear workflow needs existing negotiated description preparation')
  let missing = deepcopy(supported) | call remove(missing.capabilities, index(missing.capabilities, 'room-members-v1'))
  call assert_false(wbx#protocol#hello(missing))
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  let g:ClearHello = Hello | let g:clear_hello = deepcopy(supported)
  call call(Hello, [{'result': hello}])
  call assert_true(wbx#supports_description('replace-v1'))
  call assert_false(wbx#supports_description_clear('single-space-v1'), 'replacement never implies clearing')
  call call(Hello, [{'result': supported}])
  call assert_true(wbx#supports_description_clear('single-space-v1'))
  let normal = bufnr('%') | let before = deepcopy(wbx#state())
  for race in ['text', 'format', 'root', 'file', 'destination', 'draft', 'target', 'snapshot', 'age', 'promote', 'window', 'session']
    execute 'buffer ' . normal
    WebexDescribeSpace
    call s:wait('exists("b:wbx_space_description") && !wbx#conversations#pending()')
    call feedkeys("i\<Esc>", 'xt')
    let snapshot = deepcopy(b:wbx_space_description) | let tree = undotree() | let g:clear_race = race
    WebexDescriptionClear
    call assert_false(wbx#conversations#pending(), race . ' invalidates clear consent before sentinel admission')
    if race !=# 'session' | call assert_equal(before, wbx#state()) | endif
    if race !=# 'text' | call assert_equal(tree, undotree()) | endif
    setlocal buftype=nofile
    let b:wbx_format = 'plain' | let b:wbx_parent = '' | let b:wbx_staged_upload = {}
    unlet! b:wbx_room b:wbx_draft_id b:wbx_upload_target
    let b:wbx_space_description = deepcopy(snapshot)
    unlet! g:clear_now
    WebexDescriptionCancel
  endfor
  let value = {'requestId': 'one', 'action': 'description-clear', 'status': 'conflict', 'notice': 'Preimage changed',
        \ 'roomId': before.room.id, 'expectedTitle': before.room.title, 'expectedDescription': 'Nonblank preimage'}
  call assert_true(wbx#protocol#conversation(value))
  for patch in [{'expectedDescription': ''}, {'expectedDescription': ' '}, {'expectedDescription': v:null},
        \ {'description': ' '}, {'description': ''}, {'title': 'New title'}, {'action': 'create'}, {'locked': v:true}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(value), patch)))
  endfor
  " Transport loss resets support regardless of the synthetic session/revision above.
  call wbx#shutdown()
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_description_clear('single-space-v1'), 'disconnect revokes clear negotiation/preparation')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
