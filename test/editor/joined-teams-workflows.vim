" Actual demo backend/default keys, no joins or room scans; preserve native work.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'read_status': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 6 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call assert_true(wbx#supports('joined-teams-v1'), 'new capability fits the unchanged native ceiling')
  call assert_true(wbx#state().room is v:null)
  call feedkeys("\\WvT", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && exists("b:wbx_joined_teams_snapshot")')
  let joined = bufnr('%')
  call assert_match('JOINED Teams.*not organization/public discovery', getline(1))
  call assert_equal(2, len(b:wbx_joined_teams_snapshot.items))
  call assert_equal(b:wbx_joined_teams_snapshot.items[0].label, b:wbx_joined_teams_snapshot.items[1].label)
  call assert_notequal(b:wbx_joined_teams_snapshot.items[0].teamId, b:wbx_joined_teams_snapshot.items[1].teamId)
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal('all', wbx#sections#current_filter(), 'heading never selects the last Team')
  call cursor(7, 1)
  execute "normal \<CR>"
  call assert_equal('all', wbx#sections#current_filter(), 'a joined Team without loaded spaces never fetches or fabricates any')
  call assert_equal(3, len(wbx#state().rooms))
  call assert_true(wbx#state().room is v:null)
  call cursor(6, 1)
  execute "normal \<CR>"
  call assert_equal('team:demo-team', wbx#sections#current_filter())
  call assert_true(wbx#state().room is v:null, 'filtering never selects/joins a room')
  WebexActions
  call assert_match('WvT.*WebexJoinedTeams', join(getline(1, '$'), ' '))
  call assert_match('WebexJoinedTeamsMore', join(getline(1, '$'), ' '))
  normal q
  call assert_equal(joined, bufnr('%'))
  normal q
  WebexFilter all
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let composer = bufnr('%')
  call feedkeys("iRetained normal Team draft\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let tree = undotree()
  let before = wbx#state()
  call feedkeys("\\WvT", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && wbx#joined_teams#current()')
  call assert_equal(before.messages, wbx#state().messages)
  call assert_equal(before.messageEvents, wbx#state().messageEvents)
  let revision = b:wbx_joined_teams_snapshot.revision
  normal r
  call s:wait('b:wbx_joined_teams_snapshot.revision > ' . revision)
  normal ]p
  call assert_equal(joined, bufnr('%'), 'an exhausted query does not generate another read automatically')
  call cursor(6, 1)
  execute "normal \<CR>"
  call assert_equal('team:demo-team', wbx#sections#current_filter())
  call assert_equal('demo-general', wbx#state().room.id)
  call assert_equal(before.messages, wbx#state().messages)
  set lines=18 columns=44
  redraw!
  set lines=60 columns=160
  normal q
  call assert_equal(composer, bufnr('%'))
  call assert_equal(tree, undotree(), 'joined list/filters never modify full native draft undo')
  normal! u
  call assert_equal([''], getline(1, '$'))
  execute "normal! \<C-r>"
  call assert_equal(['Retained normal Team draft'], getline(1, '$'))
  call feedkeys("\\Wvt", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "teams" && exists("b:wbx_teams_snapshot")')
  call assert_match('loaded-room associations only', getline(1), 'old Wvt remains its original loaded-label provider')
  normal q
  WebexJoinedTeams
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && wbx#joined_teams#current()')
  let old = deepcopy(b:wbx_joined_teams_snapshot)
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  execute 'buffer ' . joined
  WebexJoinedTeamsRefresh
  WebexJoinedTeamsMore
  call assert_equal(old, b:wbx_joined_teams_snapshot, 'old-session reads/rows cannot borrow a new account')
  WebexJoinedTeams
  call s:wait('wbx#joined_teams#current()')
  call assert_notequal(old.sessionId, b:wbx_joined_teams_snapshot.sessionId)
  setlocal modifiable
  call setline(1, 'Private joined-Team annotation')
  let tree = undotree()
  normal r
  normal q
  call assert_equal('Private joined-Team annotation', getline(1))
  call assert_equal(tree, undotree())
  setlocal buftype=
  WebexJoinedTeams
  call assert_equal('', &buftype)
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\WvT', 'n'))
  call assert_equal(2, exists(':WebexJoinedTeams'))
  call assert_equal(['Retained normal Team draft'], getbufline(composer, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
