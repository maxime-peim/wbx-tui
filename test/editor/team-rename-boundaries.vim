" MF24 contract-first controlled consent/callback/DTO races. Only finite Team operations.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:team_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_team(action) abort', 'return g:team_available', 'endfunction',
      \ 'function! wbx#context_epoch() abort', 'return g:team_epoch', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid Team rename DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call assert_true(index(["teams.renamePrepare", "teams.rename", "conversations.resolve"], a:method) >= 0)',
      \ 'call add(g:team_requests, [a:method, deepcopy(a:params)])',
      \ 'if a:method ==# "teams.renamePrepare"',
      \ '  if g:team_hold | let g:TeamCallback = a:Callback | return 1 | endif',
      \ '  call call(a:Callback, [{"result": deepcopy(g:team_prepared)}])',
      \ 'elseif a:method ==# "teams.rename"',
      \ '  call add(g:team_write_callbacks, a:Callback)',
      \ '  call add(g:team_write_params, deepcopy(a:params))',
      \ '  let result = {"requestId": a:params.requestId, "action": "team-rename", "status": g:team_status, "notice": "Inert fixture", "teamId": a:params.teamId, "expectedName": a:params.expectedName, "name": a:params.name}',
      \ '  call call(a:Callback, [{"result": extend(result, deepcopy(g:team_reply_patch))}])',
      \ 'else', '  call call(a:Callback, [{"result": v:null}])', 'endif', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:team_state = {'state': 'ready', 'ready': v:true, 'room': v:null,
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:team_prepared = {'sessionId': repeat('a', 32), 'teamId': 'team', 'revision': 1,
      \ 'observedAt': localtime() * 1000, 'expectedName': 'Fresh raw Team'}
let g:team_available = 1 | let g:team_epoch = 1 | let g:team_hold = 0 | let g:team_requests = []
let g:team_race = '' | let g:team_status = 'failed' | let g:team_confirmations = []
let g:team_write_callbacks = [] | let g:team_write_params = []
let g:team_reply_patch = {}
command! -nargs=* WebexRenameTeam call wbx#conversations#team_rename(<q-args>)
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
function! TeamConfirm(text) abort
  call add(g:team_confirmations, a:text)
  if g:team_race ==# 'row' | call cursor(7, 1)
  elseif g:team_race ==# 'revision' | let b:wbx_joined_teams_snapshot.revision += 1
  elseif g:team_race ==# 'session' | let g:team_state.localContext.sessionId = repeat('b', 32)
  elseif g:team_race ==# 'age' | let b:wbx_joined_teams_snapshot.observedAt -= 120001
  elseif g:team_race ==# 'text' | setlocal modifiable | call setline(1, 'Native annotation during confirmation')
  elseif g:team_race ==# 'promote' | setlocal buftype=
  elseif g:team_race ==# 'window' | split | close
  endif
  return g:team_race !=# 'cancel'
endfunction
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn TeamConfirm(a:text)\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\ncall call(a:Callback, [1])\nendfunction"
function! s:source() abort
  setlocal buftype=nofile modifiable
  call setline(1, ['JOINED Teams', 'Explicit query', 'r refresh', 'No role authority', '', 'Duplicate label [team]', 'Duplicate label [other]'])
  setlocal nomodified nomodifiable
  let b:wbx_list_kind = 'joined-teams' | let b:wbx_list_tick = b:changedtick
  let b:wbx_list_row_ids = repeat([''], 5) + ['team', 'other']
  let b:wbx_joined_teams_snapshot = {'sessionId': g:team_state.localContext.sessionId, 'coverage': 'joined-teams',
        \ 'revision': 1, 'observedAt': localtime() * 1000, 'partial': v:false, 'more': v:false, 'limit': 'none',
        \ 'items': [{'teamId': 'team', 'label': 'Duplicate label'}, {'teamId': 'other', 'label': 'Duplicate label'}]}
  let g:team_prepared.sessionId = g:team_state.localContext.sessionId
  let g:team_prepared.revision = 1 | let g:team_prepared.observedAt = localtime() * 1000
  call cursor(6, 1)
endfunction
try
  file wbx://joined-teams
  call s:source()
  call assert_equal('team', wbx#joined_teams#selected().teamId)
  WebexRenameTeam New exact name
  call assert_equal(['teams.renamePrepare', 'teams.rename'], map(copy(g:team_requests), 'v:val[0]'))
  call assert_equal({'teamId': 'team', 'revision': 1}, g:team_requests[0][1])
  call assert_equal('Fresh raw Team', g:team_requests[1][1].expectedName)
  call assert_false(has_key(g:team_requests[1][1], 'personId'))
  call assert_false(has_key(g:team_requests[1][1], 'roomId'))
  let g:team_requests = []
  for race in ['cancel', 'row', 'revision', 'session', 'age', 'text', 'promote', 'window']
    call s:source() | let g:team_race = race
    WebexRenameTeam Nothing submitted
    call assert_equal(1, len(g:team_requests), race . ' allows only preparation, never protected submission')
    call assert_equal('teams.renamePrepare', g:team_requests[0][0])
    call assert_false(wbx#conversations#pending())
    let g:team_requests = []
  endfor
  let g:team_race = '' | call s:source() | let g:team_hold = 1
  WebexRenameTeam Held preparation
  let Old = g:TeamCallback | let old_value = deepcopy(g:team_prepared)
  let g:team_state.localContext.sessionId = repeat('c', 32) | let g:team_epoch += 1 | call s:source()
  let g:team_hold = 0
  WebexRenameTeam New session explicit intent
  call call(Old, [{'result': old_value}])
  call assert_equal(1, len(filter(copy(g:team_requests), 'v:val[0] ==# "teams.rename"')), 'old callback cannot submit or wedge the new session')
  let g:team_requests = [] | call s:source() | let g:team_hold = 1
  WebexRenameTeam Held annotation
  let AnnotationCallback = g:TeamCallback
  setlocal modifiable
  call setline(1, 'Keep native annotation + undo')
  call feedkeys("i\<Esc>", 'xt')
  let notes = getline(1, '$') | let tree = undotree() | let confirmations = len(g:team_confirmations)
  call call(AnnotationCallback, [{'result': g:team_prepared}])
  call assert_equal(notes, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_equal(confirmations, len(g:team_confirmations)) | call assert_equal(1, len(g:team_requests))
  let g:team_requests = [] | call s:source()
  WebexRenameTeam Cursor away and back while pending
  let CursorCallback = g:TeamCallback
  call cursor(7, 1) | doautocmd CursorMoved
  call cursor(6, 1) | doautocmd CursorMoved
  call call(CursorCallback, [{'result': g:team_prepared}])
  call assert_equal(1, len(g:team_requests), 'returning to the same row cannot resurrect an abandoned intent')
  call assert_false(wbx#conversations#pending())
  let g:team_hold = 0 | let g:team_requests = [] | call s:source()
  let g:team_prepared.observedAt -= 120001
  WebexRenameTeam Expired preparation
  call assert_equal(1, len(g:team_requests), 'aged raw preimage never submits')
  let hello = {'version': 1, 'capabilities': ['conversations-v1', 'joined-teams-v1', 'local-context-v1'],
        \ 'state': {'revision': 0, 'state': 'idle', 'mode': 'demo', 'rooms': [], 'messages': [], 'room': v:null, 'ready': v:false},
        \ 'meeting': {'active': v:false, 'ready': v:false}, 'teamActions': ['rename-v1']}
  call assert_true(wbx#protocol#hello(hello))
  for bad in ['rename-v1', v:true, {}, ['delete-v1'], ['rename-v1', 'rename-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'teamActions': bad})))
  endfor
  for required in ['conversations-v1', 'joined-teams-v1', 'local-context-v1']
    let invalid = deepcopy(hello) | call remove(invalid.capabilities, index(invalid.capabilities, required))
    call assert_false(wbx#protocol#hello(invalid))
  endfor
  call s:source()
  call assert_true(wbx#protocol#team_rename_preparation(g:team_prepared))
  for patch in [{'personId': 'private'}, {'isModerator': v:true}, {'revision': 0}, {'expectedName': ' noncanonical'}]
    call assert_false(wbx#protocol#team_rename_preparation(extend(deepcopy(g:team_prepared), patch)))
  endfor
  let result = {'requestId': 'original', 'action': 'team-rename', 'status': 'unknown', 'notice': 'Inspect Webex',
        \ 'teamId': 'team', 'expectedName': 'Fresh raw Team', 'name': 'New exact name'}
  call assert_true(wbx#protocol#conversation(result))
  for patch in [{'roomId': 'team'}, {'isModerator': v:true}, {'name': 'Fresh raw Team'}, {'expectedName': ''}, {'teamId': ''}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(result), patch)))
  endfor
  call s:source() | let g:team_requests = [] | let g:team_status = 'unknown'
  WebexRenameTeam Uncertain original
  let original = deepcopy(g:team_write_params[-1]) | let OriginalCallback = g:team_write_callbacks[-1]
  call assert_equal(2, len(g:team_requests))
  WebexRenameTeam Unknown cannot be retried
  call assert_equal(2, len(g:team_requests), 'no new preflight for same-Team uncertainty')
  call wbx#conversations#resolve()
  call assert_equal(['conversations.resolve', {'action': 'team-rename', 'teamId': 'team',
        \ 'requestId': original.requestId, 'checked': v:true}], g:team_requests[-1])
  WebexRenameTeam Newer uncertain attempt
  let newer = deepcopy(g:team_write_params[-1])
  call assert_notequal(original.requestId, newer.requestId)
  let late = {'requestId': original.requestId, 'action': 'team-rename', 'status': 'changed', 'notice': 'Old synthetic ACK',
        \ 'teamId': 'team', 'expectedName': original.expectedName, 'name': original.name}
  call call(OriginalCallback, [{'result': late}])
  let request_count = len(g:team_requests)
  WebexRenameTeam Older ACK cannot clear newer uncertainty
  call assert_equal(request_count, len(g:team_requests))
  call wbx#conversations#resolve()
  call assert_equal(newer.requestId, g:team_requests[-1][1].requestId, 'recovery still binds NEWER original evidence')
  let g:team_status = 'changed' | let g:team_reply_patch = {'teamId': 'foreign'} | let g:team_requests = []
  try
    WebexRenameTeam Mismatched callback is uncertain
  catch /Invalid Team rename DTO/
  endtry
  let request_count = len(g:team_requests)
  WebexRenameTeam Callback mismatch cannot release uncertainty
  call assert_equal(request_count, len(g:team_requests))
  let g:team_reply_patch = {}
  call wbx#conversations#resolve()
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
