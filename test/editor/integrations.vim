set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'demo': 1, 'config': $WBX_CONFIG}
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
function! ChooseNative(index) abort
  let picker = popup_list()[0]
  for _ in range(a:index - 1) | call popup_filter_menu(picker, 'j') | endfor
  call popup_filter_menu(picker, "\<CR>")
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  if has('nvim')
    execute 'luafile ' . fnameescape($WBX_EDITOR_ROOT . '/test/editor/integrations.lua')
  else
    execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT . '/test/editor/fixtures')
    let g:wbx_tui.picker = 'auto'
    WebexPickSpace
    call WaitFor('type(wbx#state().room) == v:t_dict && get(wbx#state().room, "id", "") ==# "demo-engineering" && wbx#state().ready')
    call assert_equal(1, g:wbx_fixture_fzf_calls)
    call assert_equal('40%', g:wbx_fixture_fzf_options.down)
    call assert_equal(3, len(g:wbx_fixture_fzf_options.source))
    let g:wbx_tui.picker = 'builtin'
    let index = index(map(wbx#state().rooms, 'v:val.id'), 'demo-general') + 1
    WebexPickSpace
    call ChooseNative(index)
    call WaitFor('get(wbx#state().room, "id", "") ==# "demo-general" && wbx#state().ready')
    call assert_equal(1, g:wbx_fixture_fzf_calls, 'builtin picker ignores optional fzf')
    let g:wbx_tui.picker = 'auto'
    let g:wbx_fixture_fzf_fail = 1
    let index = index(map(wbx#state().rooms, 'v:val.id'), 'demo-alex') + 1
    WebexPickSpace
    call ChooseNative(index)
    call WaitFor('get(wbx#state().room, "id", "") ==# "demo-alex" && wbx#state().ready')
    call assert_equal(2, g:wbx_fixture_fzf_calls)
    call assert_notmatch('synthetic-fzf-error-canary', execute('messages'), 'optional dependency errors are not printed')
  endif
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
