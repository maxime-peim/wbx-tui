" Count real copy work, including when no spaces window matters. No transport.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile([
      \ 'function! wbx#state() abort', 'let g:viewport_copies += 1', 'return deepcopy(g:viewport_state)', 'endfunction',
      \ 'function! wbx#people_viewport_context() abort', 'let g:viewport_selectors += 1',
      \ 'return {"state":"ready","sessionId":repeat("a",32),"direct":deepcopy(g:viewport_direct)}', 'endfunction',
      \ 'function! wbx#supports_people_spaces() abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_people_viewport() abort', 'return 1', 'endfunction',
      \ 'function! wbx#rpc(method, params) abort', 'call add(g:viewport_requests, deepcopy(a:params))', 'return 1', 'endfunction'],
      \ s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'people_status': 1}
let g:viewport_copies = 0 | let g:viewport_selectors = 0 | let g:viewport_requests = [] | let g:viewport_direct = {}
let g:viewport_state = {'state':'ready','localContext':{'sessionId':repeat('a',32)},'rooms':[],'messages':[]}
for n in range(1, 500)
  let id = 'room-' . n | let g:viewport_direct[id] = 1
  call add(g:viewport_state.rooms, {'id':id,'title':id,'type':'direct'})
  call add(g:viewport_state.messages, {'id':'m-' . n,'author':'Synthetic','text':repeat('text ', 300),
        \ 'images':repeat([{'id':repeat('a',64),'state':'unsupported'}], 3)})
endfor
function! s:turn() abort
  call wbx#people#spaces_schedule()
  let timers = filter(timer_info(), 'string(v:val.callback) =~# "spaces_visible"')
  if !empty(timers)
    call timer_stop(timers[0].id)
    call call(timers[0].callback, [timers[0].id])
  endif
endfunction
let s:work = []
try
  call wbx#supports_people_spaces()
  enew | file unrelated-native-work.txt
  let start = reltime()
  for n in range(60) | call s:turn() | endfor
  call add(s:work, {'case':'hidden','ms':reltimefloat(reltime(start))*1000,'copies':g:viewport_copies,'selectors':g:viewport_selectors})
  call assert_equal(0, g:viewport_copies, 'unrelated cursor/typing does not copy image-rich histories')
  call assert_equal(0, g:viewport_selectors, 'no eligible window means no recurring selector traversal')
  enew | file wbx://spaces
  setlocal buftype=nofile
  let b:wbx_kind = 'rooms'
  call setline(1, map(copy(g:viewport_state.rooms), 'v:val.title'))
  let b:wbx_room_ids = map(copy(g:viewport_state.rooms), 'v:val.id')
  let b:wbx_render_tick = b:changedtick
  redraw!
  let copies = g:viewport_copies
  let start = reltime()
  for n in range(60) | call s:turn() | endfor
  call add(s:work, {'case':'visible','ms':reltimefloat(reltime(start))*1000,'copies':g:viewport_copies-copies,'selectors':g:viewport_selectors})
  call assert_equal(copies, g:viewport_copies, 'visible cursor relevance uses only narrow room/session metadata (outside setup/state hooks)')
  if !empty(g:viewport_requests)
    enew
    call s:turn()
    call assert_equal([], g:viewport_requests[-1].roomIds, 'hiding sends one empty invalidation')
    let selectors = g:viewport_selectors | let requests = len(g:viewport_requests)
    for n in range(60) | call s:turn() | endfor
    call assert_equal(requests, len(g:viewport_requests))
    call assert_equal(selectors, g:viewport_selectors, 'after invalidation hidden views stay idle')
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'work':s:work})], $WBX_EDITOR_RESULT)
qa!
