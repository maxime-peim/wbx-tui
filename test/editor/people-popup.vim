" Passive float, real native ownership/undo/geometry, no provider or transport.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:popup_state)', 'endfunction',
      \ 'function! wbx#supports_people_spaces() abort', 'return 0', 'endfunction',
      \ 'function! wbx#rpc(...) abort', 'throw "Unexpected popup RPC"', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'people_status': 1, 'notifications': 0}
let g:popup_state = {'state': 'idle', 'room': v:null}
let s:drawn = []
function! s:windows() abort
  let windows = has('nvim') ? nvim_list_wins() : popup_list()
  return filter(windows, 'getbufvar(winbufnr(v:val), "wbx_people_popup", "") ==# "owned-people-snapshot"')
endfunction
function! s:native() abort
  return [win_getid(), bufnr('%'), getline(1, '$'), undotree(), b:changedtick, getcurpos(), winsaveview(), &breakat]
endfunction
function! s:sync() abort
  let before = s:native()
  call wbx#people#sync(g:popup_state)
  call assert_equal(before, s:native(), 'float updates never change focus, native text/full undo, cursor/view or breakat')
endfunction
function! s:draw(expected) abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  redraw
  let found = 0
  for row in range(1, &lines - 1)
    let text = join(map(range(1, &columns), 'screenstring(row, v:val)'), '')
    if stridx(text, a:expected) >= 0 | let found = 1 | break | endif
  endfor
  call assert_true(found, 'actual framed People text is drawn: ' . a:expected)
  call add(s:drawn, a:expected)
