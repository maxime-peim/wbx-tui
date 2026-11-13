set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'demo': 1, 'config': $WBX_CONFIG, 'meeting': {'display': 'editor', 'headless_demo': 1, 'call_id': 'editor-test'}}
let g:wbx_editor_renderer = ''
augroup wbx_editor_presentation_test
  autocmd!
  autocmd User WbxMeetingEvent if get(g:wbx_tui_event, 'type', '') ==# 'presentation' | let g:wbx_editor_renderer = g:wbx_tui_event.renderer | endif
augroup END
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
function! OwnerScreen() abort
  let pane = Tmux('show-options -qv -t wbx-editor-test @wbx_media_pane')
  return Tmux('capture-pane -p -t ' . shellescape(pane))
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call WaitFor('wbx#state().ready')
  WebexCompose
  call setline(1, 'draft survives meeting views')
  let draft = bufnr('%')
  WebexMeeting
  call WaitFor('wbx#meeting_state().ready')
  call WaitFor('len(split(Tmux("list-panes -t wbx-editor-test -F \"#{pane_pid}\""), "\n")) == 4')
  let owner = Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid')
  call assert_equal('C-a', Tmux('show-options -Aqv -t wbx-editor-test prefix'), 'user tmux prefix inherited')
  call assert_equal('USER-TMUX #S', Tmux('show-options -Aqv -t wbx-editor-test status-left'), 'user status-left inherited')
  call assert_equal('RIGHT #H', Tmux('show-options -Aqv -t wbx-editor-test status-right'), 'user status-right inherited')
  call assert_equal('fg=#13ab9c,bg=#101010', Tmux('show-options -Aqv -t wbx-editor-test status-style'), 'user status theme inherited')
  call assert_equal('bottom', Tmux('show-options -wAqv -t wbx-editor-test pane-border-status'), 'user border position inherited')
  call assert_equal('USER #{pane_title}', Tmux('show-options -wAqv -t wbx-editor-test pane-border-format'), 'user border format inherited')
  call assert_equal('fg=#ab12cd', Tmux('show-options -wAqv -t wbx-editor-test pane-active-border-style'), 'user border colors inherited')
  let processes = Tmux('list-panes -t wbx-editor-test -F "#{pane_id}|#{pane_pid}|#{@wbx_source}"')
  for entry in split(processes, "\n")
    let fields = split(entry, '|')
    let log = $WBX_EDITOR_LOG_DIR . '/' . fields[2] . '.log'
    call Tmux('pipe-pane -O -t ' . shellescape(fields[0]) . ' ' . shellescape('cat > ' . shellescape(log)))
  endfor
  call assert_match('^\d\+$', owner)
  call assert_equal('terminal', &l:buftype)
  call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "1"')
  tabprevious
  let workspace_window = win_getid()
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'meeting', 'params': wbx#meeting_state()})
  call assert_equal(workspace_window, win_getid(), 'readiness notifications do not steal focus from native messaging')
  WebexMeetingEditor
  call assert_equal('terminal', &l:buftype, 'explicit presentation focuses the existing terminal across tabs')
  sleep 100m
  call assert_equal('1', Tmux('display-message -p -t wbx-editor-test "#{session_attached}"'), 'no duplicate editor client')
  call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'))
  if $WBX_KITTY_TEST ==# '1'
    WebexMeetingKitty
    call WaitFor('Tmux("list-clients -t wbx-editor-test -F \"#{client_termname}\"") =~# "kitty"')
    call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "1"')
    call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'), 'Kitty keeps owner')
    " The native status line can be clipped in a narrow participant pane.
    " Check the owner's explicit event; final metrics still require real ACKs
    " from every participant/share pane before this fixture can pass.
    call WaitFor('g:wbx_editor_renderer ==# "kitty"')
    sleep 1800m
    call assert_notmatch('PAUSED', OwnerScreen())
    WebexMeetingEditor
    call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "1" && &l:buftype ==# "terminal"')
    call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'), 'return keeps owner')
    call assert_equal(processes, Tmux('list-panes -t wbx-editor-test -F "#{pane_id}|#{pane_pid}|#{@wbx_source}"'), 'presentation retains every native pane process')
    " Do not let the slower executable check for an old Kitty request overtake
    " the most recent explicit editor request.
    WebexMeetingKitty
    WebexMeetingEditor
    sleep 500m
    call assert_equal('editor', wbx#meeting_state().display, 'latest presentation wins across async checks')
    call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "1"')
    call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'))
  endif
  " Wiping the meeting terminal disconnects only its tmux client.
  bwipeout!
  call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "0"')
  call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'))
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'meeting', 'params': wbx#meeting_state()})
  sleep 100m
  call assert_equal('0', Tmux('display-message -p -t wbx-editor-test "#{session_attached}"'), 'late state notification does not reopen a manually closed view')
  WebexMeetingEditor
  call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "1"')
  call Tmux('detach-client -s wbx-editor-test')
  call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "0"')
  sleep 100m
  WebexMeetingEditor
  call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "1"')
  call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'), 'reattach replaces an exited tmux client without rejoining')
  call assert_equal(['draft survives meeting views'], getbufline(draft, 1, '$'))
  call wbx#shutdown()
  call WaitFor('Tmux("display-message -p -t wbx-editor-test \"#{session_attached}\"") ==# "0"')
  call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'), 'editor exit detaches, does not leave')
  " New backend discovers the existing call; it must not create another owner.
  WebexMeeting
  call WaitFor('wbx#meeting_state().ready')
  call assert_equal(owner, Tmux('show-options -qv -t wbx-editor-test @wbx_media_pid'), 'reconnect reuses tmux owner')
  WebexMicrophone
  WebexCamera
  WebexShare
  sleep 100m
  call assert_notmatch('mic ON\|cam ON\|share ON', Tmux('capture-pane -p -t wbx-editor-test'), 'demo never transmits')
  WebexLeave
  call WaitFor('!wbx#meeting_state().active')
  call WaitFor('stridx(Tmux("has-session -t wbx-editor-test"), "find session") >= 0')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'processes': get(g:, 'processes', '')})], $WBX_EDITOR_RESULT)
call wbx#shutdown()
qa!
