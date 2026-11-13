" MF24 contract-first controlled prep/submit/DTO/recovery fences, not a provider or clear operation.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:td_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_team_description(format) abort', 'return g:td_available', 'endfunction',
      \ 'function! wbx#supports_team(action) abort', 'return 1', 'endfunction',
      \ 'function! wbx#context_epoch() abort', 'return g:td_epoch', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid Team-description DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call assert_true(index(["teams.descriptionPrepare", "teams.describe", "conversations.resolve"], a:method) >= 0)',
      \ 'call add(g:td_requests, [a:method, deepcopy(a:params)])',
      \ 'if a:method ==# "teams.descriptionPrepare"',
      \ '  if g:td_hold | let g:TdCallback = a:Callback | return 1 | endif',
      \ '  call call(a:Callback, [{"result": deepcopy(g:td_prepared)}])',
      \ 'elseif a:method ==# "teams.describe"',
      \ '  call add(g:td_write_callbacks, a:Callback) | call add(g:td_write_params, deepcopy(a:params))',
      \ '  let result = {"requestId": a:params.requestId, "action": "team-describe", "status": g:td_status, "notice": "Inert fixture", "teamId": a:params.teamId, "expectedName": a:params.expectedName, "expectedDescription": a:params.expectedDescription, "description": a:params.description}',
      \ '  call call(a:Callback, [{"result": extend(result, deepcopy(g:td_reply_patch))}])',
      \ 'else', '  call call(a:Callback, [{"result": v:null}])', 'endif', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:td_state = {'state': 'ready', 'ready': v:true, 'room': v:null,
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:td_prepared = {'sessionId': repeat('a', 32), 'teamId': 'team', 'revision': 1,
      \ 'observedAt': localtime() * 1000, 'expectedName': 'Fresh raw Team', 'expectedDescription': "Raw old\nLF description"}
let g:td_available = 1 | let g:td_hold = 0 | let g:td_epoch = 1 | let g:td_requests = []
let g:td_status = 'failed' | let g:td_race = '' | let g:td_write_callbacks = [] | let g:td_write_params = []
let g:td_reply_patch = {}
command! WebexDescribeTeam call wbx#conversations#team_description()
command! WebexTeamDescriptionSubmit call wbx#conversations#team_description_submit()
command! WebexTeamDescriptionCancel call wbx#conversations#team_description_cancel()
command! -nargs=* WebexRenameTeam call wbx#conversations#team_rename(<q-args>)
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
function! TdConfirm(text) abort
  let g:td_prompt = a:text
  if g:td_race ==# 'text' | call setline(1, 'Changed during consent')
  elseif g:td_race ==# 'format' | let b:wbx_format = 'markdown'
  elseif g:td_race ==# 'root' | let b:wbx_parent = 'unrelated-root'
  elseif g:td_race ==# 'file' | let b:wbx_staged_upload = {'attachmentId': repeat('a', 32), 'name': 'Not metadata', 'bytes': 1}
  elseif g:td_race ==# 'snapshot' | let b:wbx_team_description.expectedDescription = 'Forged old text'
  elseif g:td_race ==# 'name' | let b:wbx_team_description.expectedName = 'Forged required name echo'
  elseif g:td_race ==# 'age' | let g:description_now = b:wbx_team_description.observedAt + 120000
  elseif g:td_race ==# 'promote' | setlocal buftype=
  elseif g:td_race ==# 'window' | split | close
  endif
  return g:td_race !=# 'cancel'
endfunction
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn TdConfirm(a:text)\nendfunction"
execute 'function! <SNR>' . s:sid . "_description_now() abort\nreturn get(g:, 'description_now', localtime() * 1000)\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\ncall call(a:Callback, [1])\nendfunction"
function! s:joined() abort
  if bufname('%') !=# 'wbx://joined-teams' | execute 'buffer ' . g:td_joined | endif
  setlocal buftype=nofile modifiable
  call setline(1, ['JOINED Teams', 'Explicit query', 'r refresh', 'No role authority', '', 'Duplicate label [team]'])
  setlocal nomodified nomodifiable
  let b:wbx_list_kind = 'joined-teams' | let b:wbx_list_tick = b:changedtick
  let b:wbx_list_row_ids = repeat([''], 5) + ['team']
  let b:wbx_joined_teams_snapshot = {'sessionId': g:td_state.localContext.sessionId, 'coverage': 'joined-teams',
        \ 'revision': 1, 'observedAt': localtime() * 1000, 'partial': v:false, 'more': v:false, 'limit': 'none',
        \ 'items': [{'teamId': 'team', 'label': 'Duplicate label'}]}
  let g:td_prepared.sessionId = g:td_state.localContext.sessionId
  let g:td_prepared.observedAt = localtime() * 1000
  call cursor(6, 1)
endfunction
try
  file wbx://joined-teams
  let g:td_joined = bufnr('%') | call s:joined()
  WebexDescribeTeam
  call assert_true(exists('b:wbx_team_description'), 'actual private preparation, never forged b: fields alone')
  let prep = deepcopy(b:wbx_team_description)
  call assert_true(wbx#protocol#team_description(prep))
  for patch in [{'expectedDescription': v:null}, {'expectedName': ''}, {'personId': 'self'}, {'isModerator': v:true}, {'revision': 0}]
    call assert_false(wbx#protocol#team_description(extend(deepcopy(prep), patch)))
  endfor
  call setline(1, 'Changed text')
  silent! write
  call assert_equal(1, len(g:td_requests))
  WebexTeamDescriptionCancel
  for race in ['cancel', 'text', 'format', 'root', 'file', 'snapshot', 'name', 'age', 'promote', 'window']
    call s:joined() | let g:td_race = race | let g:td_requests = []
    WebexDescribeTeam
    call setline(1, ['Changed requested description', '| let g:td_executed=1'])
    call feedkeys("i\<Esc>", 'xt')
    let body = getline(1, '$') | let tree = undotree()
    WebexTeamDescriptionSubmit
    call assert_equal(1, len(g:td_requests), race . ' refuses after prep with zero Team PUT')
    call assert_false(wbx#conversations#pending())
    if race !=# 'text' | call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree()) | endif
    setlocal buftype=nofile
    let b:wbx_format = 'plain' | let b:wbx_parent = '' | let b:wbx_staged_upload = {}
    unlet! g:description_now
    WebexTeamDescriptionCancel
  endfor
  let g:td_race = '' | call s:joined() | let g:td_hold = 1 | let g:td_requests = []
  WebexDescribeTeam
  let Old = g:TdCallback | let old = deepcopy(g:td_prepared)
  let g:td_state.localContext.sessionId = repeat('b', 32) | let g:td_epoch += 1 | call s:joined()
  let g:td_hold = 0
  WebexDescribeTeam
  let current = deepcopy(b:wbx_team_description) | let text = getline(1, '$') | let tree = undotree()
  call call(Old, [{'result': old}])
  call assert_equal(current, b:wbx_team_description) | call assert_equal(text, getline(1, '$')) | call assert_equal(tree, undotree())
  for bad in ['', ' ', repeat('x', 1001), "bad\rline"]
    call setline(1, bad) | if line('$') > 1 | call deletebufline(bufnr('%'), 2, '$') | endif
    WebexTeamDescriptionSubmit
    call assert_equal(0, len(filter(copy(g:td_requests), 'v:val[0] ==# "teams.describe"')))
  endfor
  call setline(1, 'Uncertain requested replacement') | let g:td_status = 'unknown'
  WebexTeamDescriptionSubmit
  let original = deepcopy(g:td_write_params[-1]) | let OriginalCallback = g:td_write_callbacks[-1]
  let request_count = len(g:td_requests)
  call s:joined()
  WebexRenameTeam Unknown description blocks rename
  WebexDescribeTeam
  call assert_equal(request_count, len(g:td_requests), 'two-way Team metadata uncertainty is not bypassed by another command')
  call wbx#conversations#resolve()
  call assert_equal(['conversations.resolve', {'action': 'team-describe', 'teamId': 'team',
        \ 'requestId': original.requestId, 'checked': v:true}], g:td_requests[-1])
  WebexDescribeTeam
  call setline(1, 'Newer uncertain replacement')
  WebexTeamDescriptionSubmit
  let newer = deepcopy(g:td_write_params[-1])
  let late = {'requestId': original.requestId, 'action': 'team-describe', 'status': 'changed', 'notice': 'Old synthetic ACK',
        \ 'teamId': 'team', 'expectedName': original.expectedName, 'expectedDescription': original.expectedDescription, 'description': original.description}
  call call(OriginalCallback, [{'result': late}])
  let request_count = len(g:td_requests)
  call s:joined() | WebexDescribeTeam
  call assert_equal(request_count, len(g:td_requests), 'old ACK cannot release newer description uncertainty')
  call wbx#conversations#resolve()
  call assert_equal(newer.requestId, g:td_requests[-1][1].requestId)
  let g:td_status = 'changed' | let g:td_reply_patch = {'teamId': 'foreign'} | call s:joined()
  WebexDescribeTeam
  let edit = bufnr('%') | call setline(1, 'Mismatch remains uncertain') | let body = getline(1, '$') | let tree = undotree()
  try
    WebexTeamDescriptionSubmit
    call assert_report('Deliberately mismatched Team-description result must raise a protocol error')
  catch /Invalid Team-description DTO/
  endtry
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_equal('unknown', b:wbx_team_description_status)
  let request_count = len(g:td_requests)
  call s:joined() | WebexDescribeTeam
  WebexRenameTeam Cannot bypass malformed ACK
  call assert_equal(request_count, len(g:td_requests))
  let g:td_reply_patch = {} | call wbx#conversations#resolve()
  " A copied public DTO never creates private edit authority.
  enew
  file wbx://team-description/copied
  setlocal buftype=nofile
  let b:wbx_team_description = deepcopy(prep)
  call setline(1, 'Forged replacement')
  let request_count = len(g:td_requests)
  WebexTeamDescriptionSubmit
  call assert_false(wbx#conversations#is_team_description(bufnr('%')))
  call assert_equal(request_count, len(g:td_requests))
  " Preparation fences include cursor-away-return, notes, query replacement, and future time.
  for race in ['cursor', 'notes', 'revision', 'future', 'age']
    call s:joined() | let g:td_hold = 1 | let g:td_requests = []
    WebexDescribeTeam
    let Held = g:TdCallback | let value = deepcopy(g:td_prepared)
    if race ==# 'cursor'
      call cursor(5, 1) | doautocmd CursorMoved
      call cursor(6, 1) | doautocmd CursorMoved
    elseif race ==# 'notes'
      setlocal modifiable | call setline(1, 'Native source annotation')
    elseif race ==# 'revision'
      let b:wbx_joined_teams_snapshot.revision += 1
    elseif race ==# 'future'
      let value.observedAt = localtime() * 1000 + 2000
    else
      let value.observedAt -= 120001
    endif
    let source = bufnr('%') | let body = getline(1, '$') | let tree = undotree()
    call call(Held, [{'result': value}])
    call assert_equal(source, bufnr('%'), race . ' cannot open a metadata edit')
    call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
    call assert_false(wbx#conversations#pending())
    let g:td_hold = 0
  endfor
  let hello = {'version': 1, 'capabilities': ['conversations-v1', 'joined-teams-v1', 'local-context-v1'],
        \ 'state': {'revision': 0, 'state': 'idle', 'mode': 'demo', 'rooms': [], 'messages': [], 'room': v:null, 'ready': v:false},
        \ 'meeting': {'active': v:false, 'ready': v:false}, 'teamActions': ['rename-v1'], 'teamDescriptions': ['replace-v1']}
  call assert_true(wbx#protocol#hello(hello))
  let description_only = deepcopy(hello) | call remove(description_only, 'teamActions')
  call assert_true(wbx#protocol#hello(description_only), 'description does not require or imply rename negotiation')
  let rename_only = deepcopy(hello) | call remove(rename_only, 'teamDescriptions')
  call assert_true(wbx#protocol#hello(rename_only))
  for bad in ['replace-v1', v:true, {}, ['clear-v1'], ['replace-v1', 'replace-v1']]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), {'teamDescriptions': bad})))
  endfor
  for required in ['conversations-v1', 'joined-teams-v1', 'local-context-v1']
    let missing = deepcopy(hello) | call remove(missing.capabilities, index(missing.capabilities, required))
    call assert_false(wbx#protocol#hello(missing))
  endfor
  call assert_true(wbx#protocol#conversation(late))
  for patch in [{'name': 'not a rename'}, {'roomId': 'room'}, {'expectedDescription': v:null}, {'description': ' '}, {'isModerator': v:true}]
    call assert_false(wbx#protocol#conversation(extend(deepcopy(late), patch)))
  endfor
  call assert_false(exists('g:td_executed'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
