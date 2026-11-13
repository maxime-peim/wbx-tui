" Interactive demo capture only. No Webex account, message send or device access.
set encoding=utf-8 hidden noswapfile termguicolors laststatus=2 showtabline=2
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
syntax enable
filetype plugin on
if has('nvim')
  colorscheme habamax
else
  colorscheme desert
endif
augroup wbx_showcase
  autocmd!
  autocmd FileType wbx-history,wbx-compose setlocal number relativenumber wrap linebreak
augroup END
let g:wbx_tui = {'demo': 1, 'config': $WBX_CONFIG, 'rooms_width': 32, 'compose_height': 9}
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
WebexDemo
call WaitFor('len(wbx#state().rooms) == 3')
call wbx#select('demo-general')
call WaitFor('wbx#state().ready')
WebexCompose
call setline(1, ['This is a native ' . (has('nvim') ? 'Neovim' : 'Vim') . ' buffer.', 'Unicode draft: 世界 👩🏽‍💻', '',
      \ 'Undo, visual selections, registers and splits are yours.', 'This draft has NOT been sent.'])
normal! gg
redraw!
call writefile(['ready'], $WBX_EDITOR_READY)
sleep 6
call wbx#shutdown()
qa!
