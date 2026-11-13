" MF22 contract-first actual-demo API flag view, not a Hide/Favorites/mute feature.
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
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-alex')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let root = wbx#state().messages[0].id
  call wbx#drafts#reply(wbx#state().room.id, root)
  call wbx#compose()
  call feedkeys("iRetained direct draft | not preference consent\<Esc>", 'xt')
  WebexFormat markdown
  let path = $WBX_EDITOR_RESULT . '.visibility.bin'
  call writefile(['Immutable staged direct-reply file'], path, 'b')
  call wbx#uploads#stage(path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  call feedkeys("i\<Esc>", 'xt')
  let draft = bufnr('%') | let tree = undotree() | let body = getline(1, '$') | let dest = b:wbx_room
  let file = wbx#drafts#upload(draft) | let draft_id = wbx#drafts#draft_id(draft)
  let before = deepcopy(wbx#state()) | let color = execute('highlight Normal')
  let remove = maparg('\Wnr', 'n') | let notify = deepcopy(wbx#notifications#status())
  call assert_equal(2, exists(':WebexDirectVisibility'), 'separate named read-only command, never WebexHideSpace')
  WebexDirectVisibility
  call s:wait('get(b:, "wbx_list_kind", "") ==# "direct-visibility" && exists("b:wbx_member_visibility_snapshot")')
  call assert_true(wbx#members#visibility_current())
  call assert_equal('demo-alex', b:wbx_member_visibility_snapshot.roomId)
  call assert_equal(v:null, b:wbx_member_visibility_snapshot.isRoomHidden)
  let text = join(getline(1, '$'), ' ')
  call assert_match('API.*flag\|flag.*API', text)
  call assert_match('Not provided', text)
  call assert_match('not.*mute\|mute.*not', tolower(text))
  call assert_match('not.*favorites\|favorites.*not', tolower(text))
  call assert_equal('', maparg('<CR>', 'n')) | call assert_equal('', maparg(']p', 'n'))
  call assert_match('WebexDirectVisibilityRefresh', maparg('r', 'n'))
  call assert_equal(before, wbx#state()) | call assert_equal(notify, wbx#notifications#status())
  silent! write
  call assert_equal(before, wbx#state(), 'write never mutates preferences, sends or issues receipts')
  normal q
  call assert_equal(draft, bufnr('%')) | call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_equal(dest, b:wbx_room) | call assert_equal(color, execute('highlight Normal'))
  call assert_equal(root, b:wbx_parent) | call assert_equal('markdown', b:wbx_format)
  call assert_equal(file, wbx#drafts#upload(draft)) | call assert_equal(draft_id, wbx#drafts#draft_id(draft))
  call assert_equal(remove, maparg('\Wnr', 'n'))
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'room-members-v1', 'local-context-v1']}
  let supported = extend(deepcopy(hello), {'membershipVisibility': ['own-direct-v1']})
  call assert_true(wbx#protocol#hello(supported))
  call assert_true(wbx#protocol#hello(extend(deepcopy(hello), {'membershipVisibility': []})))
  for required in ['conversations-v1', 'room-members-v1', 'local-context-v1']
    let missing = deepcopy(supported) | call remove(missing.capabilities, index(missing.capabilities, required))
    call assert_false(wbx#protocol#hello(missing))
  endfor
  for bad in ['own-direct-v1', v:true, {}, ['write-v1'], ['own-direct-v1', 'own-direct-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'membershipVisibility': bad})))
  endfor
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let Hello = function('<SNR>' . sid . '_hello')
  call call(Hello, [{'result': hello}])
  call assert_false(wbx#supports_member_visibility('own-direct-v1'), 'roster support alone never implies personal-flag observation')
  call call(Hello, [{'result': supported}])
  WebexDirectVisibility
  call s:wait('get(b:, "wbx_list_kind", "") ==# "direct-visibility"')
  setlocal modifiable
  call setline(1, 'Private visibility notes | let g:visibility_pwned=1')
  call feedkeys("i\<Esc>", 'xt')
  let lines = getline(1, '$') | let tree = undotree()
  WebexDirectVisibilityRefresh
  normal q
  call assert_equal(lines, getline(1, '$')) | call assert_equal(tree, undotree())
  setlocal buftype=
  WebexDirectVisibility
  call assert_equal('', &buftype) | call assert_equal(tree, undotree())
  call assert_false(exists('g:visibility_pwned'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup() | call wbx#lists#setup()
  call assert_equal('', maparg('\Wnr', 'n')) | call assert_equal('', maparg('r', 'n'))
  call assert_equal(2, exists(':WebexDirectVisibility')) | call assert_equal(2, exists(':WebexRemoveMember'))
  for name in ['WebexHideSpace', 'WebexFavoriteSpace', 'WebexMuteSpace', 'WebexPromoteModerator']
    call assert_equal(0, exists(':' . name))
  endfor
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_member_visibility('own-direct-v1'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
