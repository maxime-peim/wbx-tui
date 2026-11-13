set encoding=utf-8
set hidden
set noswapfile
setglobal statusline=USER-GLOBAL
let &l:statusline = 'USER-LOCAL'
let g:wbx_original_window = win_getid()
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
set cpoptions+=C
let g:wbx_test_cpo = &cpoptions
runtime plugin/wbx.vim
filetype plugin on
syntax enable
augroup wbx_test_filetype
  autocmd!
  autocmd FileType wbx-compose let b:wbx_ft_hook = get(b:, 'wbx_ft_hook', 0) + 1
  autocmd FileType wbx-compose setlocal number
augroup END
let g:wbx_tui = {'demo': 1, 'config': $WBX_CONFIG}
if has('nvim')
  lua require('wbx-tui').setup({demo = true, treesitter = true, picker = 'builtin'})
endif
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
try
  call assert_equal(0, wbx#transport#running(), 'loading plugin never connects')
  call assert_equal(g:wbx_test_cpo, &cpoptions, 'plugin preserves user cpoptions')
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 3')
  call assert_equal(3, winnr('$'), 'native windows')
  let original_location = win_id2tabwin(g:wbx_original_window)
  call assert_equal('USER-LOCAL', gettabwinvar(original_location[0], original_location[1], '&statusline'), 'existing user window is untouched')
  call assert_equal(g:wbx_test_cpo, &cpoptions, 'autoload preserves user cpoptions')
  call assert_equal(v:null, wbx#state().room, 'no implicit destination')
  let buffers = wbx#buffers()
  call assert_true(buffers.rooms > 0 && buffers.history > 0 && buffers.rooms != buffers.history, 'distinct native buffers')
  call assert_equal('nofile', getbufvar(buffers.rooms, '&buftype'))
  call assert_equal('wbx-history', getbufvar(buffers.history, '&filetype'))
  call wbx#select('demo-general')
  call WaitFor('wbx#state().ready')
  WebexCompose
  call assert_equal('demo-general', b:wbx_room)
  call assert_equal(0, &l:swapfile)
  call assert_equal(0, &l:undofile)
  call assert_equal(0, &l:modeline)
  call assert_equal('nofile', &l:buftype)
  call assert_equal('wbx-compose', &l:filetype)
  call assert_equal(1, b:wbx_ft_hook, 'native FileType hook receives composer context')
  call assert_equal(1, &l:number, 'native FileType option applied')
  call assert_true(get(b:, 'current_syntax', '') ==# 'wbx-compose' || has('nvim') && luaeval('vim.treesitter.highlighter.active[vim.api.nvim_get_current_buf()] ~= nil'), 'native syntax or installed Tree-sitter activated')
  let general = bufnr('%')
  enew
  call assert_equal('USER-GLOBAL', &statusline, 'ordinary new buffer inherits native global statusline')
  execute 'buffer ' . general
  call assert_equal('%!wbx#statusline()', &l:statusline, 'native buffer return restores Webex statusline')
  split
  enew
  call assert_equal('USER-GLOBAL', &statusline, 'new native split does not leak Webex status into ordinary files')
  close
  let &l:statusline = 'USER-LATER-OVERRIDE'
  enew
  call assert_equal('USER-GLOBAL', &statusline, 'ordinary files keep native global-local semantics')
  execute 'buffer ' . general
  call assert_equal('USER-LATER-OVERRIDE', get(w:, 'wbx_saved_statusline', ''), 'native buffer-local user override is retained for restoration')
  nnoremap <silent><buffer> <C-s> :let g:wbx_user_mapping = 1<CR>
  enew
  call wbx#select('demo-engineering')
  call WaitFor('get(wbx#state().room, "id", "") ==# "demo-engineering" && wbx#state().ready')
  let hidden_draft = wbx#buffers().drafts['demo-engineering']
  execute 'buffer ' . hidden_draft
  call assert_equal('wbx-compose', &l:filetype, 'native :buffer initializes a previously hidden draft')
  call assert_equal(1, b:wbx_ft_hook)
  call wbx#select('demo-general')
  call WaitFor('get(wbx#state().room, "id", "") ==# "demo-general" && wbx#state().ready')
  call assert_match('wbx_user_mapping', maparg('<C-s>', 'n'), 'native buffer mappings are not reset on every entry')
  execute "normal! iHello 世界 👩🏽‍💻\<CR>second line\<Esc>"
  let text = join(getline(1, '$'), "\n")
  call assert_match('Hello 世界', text)
  call assert_equal(2, len(getline(1, '$')))
  call assert_equal(2, len(wbx#state().messages), 'native editing does not send')
  let &l:undolevels = &l:undolevels
  normal! A!
  let &l:undolevels = &l:undolevels
  undo
  call assert_equal(text, join(getline(1, '$'), "\n"), 'native undo')
  call wbx#select('demo-engineering')
  call WaitFor('get(wbx#state().room, "id", "") ==# "demo-engineering" && wbx#state().ready')
  call assert_equal(text, join(getbufline(general, 1, '$'), "\n"), 'switch retains draft')
  WebexCompose
  call setline(1, 'retained engineering draft')
  let engineering = bufnr('%')
  call wbx#select('demo-general')
  call WaitFor('get(wbx#state().room, "id", "") ==# "demo-general" && wbx#state().ready')
  WebexCompose
  call assert_equal(general, bufnr('%'))
  call assert_equal(1, b:wbx_ft_hook, 'returning does not reload native ftplugins')
  WebexSend
  call WaitFor('len(wbx#state().messages) == 3')
  call assert_equal(text, wbx#state().messages[-1].text)
  call assert_equal([''], getline(1, '$'), 'ACK clears unchanged draft')
  call assert_equal(['retained engineering draft'], getbufline(engineering, 1, '$'))
  " Edit synchronously after submit, before the job callback can ACK.
  call setline(1, 'send before edit')
  WebexSend
  call setline(1, 'keep this newer draft')
  call WaitFor('len(wbx#state().messages) == 4')
  call assert_equal(['keep this newer draft'], getline(1, '$'), 'ACK must not clear newer changes')
  let g:hook_count = 0
  augroup wbx_test_hooks
    autocmd!
    autocmd User WbxState let g:hook_count += 1
  augroup END
  WebexRefresh
  call WaitFor('g:hook_count > 0')
  call wbx#shutdown()
  call assert_equal(0, wbx#transport#running())
  call assert_equal(['keep this newer draft'], getbufline(general, 1, '$'), 'shutdown keeps editor draft')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim', 'version': v:version})], $WBX_EDITOR_RESULT)
qa!
