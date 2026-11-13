set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'demo': 1, 'backend': [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs']}
let g:wbx_injected = 0
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression)
      return
    endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! OpenFixture() abort
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select('fixture-room')
  call WaitFor('wbx#state().ready')
  WebexCompose
endfunction
try
  call OpenFixture()
  call assert_equal('Unicode 世界 👩🏽‍💻 | let g:wbx_injected = 1', wbx#state().room.title, 'fragmented UTF-8 preserved')
  call assert_equal(0, g:wbx_injected, 'remote titles never execute Ex')
  call setline(1, 'unknown')
  WebexSend
  call WaitFor('len(readfile($WBX_EDITOR_AUDIT)) == 1')
  sleep 50m
  WebexSend
  sleep 50m
  call assert_equal(1, len(readfile($WBX_EDITOR_AUDIT)), 'unknown delivery blocks retry')
  call assert_equal(['unknown'], getline(1, '$'))
  call wbx#shutdown()
  call OpenFixture()
  WebexSend
  sleep 50m
  call assert_equal(1, len(readfile($WBX_EDITOR_AUDIT)), 'unknown delivery survives backend restart')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call setline(1, 'resolved explicit send')
  WebexSend
  call WaitFor('getline(1) ==# ""')
  call assert_equal(2, len(readfile($WBX_EDITOR_AUDIT)))
  call setline(1, 'crash')
  WebexSend
  call WaitFor('!wbx#transport#running()')
  call assert_equal(['crash'], getline(1, '$'), 'crash retains draft')
  call OpenFixture()
  WebexSend
  sleep 50m
  call assert_equal(3, len(readfile($WBX_EDITOR_AUDIT)), 'pending send at crash is never automatically retried')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call setline(1, 'after crash explicit send')
  WebexSend
  call WaitFor('getline(1) ==# ""')
  call assert_equal(4, len(readfile($WBX_EDITOR_AUDIT)))
  call setline(1, 'disconnect')
  WebexSend
  WebexDisconnect
  call WaitFor('wbx#state().state ==# "idle"')
  call OpenFixture()
  WebexSend
  sleep 50m
  call assert_equal(5, len(readfile($WBX_EDITOR_AUDIT)), 'disconnect during delivery blocks an unchecked retry')
  call assert_equal(['disconnect'], getline(1, '$'), 'disconnect retains pending draft')
  WebexResolveDelivery
  call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
  call setline(1, 'resolved after messaging disconnect')
  WebexSend
  call WaitFor('getline(1) ==# ""')
  call assert_equal(6, len(readfile($WBX_EDITOR_AUDIT)), 'disconnect releases pending admission for an explicitly resolved send')
  call setline(1, 'retained on malformed transport')
  let draft = bufnr('%')
  call wbx#shutdown()
  call add(g:wbx_tui.backend, 'malformed')
  WebexDemo
  call WaitFor('!wbx#transport#running()')
  call assert_equal(0, g:wbx_injected, 'malformed stdout never executes Ex')
  call assert_equal(['retained on malformed transport'], getbufline(draft, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'state': wbx#state(), 'messages': execute('messages'), 'buffer': bufname('%')})], $WBX_EDITOR_RESULT)
qa!
