set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'config': $WBX_CONFIG, 'meeting': {'display': 'editor', 'headless_demo': 1, 'leave_on_exit': 1, 'call_id': 'exit-active'}}
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
  WebexMeetingDemo
  call WaitFor('wbx#meeting_state().ready')
  call wbx#shutdown()
  call assert_equal(0, wbx#transport#running())
  call WaitFor('stridx(Tmux("has-session -t wbx-exit-active"), "find session") >= 0')
  " Exit before hello/start callbacks finish. Explicit leave-on-exit must cancel
  " a queued/in-progress launch, not detach and create an orphan call later.
  let g:wbx_tui.meeting.call_id = 'exit-pending'
  WebexMeetingDemo
  call wbx#shutdown()
  call assert_equal(0, wbx#transport#running())
  call assert_match('find session', Tmux('has-session -t wbx-exit-pending'))
  " The actual VimLeavePre hook, not just a direct shutdown call, must honor it.
  let g:wbx_tui.meeting.call_id = 'exit-on-qa'
  WebexMeetingDemo
  call WaitFor('wbx#meeting_state().ready')
  let g:wbx_exit_owner = Tmux('show-options -qv -t wbx-exit-on-qa @wbx_media_pid')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'exit_session': 'wbx-exit-on-qa', 'exit_owner': get(g:, 'wbx_exit_owner', '')})], $WBX_EDITOR_RESULT)
qa!
