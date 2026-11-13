" Add the checkout to runtimepath using your package manager or native packages.
" Node engine: npm ci && npm run build
let g:wbx_tui = {
      \ 'mappings': 1,
      \ 'send_with_ctrl_s': 0,
      \ 'statusline': 0,
      \ 'rooms_width': 32,
      \ 'compose_height': 8,
      \ 'picker': 'builtin',
      \ 'meeting': {'display': 'auto', 'fallback': 'editor', 'leave_on_exit': 0},
      \ }

nmap <leader>wo <Plug>(WebexOpen)
nmap <leader>wc <Plug>(WebexCompose)
" Native mappings: nothing is sent by Enter, :write, editing or leaving Insert.
augroup my_webex_buffers
  autocmd!
  autocmd FileType wbx-compose nmap <buffer> <leader>ws <Plug>(WebexSend)
  autocmd FileType wbx-compose,wbx-history setlocal wrap linebreak spell
augroup END

" Keep your own colorscheme, statusline and native editing configuration.
" A statusline component is wbx#status(). No connection starts here.
" OAuth and clientSecret belong only in the private engine JSON, not this file.
