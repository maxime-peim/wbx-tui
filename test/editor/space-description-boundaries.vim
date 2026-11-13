" MF23 expected-red description negotiation and native submit-consent fences.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'mark_read_on_open': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! DescriptionConfirm(text) abort
  let race = g:description_race | let g:description_race = ''
  if race ==# 'text' | call setline(1, 'Changed during consent')
  elseif race ==# 'format' | let b:wbx_format = 'markdown'
  elseif race ==# 'root' | let b:wbx_parent = 'unrelated-root'
  elseif race ==# 'file' | let b:wbx_staged_upload = {'attachmentId': repeat('a', 32), 'name': 'Not a metadata file', 'bytes': 1}
  elseif race ==# 'snapshot' | let b:wbx_space_description.expectedDescription = 'Different preimage'
  elseif race ==# 'age' | let g:description_now = b:wbx_space_description.observedAt + 120000
  elseif race ==# 'promote' | setlocal buftype=
  elseif race ==# 'window'
    let window = win_getid() | wincmd w | call win_gotoid(window)
  endif
  return 1
endfunction
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn DescriptionConfirm(a:text)\nendfunction"
execute 'function! <SNR>' . s:sid . "_description_now() abort\nreturn get(g:, 'description_now', localtime() * 1000)\nendfunction"
let g:description_race = ''
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'room-members-v1', 'local-context-v1'], 'spaceActions': ['rename-v1']}
  call assert_true(wbx#protocol#hello(hello), 'rename negotiation remains compatible')
  for invalid in ['replace-v1', {}, v:true, ['clear-v1'], ['replace-v1', 'replace-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'spaceDescriptions': invalid})))
  endfor
  let supported = extend(deepcopy(hello), {'spaceDescriptions': ['replace-v1']})
  call assert_true(wbx#protocol#hello(supported))
  let missing = deepcopy(supported) | call remove(missing.capabilities, index(missing.capabilities, 'room-members-v1'))
  call assert_false(wbx#protocol#hello(missing))
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  call call(Hello, [{'result': hello}])
  call assert_true(wbx#supports_space('rename-v1'))
  call assert_false(wbx#supports_description('replace-v1'), 'rename support is not description support')
  call assert_false(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexDescribeSpace"')[0].available)
  call call(Hello, [{'result': supported}])
  call assert_true(wbx#supports_description('replace-v1'))
  WebexDescribeSpace
  call s:wait('exists("b:wbx_space_description")')
  let snapshot = deepcopy(b:wbx_space_description) | let before = deepcopy(wbx#state())
  call assert_true(wbx#protocol#space_description(snapshot))
  let unsafe = deepcopy(snapshot) | call remove(unsafe, 'expectedDescription')
  call assert_false(wbx#protocol#space_description(unsafe), 'missing does not mean empty')
  for race in ['text', 'format', 'root', 'file', 'snapshot', 'age', 'promote', 'window']
    call setline(1, 'Exact intended replacement')
    call feedkeys("i\<Esc>", 'xt')
    let tree = undotree() | let g:description_race = race
    WebexDescriptionSubmit
    call assert_false(wbx#conversations#pending(), race . ' cancels consent, without queuing a PUT')
    call assert_equal(before.room, wbx#state().room)
    if race !=# 'text' | call assert_equal(tree, undotree()) | endif
    setlocal buftype=nofile
    let b:wbx_format = 'plain' | let b:wbx_space_description = deepcopy(snapshot)
    let b:wbx_parent = '' | let b:wbx_staged_upload = {}
    unlet! g:description_now
  endfor
  for invalid in ['', ' ', repeat('x', 1001), 'bad' . nr2char(13) . 'line', nr2char(0x202e) . 'unsafe']
    call setline(1, invalid)
    if line('$') > 1 | call deletebufline(bufnr('%'), 2, '$') | endif
    let tree = undotree()
    WebexDescriptionSubmit
    call assert_false(wbx#conversations#pending(), 'blank/clear/control/oversized metadata cannot be submitted')
    call assert_equal(tree, undotree())
  endfor
  let value = {'requestId': 'one', 'action': 'describe', 'status': 'conflict', 'notice': 'Preimage changed',
        \ 'roomId': snapshot.roomId, 'expectedTitle': snapshot.expectedTitle,
        \ 'expectedDescription': snapshot.expectedDescription, 'description': 'Requested update'}
  call assert_true(wbx#protocol#conversation(value))
  for patch in [{'action': 'create'}, {'description': ' '}, {'expectedDescription': v:null}, {'title': 'Not an allowed new title'}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(value), patch)))
  endfor
  setlocal buftype=
  let tree = undotree() | let body = getline(1, '$')
  WebexDescriptionSubmit
  call assert_false(wbx#conversations#pending())
  call assert_equal(tree, undotree()) | call assert_equal(body, getline(1, '$'))
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_description('replace-v1'), 'transport/session loss cannot retain authority')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
