" Provider NO-GO regression, not a moderator-management feature or service test.
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
  call wbx#select('demo-engineering')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  call feedkeys("iRetained native draft\<CR>Never a moderator write\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let normal = bufnr('%') | let tree = undotree() | let body = getline(1, '$')
  let before = deepcopy(wbx#state()) | let color = execute('highlight Normal') | let remove_key = maparg('\Wnr', 'n')
  WebexMembers
  call s:wait('exists("b:wbx_members_snapshot") && get(b:wbx_members_snapshot, "state", "") ==# "ready"')
  call assert_true(!empty(filter(copy(b:wbx_members_snapshot.items), 'v:val.moderator')))
  call cursor(4, 1)
  call assert_true(!empty(wbx#members#selected()))
  call assert_true(wbx#supports('memberships-write-v1'), 'existing invite/remove/leave support is unchanged')
  call assert_false(wbx#supports('space-moderators-v1'), 'readable moderator flags do not negotiate role updates')
  for name in ['WebexPromoteModerator', 'WebexDemoteModerator']
    call assert_equal(0, exists(':' . name))
    call assert_equal([], filter(wbx#commands#catalogue(), 'v:val.command ==# name'), 'no unusable placeholder command in the effective catalogue')
  endfor
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/members.vim$"')[0].sid
  let g:moderator_gate_menus = []
  execute 'function! <SNR>' . sid . "_pick(lines, Callback) abort\ncall add(g:moderator_gate_menus, copy(a:lines))\ncall call(a:Callback, [0])\nendfunction"
  call wbx#members#action()
  call assert_equal(1, len(g:moderator_gate_menus), 'exercise an actual clean participant row, not an empty-target refusal')
  call assert_equal(['1. Prepare a plaintext DM (does not send)', '2. Remove this membership (fresh moderator proof and confirmation)'],
        \ g:moderator_gate_menus[0][1:], 'existing menu has no hidden promotion/demotion entry')
  call assert_false(wbx#conversations#pending(), 'canceling existing row actions adds no role write')
  setlocal modifiable
  call append(0, 'Private annotation | let g:moderator_gate_executed=1')
  call feedkeys("i\<Esc>", 'xt')
  let annotated = getline(1, '$') | let annotated_tree = undotree()
  call assert_equal({}, wbx#members#selected(), 'annotated row is not target authority')
  call wbx#members#action()
  call assert_equal(1, len(g:moderator_gate_menus), 'annotation refuses before any participant action menu')
  call assert_equal(annotated, getline(1, '$')) | call assert_equal(annotated_tree, undotree())
  call assert_false(exists('g:moderator_gate_executed'))
  execute 'buffer ' . normal
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_equal(before, wbx#state()) | call assert_equal(color, execute('highlight Normal'))
  call assert_equal(remove_key, maparg('\Wnr', 'n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n')) | call assert_equal(2, exists(':WebexRemoveMember'))
  call assert_equal(0, exists(':WebexPromoteModerator')) | call assert_equal(0, exists(':WebexDemoteModerator'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
