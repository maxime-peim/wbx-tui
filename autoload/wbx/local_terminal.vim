" Guarded explicit terminal construction, with ownership supplied by the caller.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#local_terminal#open(argv, options) abort
  let previous = bufnr('$')
  belowright new
  if !call(a:options.Valid, []) || bufnr('%') <= previous || !empty(bufname('%'))
        \ || &buftype !=# '' || &modified || line('$') != 1 || getline(1) !=# ''
    throw 'Terminal window changed by an editor hook; its buffer was preserved.'
  endif
  let buffer = bufnr('%')
  let window = win_getid()
  let tick = b:changedtick
  let hidden = &l:bufhidden
  call setbufvar(buffer, a:options.marker, a:options.serial)
  setlocal noswapfile noundofile nomodeline bufhidden=wipe
  if !call(a:options.Valid, []) || bufnr('%') != buffer || win_getid() != window
        \ || !empty(bufname('%')) || &buftype !=# '' || b:changedtick != tick || &modified || line('$') != 1 || getline(1) !=# ''
    if getbufvar(buffer, a:options.marker, -1) == a:options.serial && getbufvar(buffer, '&bufhidden') ==# 'wipe'
      call setbufvar(buffer, '&bufhidden', hidden)
    endif
    throw 'Terminal launch canceled by an editor hook; its buffer was preserved.'
  endif
  if has('nvim')
    call call(a:options.Bind, [buffer])
    let job = termopen(a:argv, {'on_exit': a:options.nvim_exit})
  else
    " term_start() replaces the prepared blank buffer. Bind only the returned one.
    let buffer = term_start(a:argv, {'curwin': 1, 'exit_cb': a:options.vim_exit})
    let job = buffer > 0 ? term_getjob(buffer) : 0
  endif
  if !call(a:options.Valid, [])
    call wbx#local_job#stop(job)
    throw 'Terminal owner changed during launch.'
  endif
  if buffer > 0
    call call(a:options.Bind, [buffer])
    call setbufvar(buffer, a:options.marker, a:options.serial)
    for [name, value] in [['&swapfile', 0], ['&undofile', 0], ['&modeline', 0], ['&bufhidden', 'wipe']]
      call setbufvar(buffer, name, value)
    endfor
  endif
  return {'job': job, 'buffer': buffer}
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
