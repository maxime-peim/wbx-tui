" Optional whole-editor benchmark v1. Synthetic state only; never starts a backend.
let s:startup = reltime()
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 0, 'notifications': 0,
      \ 'read_status': 0, 'people_status': 0, 'upcoming_meetings': 0, 'spaces_cache': 0,
      \ 'mark_read_on_open': 0}
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let s:result = {'version': 1, 'messages': str2nr($WBX_PERF_MESSAGES), 'rooms': 435, 'samples': {}, 'work': {}}
function! s:elapsed(start) abort
  return reltimefloat(reltime(a:start)) * 1000
endfunction
function! s:publish(state) abort
  let a:state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': copy(a:state)})
endfunction
function! s:record(operation, start) abort
  call add(s:result.samples[a:operation], s:elapsed(a:start))
endfunction
function! s:work(operation) abort
  let s:result.work[a:operation] = {}
  for [label, name] in [['projection', 'wbx_render_work'], ['writer', 'wbx_view_work'],
        \ ['syntax', 'wbx_syntax_checks'], ['decorations', 'wbx_decoration_checks']]
    let s:result.work[a:operation][label] = deepcopy(get(b:, name, {}))
  endfor
endfunction
try
  let s:samples = str2nr($WBX_PERF_SAMPLES)
  if index([50, 200, 500], s:result.messages) < 0 || s:samples < 3 || s:samples > 31
    throw 'Invalid bounded performance workload'
  endif
  call wbx#buffers()
  let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . s:sid . '_layout'), [])
  let s:result.startup_runtime_layout_ms = s:elapsed(s:startup)
  let s:state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:true,
        \ 'room': {'id': 'room-1', 'title': 'Synthetic space 1', 'type': 'group'},
        \ 'rooms': [], 'messages': [], 'historyLatest': v:true, 'readStatus': 'off'}
  for s:index in range(1, 435)
    call add(s:state.rooms, {'id': 'room-' . s:index, 'title': 'Synthetic space ' . s:index, 'type': 'group'})
  endfor
  for s:index in range(1, s:result.messages)
    call add(s:state.messages, {'id': 'm-' . s:index, 'author': 'Synthetic',
          \ 'created': '2026-11-01T12:00:00.000Z', 'text': 'Body ' . s:index . "\n**Native Markdown 世界**"})
  endfor
  let s:start = reltime()
  call s:publish(s:state)
  redraw
  let s:result.initial_publish_redraw_ms = s:elapsed(s:start)
  call win_gotoid(win_findbuf(wbx#buffers().history)[0])
  normal! 80Gzt
  redraw!
  for s:operation in ['validation', 'json_roundtrip', 'pure_projection', 'unchanged_redraw',
        \ 'scroll_redraw', 'forced_repaint', 'structural_redraw']
    let s:result.samples[s:operation] = []
  endfor
  " Independent attribution probes. They overlap real receive work; never sum them.
  let s:envelope = {'jsonrpc': '2.0', 'method': 'state', 'params': s:state}
  for s:iteration in range(1, s:samples)
    let s:start = reltime()
    let s:valid = wbx#protocol#valid(s:envelope)
    call s:record('validation', s:start)
    call assert_true(s:valid)
    let s:start = reltime()
    let s:roundtrip = json_decode(json_encode(s:envelope))
    call s:record('json_roundtrip', s:start)
    unlet s:roundtrip
    let s:start = reltime()
    let s:projection = wbx#history#render(s:state.messages, 4)
    call s:record('pure_projection', s:start)
    unlet s:projection
    let s:tick = b:changedtick
    let s:start = reltime()
    call s:publish(s:state)
    redraw
    call s:record('unchanged_redraw', s:start)
    call assert_equal(s:tick, b:changedtick)
    call assert_equal(0, b:wbx_render_work.history, 'unchanged state must reuse its projection')
    call s:work('unchanged_redraw')
    let s:start = reltime()
    execute "normal! \<C-E>"
    redraw
    call s:record('scroll_redraw', s:start)
    let s:start = reltime()
    redraw!
    call s:record('forced_repaint', s:start)
  endfor
  for s:iteration in range(1, s:samples)
    " Prepare distinct valid identities and changed bodies outside the timer.
    let s:state.room = deepcopy(s:state.rooms[s:iteration % 2])
    for s:index in range(0, len(s:state.messages) - 1)
      let s:state.messages[s:index].id = 'replacement-' . s:iteration . '-' . s:index
      let s:state.messages[s:index].text = 'Replacement ' . s:index . "\n**Native Markdown 世界**"
    endfor
    let s:start = reltime()
    call s:publish(s:state)
    redraw
    call s:record('structural_redraw', s:start)
    call assert_equal(1, b:wbx_render_work.history)
    call assert_equal(s:result.messages, len(b:wbx_message_blocks))
    call s:work('structural_redraw')
  endfor
  call assert_false(wbx#transport#running(), 'benchmark must not start any backend')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
let s:result.errors = v:errors
call writefile([json_encode(s:result)], $WBX_EDITOR_RESULT)
qa!