endfunction
try
  enew | file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'A'
  call setline(1, ['# History', ''] + repeat(['Independent native history'], 20))
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  let history = win_getid()
  botright 7new | file wbx://compose/A
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'A'
  call setline(1, ['Unsent native draft', 'Second native line'])
  call feedkeys("i\<Esc>", 'xt')
  call append(1, 'Unsynced edit must remain unsynced')
  let g:popup_state = {'state': 'ready', 'ready': v:true,
        \ 'room': {'id': 'A', 'type': 'direct', 'title': 'Selected peer'},
        \ 'rooms': [{'id': 'A', 'type': 'direct'}], 'localContext': {'sessionId': repeat('a', 32)},
        \ 'peopleStatus': {'capability': 'ready', 'roomId': 'A', 'state': 'fresh', 'presence': 'active',
        \ 'customStatus': 'unsupported', 'observedAt': localtime() * 1000, 'displayName': 'Literal peer % | inert'}}
  call s:sync()
  call assert_equal(1, len(s:windows()), 'a selected DM gets its summary without :WebexPeople')
  let popup = s:windows()[0]
  let buffer = winbufnr(popup)
  call assert_false(getbufvar(buffer, '&modifiable'))
  let tick = getbufvar(buffer, 'changedtick')
  for loading in [v:true, v:false]
    let g:popup_state.loading = loading
    call s:sync()
    call assert_equal([popup], s:windows(), 'history polling reuses the existing People window')
    call assert_equal(tick, getbufvar(buffer, 'changedtick'), 'history polling never rewrites unchanged People text')
  endfor
  for [presence, label] in [['DoNotDisturb', 'Do not disturb'], ['inactive', 'Inactive'], ['active', 'Active']]
    let g:popup_state.peopleStatus.presence = presence
    call s:sync()
    call assert_equal([popup], s:windows(), 'status-width changes update the existing window without closing it')
    call assert_equal(buffer, winbufnr(s:windows()[0]))
    call s:draw('Presence ' . label)
  endfor
  let g:popup_state.peopleStatus.lastActivity = '2026-11-24T12:00:00.000Z'
  call s:sync()
  call assert_equal([popup], s:windows(), 'a wider/taller summary reuses the same window and buffer')
  call s:draw('Last activity: 2026-11-24T12:00:00.000Z')
  call remove(g:popup_state.peopleStatus, 'lastActivity')
  call s:sync()
  call assert_equal([popup], s:windows(), 'shrinking the summary never recreates its frame')
  call assert_equal(2, len(getbufline(winbufnr(s:windows()[0]), 1, '$')), 'removed fields leave no old rows')
  let buffer = winbufnr(s:windows()[0]) | let tick = getbufvar(buffer, 'changedtick')
  let height = getwininfo(history)[0].height
  call win_execute(history, 'resize 20')
  call s:sync()
  call assert_equal([popup], s:windows(), 'anchor resize moves the existing popup in place')
  call assert_equal(tick, getbufvar(buffer, 'changedtick'), 'layout-only changes never rewrite the summary')
  call win_execute(history, 'resize ' . height)
  call s:sync()
  call assert_equal([popup], s:windows())
  let g:popup_state.peopleStatus.presence = 'meeting'
  call s:sync()
  call assert_match('In a meeting', join(getbufline(winbufnr(s:windows()[0]), 1, '$'), "\n"))
  call s:draw('Presence In a meeting')
  let popup = s:windows()[0]
  if has('nvim')
    call assert_equal(history, nvim_win_get_config(popup).win)
    call assert_false(nvim_win_get_config(popup).focusable)
    let top = nvim_win_get_position(popup)[0]
  else
    let top = popup_getpos(popup).line
  endif
  call assert_true(wbx#people#obscures(history, top + 1), 'frame/summary covering an endpoint forbids receipt admission')
  call assert_false(wbx#people#obscures(win_getid(), top + 1), 'another split is not an obscured endpoint')
  call s:sync()
  call assert_equal(popup, s:windows()[0], 'unchanged state never recreates the float')

  " Explicit tab navigation is a native input boundary, unlike passive updates.
  call feedkeys("\<Esc>", 'xt')
  let before = s:native()
  tabnew
  call setline(1, 'Unrelated tab work')
  call s:sync()
  call assert_equal([], s:windows())
  tabclose
  call s:sync()
  call assert_equal(before, s:native())
  call assert_equal(1, len(s:windows()), 'returning to the conversation restores passive visibility')
  let popup = s:windows()[0]
  if has('nvim') | call nvim_win_close(popup, v:false)
  else | call popup_close(popup) | endif
  call s:sync()
  call assert_equal([], s:windows(), 'external dismissal is respected for this selection')

  let g:popup_state.localContext.sessionId = repeat('b', 32)
  call s:sync()
  call assert_equal(1, len(s:windows()))
  let popup = s:windows()[0] | let buffer = winbufnr(popup)
  call setbufvar(buffer, '&modifiable', 1)
  call appendbufline(buffer, '$', 'Retained promoted People annotation')
  call setbufvar(buffer, '&modifiable', 0)
  call setbufvar(buffer, '&modified', 0)
  let text = getbufline(buffer, 1, '$')
  let g:popup_state.peopleStatus.presence = 'inactive'
  call s:sync()
  call assert_equal(text, getbufline(buffer, 1, '$'), 'edited/promoted popup text is never repainted or closed')
  call assert_true(wbx#people#obscures(history, top + 1), 'a retained annotated overlay still blocks receipt admission')
  call wbx#people_popup#hide(1)
  let g:popup_state.localContext.sessionId = repeat('d', 32)
  call s:sync()
  call assert_equal([popup], s:windows(), 'session replacement cannot reclaim or duplicate an annotated float')
  call assert_equal(text, getbufline(buffer, 1, '$'))
  call assert_true(wbx#people#obscures(history, top + 1), 'dismissal/session change cannot grant receipts through a retained overlay')
  if has('nvim') | call nvim_win_close(popup, v:false)
  else | call popup_close(popup) | endif
  let g:popup_state.localContext.sessionId = repeat('c', 32)
  call s:sync()
  let g:wbx_tui.people_status = 0
  call s:sync()
  call assert_equal([], s:windows(), 'explicit opt-out closes only the owned float')
  call assert_false(wbx#people#obscures(history, top + 1))
  let g:wbx_tui.people_status = 1
  call s:sync()
  let g:popup_state.peopleStatus.roomId = 'other'
  call s:sync()
  call assert_equal([], s:windows(), 'mismatched peer fields are never displayed')
  let g:popup_state.peopleStatus.roomId = 'A'
  let g:popup_state.state = 'idle'
  call s:sync()
  call assert_equal([], s:windows(), 'disconnect never leaves current-looking presence')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'drawn': s:drawn})], $WBX_EDITOR_RESULT)
qa!
