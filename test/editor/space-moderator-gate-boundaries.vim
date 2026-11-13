" Provider NO-GO client boundary: unknown role assertions/ACKs cannot enable mutations.
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
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexMembers
  call s:wait('exists("b:wbx_members_snapshot") && get(b:wbx_members_snapshot, "state", "") ==# "ready"')
  call cursor(4, 1)
  let before = deepcopy(wbx#state()) | let tree = undotree() | let lines = getline(1, '$')
  let b:wbx_members_snapshot.items[0].moderator = v:true
  call assert_false(wbx#supports('space-moderators-v1'), 'forged cached role cannot negotiate an operation')
  call assert_equal(0, exists(':WebexPromoteModerator')) | call assert_equal(0, exists(':WebexDemoteModerator'))
  let base = {'requestId': 'one', 'status': 'changed', 'notice': 'Synthetic', 'roomId': before.room.id}
  call assert_true(wbx#protocol#conversation(extend(deepcopy(base), {'action': 'remove'})))
  for action in ['moderator', 'promote', 'demote']
    call assert_false(wbx#protocol#conversation(extend(deepcopy(base), {'action': action})))
  endfor
  for field in ['isModerator', 'isRoomHidden']
    let value = extend(deepcopy(base), {'action': 'remove'}) | let value[field] = v:true
    call assert_false(wbx#protocol#conversation(value))
  endfor
  let hello = {'version': 1, 'state': wbx#state(), 'meeting': wbx#meeting_state(),
        \ 'capabilities': ['conversations-v1', 'room-members-v1', 'memberships-write-v1', 'local-context-v1'],
        \ 'spaceModerators': ['unapproved-role-v0']}
  call assert_true(wbx#protocol#hello(hello), 'unknown sibling is ignored, not a new approved negotiation contract')
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_hello'), [{'result': hello}])
  call assert_false(wbx#supports('space-moderators-v1'))
  call assert_equal(0, exists('*wbx#supports_moderators'))
  call assert_equal(0, exists(':WebexPromoteModerator')) | call assert_equal(0, exists(':WebexDemoteModerator'))
  call assert_equal(before, wbx#state()) | call assert_equal(lines, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_false(wbx#conversations#pending())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
