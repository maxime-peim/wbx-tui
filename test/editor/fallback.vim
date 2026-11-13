set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'config': $WBX_CONFIG, 'meeting': {'display': 'auto', 'fallback': 'editor', 'headless_demo': 1, 'call_id': 'fallback-test'}}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 12
    if eval(a:expression)
      return
    endif
    sleep 20m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! Tmux(args) abort
  return trim(system('tmux -S ' . shellescape($WBX_TMUX_SOCKET) . ' ' . a:args))
endfunction
try
  " Test runner provides an executable Kitty that exits locally with status 1.
  " This exercises launch failure, not just an unavailable executable/display.
  WebexMeetingDemo
  call WaitFor('wbx#meeting_state().ready && wbx#meeting_state().display ==# "editor" && &l:buftype ==# "terminal"')
  call WaitFor('Tmux("display-message -p -t wbx-fallback-test \"#{session_attached}\"") ==# "1"')
  let owner = Tmux('show-options -qv -t wbx-fallback-test @wbx_media_pid')
  call assert_match('^\d\+$', owner)
  let g:wbx_tui.meeting.fallback = 'error'
  WebexMeetingDemo
  call WaitFor('wbx#meeting_state().display ==# "kitty"')
  sleep 200m
  call assert_equal('kitty', wbx#meeting_state().display, 'disabled fallback does not silently attach editor')
  call WaitFor('Tmux("display-message -p -t wbx-fallback-test \"#{session_attached}\"") ==# "0"')
  WebexMeetingEditor
  call WaitFor('wbx#meeting_state().display ==# "editor" && &l:buftype ==# "terminal"')
  call assert_equal(owner, Tmux('show-options -qv -t wbx-fallback-test @wbx_media_pid'), 'explicit recovery retains owner')
  WebexLeave
  call WaitFor('!wbx#meeting_state().active')
  call WaitFor('stridx(Tmux("has-session -t wbx-fallback-test"), "find session") >= 0')
  " No terminal/permission UI yet: the owner is still waiting for Kitty.
  " Insert unrelated work before it. Emergency leave must target the recorded
  " owner, never the first pane, and must preserve that unrelated work.
  let g:wbx_tui.meeting.headless_demo = 0
  WebexMeetingDemo
  call WaitFor('wbx#meeting_state().active && !wbx#meeting_state().ready')
  let foreign = split(Tmux('split-window -b -d -t wbx-fallback-test -P -F "#{pane_id}|#{pane_pid}" "exec sleep 30"'), '|')
  let g:wbx_foreign_pane = foreign[0]
  call assert_equal(2, len(foreign))
  WebexLeave
  call WaitFor('!wbx#meeting_state().active')
  call WaitFor('Tmux("list-panes -t wbx-fallback-test -F \"#{pane_id}\"") ==# g:wbx_foreign_pane')
  call assert_equal(foreign[1], Tmux('display-message -p -t ' . foreign[0] . ' "#{pane_pid}"'), 'startup cancellation preserves unrelated pane/process')
  WebexMeetingDemo
  sleep 300m
  call assert_false(wbx#meeting_state().active, 'stale metadata cannot revive a dead call owner')
  call assert_equal(foreign[1], Tmux('display-message -p -t ' . foreign[0] . ' "#{pane_pid}"'), 'reopen refuses to replace unrelated retained work')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
call wbx#shutdown()
qa!
