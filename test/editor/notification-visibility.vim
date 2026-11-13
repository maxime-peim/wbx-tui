" Display-only notification visibility; real private windows, no provider/RPC.
set nocompatible encoding=utf-8 hidden noswapfile lines=40 columns=100
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:nc_state)', 'endfunction',
      \ 'function! wbx#rpc(...) abort', 'throw "Unexpected provider request"', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'notifications': {'preview': 0, 'meetings': 0}}
let s:room = {'id': 'visibility-room', 'title': 'Synthetic', 'type': 'direct'}
let g:nc_state = {'state': 'ready', 'ready': v:true, 'room': s:room, 'rooms': [s:room],
      \ 'messages': [], 'peopleStatus': {'capability': 'scope-required', 'state': 'unavailable',
      \ 'presence': 'unknown', 'customStatus': 'unsupported', 'requiredScope': 'spark:people_read'}}
function! s:queued() abort
  call wbx#notifications#stop()
  call wbx#notifications#start()
  let state = deepcopy(g:nc_state)
  let state.messages = [{'id': 'baseline', 'text': 'Old', 'created': '2026-11-11T11:00:00Z'}]
  call wbx#notifications#observe(state)
  call add(state.messages, {'id': 'latest', 'text': 'Body', 'created': '2026-11-11T12:00:00Z'})
  call wbx#notifications#observe(state)
  return wbx#notifications#status().queued
endfunction
function! s:body(lines) abort
  call setline(1, ['# Synthetic', ''] + a:lines + [''])
  if line('$') > len(a:lines) + 3 | execute (len(a:lines) + 4) . ',$delete _' | endif
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = [{'id': 'latest', 'body': 3, 'end': line('$')}]
  let b:wbx_history_complete = 1
  normal! ggzt
  redraw!
endfunction
try
  enew
  file wbx://history
  setlocal buftype=nofile wrap
  let b:wbx_kind = 'history'
  let b:wbx_history_room = s:room.id
  call s:body(['Body'])
  call wbx#people#sync(g:nc_state)
  redraw!
  let positive = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
  call assert_equal(positive ? 0 : 1, s:queued(), 'passive People status no longer overlays an actually drawn endpoint')
  let history=win_getid()
  call assert_equal(positive,wbx#view#endpoint('latest'))
  call wbx#people#show()
  redraw!
  call assert_false(wbx#view#endpoint('latest'),'People details cannot become a history receipt endpoint')
  call assert_equal('wbx://people-details',bufname('%'))
  call assert_false(wbx#people#obscures(history,1),'native details never overlay the independent history window')
  call assert_equal(1, s:queued(), 'a focused People snapshot is not focused history and cannot suppress its alert')
  call wbx#lists#close()
  call assert_equal(history,win_getid())
  redraw!
  call assert_equal(positive ? 0 : 1, s:queued(), 'returning to drawn, complete history restores notification visibility')
  setlocal foldmethod=manual
  call s:body(['First', 'Second', 'Hidden third', 'Hidden fourth', 'Last'])
  5,6fold
  redraw!
  call assert_equal(1, s:queued(), 'a nested body fold cannot hide content while notifications claim it was visible')
  normal! zE
  call s:body([repeat('wrapped body ', 500)])
  call assert_equal(1, s:queued(), 'a clipped final wrapped screen row cannot suppress an alert')
  call assert_equal(0, wbx#notifications#status().submitted.editor, 'fixture only tests queued events, never external delivery')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#notifications#stop()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
