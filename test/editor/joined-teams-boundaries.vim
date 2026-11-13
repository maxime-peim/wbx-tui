" Controlled session/query/list races. Only teams.joined is permitted on the wire.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:joined_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return g:joined_available', 'endfunction',
      \ 'function! wbx#context_epoch() abort', 'return g:joined_epoch', 'endfunction',
      \ 'function! wbx#redraw() abort', 'let g:joined_redraws += 1', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid joined-Team DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:joined_requests, [a:method, deepcopy(a:params)])',
      \ 'if g:joined_hold | let g:JoinedCallback = a:Callback | return 1 | endif',
      \ 'call call(a:Callback, [{"result": deepcopy(g:joined_result)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:joined_available = 1 | let g:joined_hold = 0 | let g:joined_requests = [] | let g:joined_epoch = 1 | let g:joined_redraws = 0
let g:joined_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'destination', 'title': 'Retained destination'},
      \ 'rooms': [{'id': 'a-room', 'teamId': 'a'}, {'id': 'b-room', 'teamId': 'b'}],
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:joined_result = {'sessionId': repeat('a', 32), 'coverage': 'joined-teams', 'revision': 1,
      \ 'observedAt': localtime() * 1000, 'partial': v:true, 'more': v:true, 'limit': 'none',
      \ 'items': [{'teamId': 'a', 'label': 'Same Name'}, {'teamId': 'b', 'label': 'Same Name'}]}
