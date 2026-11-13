" Server-backed labels only for already loaded Team IDs. Distinct from local Sections.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:buffer = 0
function! s:received(origin, response) abort
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#teams(value) | call wbx#_protocol_error() | return | endif
  if !wbx#view#intent_valid(a:origin) | return | endif
  let lines = ['Server Teams · loaded-room associations only, never personal Webex Sections',
        \ 'PARTIAL · r refresh · ]p next labels · Enter filter · q return · observed locally ' . strftime('%H:%M:%S %Z') . '; no membership inference']
  let rows = ['', '']
  for item in value.items
    call add(lines, item.label . ' [' . item.id . '] · ' . item.state . ' · ' . len(item.roomIds) . ' loaded spaces')
    call add(rows, item.id)
  endfor
  let s:buffer = wbx#lists#show('teams', lines, rows)
  if s:buffer <= 0 | return | endif
  let b:wbx_teams_owned = 1
  let b:wbx_team_rows = rows | let b:wbx_teams_snapshot = value
  let b:wbx_teams_tick = b:changedtick
endfunction
function! wbx#teams#show(more) abort
  if !wbx#supports('server-teams-v1') | echomsg '[wbx-tui] Server Teams require an updated connected backend and known grant.' | return | endif
  if !wbx#lists#admit('teams') | return | endif
  call wbx#rpc('teams.list', {'more': a:more ? v:true : v:false}, function('s:received', [wbx#view#intent()]))
endfunction
function! wbx#teams#filter(id) abort
  let id = a:id
  if empty(id) && wbx#lists#clean(bufnr('%'), 'teams') && get(b:, 'wbx_teams_tick', -1) == b:changedtick
    let id = wbx#lists#selected_id()
  endif
  if empty(id) | echomsg '[wbx-tui] Choose an unchanged Server Team row or exact loaded Team ID.' | return | endif
  call wbx#sections#filter('team:' . id)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
