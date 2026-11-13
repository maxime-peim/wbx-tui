" MF24 contract-first actual demo: explicit joined row, raw preimage, never a Room rename/role writer.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'mark_read_on_open': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
let g:team_rename_confirms = []
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:team_rename_confirms, a:text)\nreturn 1\nendfunction"
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
  let root = wbx#state().messages[0].id
  call wbx#drafts#reply(wbx#state().room.id, root)
  call wbx#compose()
  call feedkeys("iRetained reply | never Team rename text\<Esc>", 'xt')
  WebexFormat markdown
  let path = $WBX_EDITOR_RESULT . '.team-file.bin'
  call writefile(['Retained staged snapshot'], path, 'b')
  call wbx#uploads#stage(path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  call feedkeys("i\<Esc>", 'xt')
  let draft = bufnr('%') | let body = getline(1, '$') | let tree = undotree()
  let file = wbx#drafts#upload(draft) | let draft_id = wbx#drafts#draft_id(draft)
  let color = execute('highlight Normal') | let remove = maparg('\Wnr', 'n')
  call assert_equal(2, exists(':WebexRenameTeam'), 'MF24 is named-only, never Wnr or Enter on a Team row')
  WebexRenameTeam Not from a composer
  call assert_equal([], g:team_rename_confirms, 'a Team-space association is not exact joined-Team source consent')
  WebexJoinedTeams
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && wbx#joined_teams#current()')
  call cursor(6, 1)
  let row = wbx#joined_teams#selected() | let joined = bufnr('%') | let before = deepcopy(wbx#state())
  let enter = maparg('<CR>', 'n') | let active_filter = wbx#sections#current_filter()
  let selected_text = getline(1, '$') | let selected_undo = undotree()
  call assert_true(wbx#supports_team('rename-v1'))
  call assert_equal(1, len(filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexRenameTeam" && v:val.available')))
  WebexRenameTeam Renamed résumé Team
  call s:wait('len(g:team_rename_confirms) == 1 && !wbx#conversations#pending()')
  call assert_match(row.teamId, g:team_rename_confirms[0])
  call assert_match('Engineering · Server Team DEMO', g:team_rename_confirms[0], 'fresh exact raw Team preimage, not Demo Team display label')
  call assert_match('Renamed résumé Team', g:team_rename_confirms[0])
  call assert_match('not atomic\|race', g:team_rename_confirms[0])
  call assert_match('moderator', tolower(g:team_rename_confirms[0]))
  call assert_equal(before, wbx#state(), 'Team ACK never renames Room/cache/roles/messages/unread or emits a delivery')
  call assert_equal(joined, bufnr('%')) | call assert_equal(selected_text, getline(1, '$'))
  call assert_equal(selected_undo, undotree()) | call assert_equal(active_filter, wbx#sections#current_filter())
  call assert_equal(enter, maparg('<CR>', 'n')) | call assert_equal(remove, maparg('\Wnr', 'n'))
  call assert_false(wbx#joined_teams#current(), 'confirmed rename invalidates selection; never silently rewrites native rows')
  let confirmation_count = len(g:team_rename_confirms)
  WebexRenameTeam Stale source cannot authorize another rename
  call assert_equal(confirmation_count, len(g:team_rename_confirms))
  WebexJoinedTeamsRefresh
  call s:wait('wbx#joined_teams#current()')
  call assert_equal('Renamed résumé Team', b:wbx_joined_teams_snapshot.items[0].label)
  setlocal modifiable
  call setline(1, 'Private Team notes | let g:team_pwned=1')
  call feedkeys("i\<Esc>", 'xt')
  let notes = getline(1, '$') | let note_tree = undotree()
  WebexRenameTeam Annotation is not consent
  normal q
  call assert_equal(notes, getline(1, '$')) | call assert_equal(note_tree, undotree())
  setlocal buftype=
  WebexRenameTeam Promoted file is not consent
  call assert_equal('', &buftype) | call assert_equal(note_tree, undotree())
  call assert_equal(confirmation_count, len(g:team_rename_confirms))
  call assert_equal(body, getbufline(draft, 1, '$')) | call assert_equal(file, wbx#drafts#upload(draft))
  call assert_equal(draft_id, wbx#drafts#draft_id(draft))
  execute 'buffer ' . draft
  call assert_equal(tree, undotree()) | call assert_equal(root, b:wbx_parent) | call assert_equal('markdown', b:wbx_format)
  call assert_equal(color, execute('highlight Normal')) | call assert_false(exists('g:team_pwned'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n')) | call assert_equal(2, exists(':WebexRemoveMember'))
  call assert_equal(2, exists(':WebexRenameTeam'))
  for command in ['WebexCreateTeam', 'WebexDeleteTeam', 'WebexTeamPromote', 'WebexHideSpace', 'WebexMuteSpace']
    call assert_equal(0, exists(':' . command))
  endfor
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_false(wbx#supports_team('rename-v1'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