command! WebexJoinedTeamsRefresh call wbx#joined_teams#show(2)
command! WebexJoinedTeamsMore call wbx#joined_teams#show(1)
command! WebexJoinedTeamFilter call wbx#joined_teams#filter()
try
  call setline(1, 'Unrelated native text')
  let original = bufnr('%')
  let g:joined_available = 0
  call wbx#joined_teams#show(0)
  call assert_equal([], g:joined_requests)
  let g:joined_available = 1
  call wbx#joined_teams#show(1)
  call assert_equal([], g:joined_requests, 'no initial next-page query without an exact observed revision')
  call wbx#joined_teams#show(0)
  let list = bufnr('%')
  call assert_equal([['teams.joined', {}]], g:joined_requests)
  call assert_match('PARTIAL', getline(2))
  call assert_match('never joins', getline(3))
  call cursor(1, 1)
  execute "normal \<CR>"
  call assert_equal(0, g:joined_redraws)
  let g:joined_result.revision = 2
  let g:joined_result.more = v:false | let g:joined_result.partial = v:false
  call add(g:joined_result.items, {'teamId': 'c', 'label': 'No loaded spaces'})
  normal ]p
  call assert_equal(['teams.joined', {'more': v:true, 'revision': 1}], g:joined_requests[-1])
  call cursor(7, 1)
  execute "normal \<CR>"
  call assert_equal('team:b', wbx#sections#current_filter(), 'same labels filter by exact selected ID')
  call assert_equal('destination', wbx#state().room.id)
  let redraws = g:joined_redraws
  let request_count = len(g:joined_requests)
  call cursor(8, 1)
  execute "normal \<CR>"
  call assert_equal(redraws, g:joined_redraws)
  call assert_equal(request_count, len(g:joined_requests), 'no hidden room discovery for an unloaded Team')
  let guidance = execute('WebexJoinedTeamFilter')
  call assert_match('WebexMoreSpaces.*500-room cap', guidance)
  call assert_match('No membership change', guidance)
  let saved_rooms = deepcopy(g:joined_state.rooms)
  call extend(g:joined_state.rooms, map(range(500 - len(g:joined_state.rooms)), '{"id":"cap-" . v:val,"type":"group","title":"Cap row"}'))
  let guidance = execute('WebexJoinedTeamFilter')
  call assert_match('paging cannot bypass', guidance)
  call assert_equal(request_count, len(g:joined_requests), 'cap guidance never starts a provider operation')
  let g:joined_state.rooms = saved_rooms
  let g:joined_state.rooms[1].cached = v:true
  call cursor(7, 1)
  execute "normal \<CR>"
  call assert_equal(redraws, g:joined_redraws, 'cached room labels do not supply current loaded targets')
  let g:joined_state.rooms[1].cached = v:false
  for index in range(20)
    call assert_true(wbx#joined_teams#current())
    call wbx#joined_teams#selected()
  endfor
  call assert_equal(request_count, len(g:joined_requests), 'render/status/cursor inspection never makes a read')
  let b:wbx_joined_teams_snapshot.observedAt -= 120001
  execute "normal \<CR>"
  normal ]p
  call assert_equal(request_count, len(g:joined_requests))
  call assert_equal(redraws, g:joined_redraws, 'expired choices do not filter')
  normal r
  call assert_true(wbx#joined_teams#current(), 'explicit same-session refresh obtains a new observation')
  call assert_equal(['teams.joined', {}], g:joined_requests[-1], 'refresh never reuses an expired cursor')
  let before = deepcopy(b:wbx_joined_teams_snapshot)
  let g:joined_result.observedAt -= 120001
  normal r
  call assert_equal(before, b:wbx_joined_teams_snapshot)
  let g:joined_result.observedAt = localtime() * 1000 + 120000
  normal r
  call assert_equal(before, b:wbx_joined_teams_snapshot, 'future-dated response cannot prolong the list')
  let g:joined_result.observedAt = localtime() * 1000
  let g:joined_hold = 1
  normal r
  let Away = g:JoinedCallback
  split
  close
  call call(Away, [{'result': g:joined_result}])
  call assert_equal(before, b:wbx_joined_teams_snapshot, 'away-and-return choices cannot install a late list')
  normal r
  let g:joined_epoch += 2
  call call(g:JoinedCallback, [{'result': g:joined_result}])
  call assert_equal(before, b:wbx_joined_teams_snapshot, 'selected-room away-and-return invalidates an in-flight choice')
  normal r
  setlocal modifiable
  call setline(1, 'Private note during GET')
  let tree = undotree()
  call call(g:JoinedCallback, [{'result': g:joined_result}])
  call assert_equal('Private note during GET', getline(1))
  call assert_equal(tree, undotree())
  let request_count = len(g:joined_requests)
  normal r
  normal q
  call assert_equal(request_count, len(g:joined_requests))
  enew
  execute 'bunload! ' . list
  execute 'buffer ' . list
  call assert_equal('Private note during GET', getline(1), 'unload retains annotated list text')
  execute 'bwipeout! ' . list
  execute 'buffer ' . original
  call wbx#joined_teams#show(0)
  let OldCallback = g:JoinedCallback
  let old = deepcopy(g:joined_result)
  let g:joined_state.localContext.sessionId = repeat('b', 32)
  let g:joined_result.sessionId = repeat('b', 32)
  let g:joined_hold = 0
  call wbx#joined_teams#show(0)
  call assert_true(wbx#joined_teams#current(), 'dropped old-session callback cannot wedge an explicit new query')
  call call(OldCallback, [{'result': old}])
  call assert_equal(repeat('b', 32), b:wbx_joined_teams_snapshot.sessionId)
  for invalid in [extend(deepcopy(g:joined_result), {'description': 'PRIVATE'}),
        \ extend(deepcopy(g:joined_result), {'limit': 'bytes'}),
        \ extend(deepcopy(g:joined_result), {'coverage': 'organization-teams'})]
    call assert_false(wbx#protocol#joined_teams(invalid))
  endfor
  let invalid = deepcopy(g:joined_result) | let invalid.items[0].roles = ['ADMIN']
  call assert_false(wbx#protocol#joined_teams(invalid))
  let invalid = deepcopy(g:joined_result) | let invalid.items[1].teamId = invalid.items[0].teamId
  call assert_false(wbx#protocol#joined_teams(invalid))
  let invalid = deepcopy(g:joined_result) | let invalid.items[0].label = "bad\nlabel"
  call assert_false(wbx#protocol#joined_teams(invalid))
  let list = bufnr('%')
  let projection = getline(1, '$')
  enew
  execute 'bunload! ' . list
  execute 'buffer ' . list
  call assert_equal(projection, getline(1, '$'))
  call assert_true(wbx#joined_teams#bound(), 'clean unload uses existing safe list restoration')
  setlocal modifiable
  call setline(1, 'Promoted native Team notes')
  let tree = undotree()
  setlocal buftype=
  let request_count = len(g:joined_requests)
  call wbx#joined_teams#show(0)
  call assert_equal(request_count, len(g:joined_requests))
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  execute 'bwipeout! ' . list
  call wbx#joined_teams#show(0)
  nnoremap <buffer> q :let g:joined_user_map = 1<CR>
  let g:wbx_tui = {'mappings': 0}
  call wbx#lists#setup()
  call assert_equal('', maparg('r', 'n'))
  call assert_equal('', maparg(']p', 'n'))
  call assert_equal('', maparg('<CR>', 'n'))
  call assert_match('joined_user_map', maparg('q', 'n'), 'user shadows survive opt-out')
  let g:joined_state.localContext.sessionId = repeat('c', 32)
  let request_count = len(g:joined_requests)
  call wbx#joined_teams#show(1)
  call wbx#joined_teams#show(2)
  call assert_equal(request_count, len(g:joined_requests))
  call assert_true(empty(filter(copy(g:joined_requests), 'v:val[0] !=# "teams.joined"')), 'no Team detail, room/member scan, join, send or receipt RPC')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
