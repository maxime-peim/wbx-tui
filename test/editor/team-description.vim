" MF24 contract-first actual-demo Team metadata buffer; no clear/role writer or Room command retargeting.
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
let g:team_description_accept = 0 | let g:team_description_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:team_description_prompts, a:text)\nreturn g:team_description_accept\nendfunction"
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let root = wbx#state().messages[0].id
  call wbx#drafts#reply(wbx#state().room.id, root) | call wbx#compose()
  call feedkeys("iRetained ordinary reply | not Team metadata\<Esc>", 'xt')
  WebexFormat markdown
  let path = $WBX_EDITOR_RESULT . '.team-description.bin'
  call writefile(['Retained immutable reply file'], path, 'b')
  call wbx#uploads#stage(path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  call feedkeys("i\<Esc>", 'xt')
  let draft = bufnr('%') | let text = getline(1, '$') | let tree = undotree()
  let file = wbx#drafts#upload(draft) | let draft_id = wbx#drafts#draft_id(draft)
  let color = execute('highlight Normal') | let remove = maparg('\Wnr', 'n')
  call assert_equal(2, exists(':WebexDescribeTeam'), 'separate named preparation, not a rename/Room role/settings tunnel')
  WebexDescribeTeam
  call assert_equal(draft, bufnr('%'), 'a Room composer/Team association cannot authorize Team-description prep')
  WebexJoinedTeams
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && wbx#joined_teams#current()')
  call cursor(6, 1)
  let joined = bufnr('%') | let joined_snapshot = deepcopy(b:wbx_joined_teams_snapshot)
  let before = deepcopy(wbx#state()) | let enter = maparg('<CR>', 'n') | let filter_id = wbx#sections#current_filter()
  WebexDescribeTeam
  call s:wait('exists("b:wbx_team_description") && !wbx#conversations#pending()')
  let edit = bufnr('%') | let window = win_getid() | let snapshot = deepcopy(b:wbx_team_description)
  call assert_true(wbx#conversations#is_team_description(edit))
  call assert_false(wbx#conversations#is_description(edit), 'Room APIs cannot adopt a Team edit from the shared private preparation budget')
  call assert_match('^wbx://team-description/', bufname('%'))
  call assert_equal('nofile', &buftype) | call assert_false(&swapfile) | call assert_false(&undofile)
  call assert_equal('demo-team', snapshot.teamId) | call assert_equal(joined_snapshot.revision, snapshot.revision)
  call assert_equal('Engineering · Server Team DEMO', snapshot.expectedName, 'raw name, not duplicate sanitized joined labels')
  call assert_equal(snapshot.expectedDescription, join(getline(1, '$'), "\n"))
  let initial = getline(1, '$')
  normal! G$
  call feedkeys("A changed résumé description\<CR>| let g:team_description_executed=1\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let replacement = getline(1, '$') | let replacement_tree = undotree()
  silent! write
  WebexDescriptionSubmit
  WebexSend
  call assert_false(wbx#conversations#pending(), 'write/Enter/Room submit/Send never issue a Team metadata PUT or message')
  WebexTeamDescriptionSubmit
  call assert_false(wbx#conversations#pending(), 'default-Cancel is no write')
  call assert_equal(replacement_tree, undotree())
  let g:team_description_accept = 1
  WebexTeamDescriptionSubmit
  call s:wait('!wbx#conversations#pending() && get(b:, "wbx_team_description_status", "") ==# "changed"')
  call assert_equal(edit, bufnr('%')) | call assert_equal(window, win_getid())
  call assert_equal(replacement, getline(1, '$')) | call assert_equal(replacement_tree, undotree())
  call assert_equal(before, wbx#state(), 'description ACK never publishes Room/Team-cache/roles/messages/unread/receipts/delivery')
  call assert_equal(joined_snapshot, getbufvar(joined, 'wbx_joined_teams_snapshot'))
  call assert_equal(0, getbufvar(joined, 'wbx_joined_teams_stale', 0), 'unlike rename, description ACK does not reset or renew the joined query')
  call assert_equal(filter_id, wbx#sections#current_filter())
  call assert_match(snapshot.teamId, g:team_description_prompts[-1])
  call assert_match(snapshot.expectedName, g:team_description_prompts[-1])
  call assert_match('name', tolower(g:team_description_prompts[-1]))
  call assert_match('race\|concurrent\|atomic', tolower(g:team_description_prompts[-1]))
  call assert_false(exists('g:team_description_executed'))
  normal! u
  call assert_equal(initial, getline(1, '$'), 'metadata completion leaves independent native typing undo intact')
  execute 'buffer ' . joined | call cursor(6, 1)
  call assert_equal(enter, maparg('<CR>', 'n'))
  WebexDescribeTeam
  call s:wait('bufnr("%") != ' . joined . ' && exists("b:wbx_team_description") && !wbx#conversations#pending()')
  call assert_equal(join(replacement, "\n"), b:wbx_team_description.expectedDescription, 'fresh explicit reread, no forced editor text replacement')
  call feedkeys("A retained canceled Team text\<Esc>", 'xt')
  let canceled = getline(1, '$') | let canceled_tree = undotree()
  WebexTeamDescriptionCancel
  WebexTeamDescriptionSubmit
  call assert_false(wbx#conversations#pending())
  call assert_equal(canceled, getline(1, '$')) | call assert_equal(canceled_tree, undotree())
  " One Room + seven Team preparations exhaust the SAME existing eight-slot budget.
  execute 'buffer ' . draft
  WebexDescribeSpace
  call s:wait('exists("b:wbx_space_description") && !wbx#conversations#pending()')
  let room_edit = bufnr('%')
  WebexTeamDescriptionSubmit
  call assert_false(wbx#conversations#pending(), 'Team submit cannot adopt the Room description private record')
  let active = []
  for index in range(1, 7)
    execute 'buffer ' . joined | call cursor(6, 1)
    WebexDescribeTeam
    call s:wait('bufnr("%") != ' . joined . ' && exists("b:wbx_team_description") && !wbx#conversations#pending()')
    call add(active, bufnr('%'))
  endfor
  execute 'buffer ' . joined | call cursor(6, 1)
  WebexDescribeTeam
  call assert_false(wbx#conversations#pending(), 'ninth combined Room/Team prep refuses before IO; no doubled registry')
  call assert_equal(joined, bufnr('%'))
  execute 'buffer ' . draft
  WebexDescribeSpace
  call assert_false(wbx#conversations#pending(), 'Room preparation also sees all eight combined active records')
  call assert_equal(draft, bufnr('%'))
  execute 'buffer ' . active[0]
  let retained = getline(1, '$') | let retained_tree = undotree()
  WebexTeamDescriptionCancel
  call assert_equal(retained, getline(1, '$')) | call assert_equal(retained_tree, undotree())
  execute 'buffer ' . joined | call cursor(6, 1)
  WebexDescribeTeam
  call s:wait('bufnr("%") != ' . joined . ' && exists("b:wbx_team_description") && !wbx#conversations#pending()')
  call assert_equal(text, getbufline(draft, 1, '$')) | call assert_equal(file, wbx#drafts#upload(draft))
  call assert_equal(draft_id, wbx#drafts#draft_id(draft))
  execute 'buffer ' . draft
  call assert_equal(tree, undotree()) | call assert_equal(root, b:wbx_parent) | call assert_equal('markdown', b:wbx_format)
  call assert_equal(color, execute('highlight Normal')) | call assert_equal(remove, maparg('\Wnr', 'n'))
  call assert_equal(0, exists(':WebexTeamDescriptionClear'), 'no blank/sentinel clear or role/visibility capability inferred')
  let g:wbx_tui.mappings = 0 | call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n'))
  call assert_equal(2, exists(':WebexTeamDescriptionSubmit')) | call assert_equal(2, exists(':WebexTeamDescriptionCancel'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
