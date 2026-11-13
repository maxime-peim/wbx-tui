set nocompatible encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
try
  enew
  file wbx://compose/room
  setlocal buftype=nofile omnifunc=UserOmni completefunc=UserComplete complete=.,w,b
  let b:wbx_kind = 'compose' | let b:wbx_room = 'room' | let b:completion = v:true
  let original = [getline(1, '$'), undotree(), b:changedtick]
  if has('nvim')
lua << EOF
    local enabled = true
    vim.g.cmp_buffer_calls = {}
    package.loaded.cmp = { get_config = function() return { enabled = enabled } end,
      setup = { buffer = function(opts)
        enabled = opts.enabled
        local calls = vim.g.cmp_buffer_calls
        calls[#calls + 1] = { buf = vim.api.nvim_get_current_buf(), enabled = opts.enabled }
        vim.g.cmp_buffer_calls = calls
      end } }
EOF
  endif
  call wbx#completion#sync()
  call assert_equal(['.,w,b', 'UserOmni', 'UserComplete'], [&l:complete, &l:omnifunc, &l:completefunc], 'manual native completion stays available by default')
  call assert_false(b:completion)
  call assert_false(b:blink_cmp_enabled)
  call assert_equal(1, b:coc_suggest_disable)
  if has('nvim') | call assert_false(g:cmp_buffer_calls[-1].enabled) | endif
  let &l:omnifunc = 'LateMarkdownHook'
  let &l:complete = '.'
  setlocal filetype=markdown
  call assert_equal('LateMarkdownHook', &l:omnifunc, 'manual function settings belong to the user/ftplugin')
  call assert_equal('.', &l:complete)
  call assert_equal(original, [getline(1, '$'), undotree(), b:changedtick], 'completion policy never rewrites draft text/undo')
  let b:wbx_completion_policy = 'user'
  call wbx#completion#sync()
  call assert_true(b:completion, 'explicit opt-out restores only our automatic-provider suppression')
  if has('nvim') | call assert_true(g:cmp_buffer_calls[-1].enabled) | endif
  let b:wbx_completion_policy = 'off'
  call wbx#completion#sync()
  call assert_equal(['', '', ''], [&l:complete, &l:omnifunc, &l:completefunc], 'strict suppression remains an explicit policy')
  let b:wbx_completion_policy = 'manual'
  call wbx#completion#sync()
  call assert_equal(['.', 'LateMarkdownHook', 'UserComplete'], [&l:complete, &l:omnifunc, &l:completefunc])
  execute 'file ' . fnameescape($WBX_EDITOR_RESULT . '.ordinary.md')
  setlocal buftype=
  call assert_equal(['.', 'LateMarkdownHook', 'UserComplete'], [&l:complete, &l:omnifunc, &l:completefunc], 'promotion retains later manual choices')
  call assert_true(b:completion)
  call assert_false(exists('b:blink_cmp_enabled'))
  if has('nvim') | call assert_true(g:cmp_buffer_calls[-1].enabled) | endif
  for kind in ['compose', 'reply', 'edit']
    enew
    if kind ==# 'edit'
      file wbx://edit/synthetic
      let b:wbx_message_context = {'contextId':'synthetic'}
    else
      let b:wbx_kind = 'compose' | let b:wbx_room = 'room' | let b:wbx_parent = kind ==# 'reply' ? 'root' : ''
      execute 'file ' . wbx#view#compose_name('room', b:wbx_parent)
    endif
    setlocal buftype=nofile complete=.
    call wbx#completion#sync()
    call setline(1,'alphabet al')
    call feedkeys("A\<C-n>\<C-y>\<Esc>",'xt')
    call assert_equal('alphabet alphabet',getline(1),kind . ': Ctrl-N is ordinary local word completion')
    let local_choice = [&l:complete, &l:omnifunc, &l:completefunc]
    call wbx#completion#sync()
    call assert_equal(local_choice,[&l:complete, &l:omnifunc, &l:completefunc],kind . ': re-entry retains native choices')
    call assert_false(wbx#transport#running(),'manual completion never starts a backend')
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
