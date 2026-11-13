" Local explicit file consumers only. No retry, owner replacement or meeting policy.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#local_job#stop(job) abort
  if has('nvim')
    if type(a:job) == v:t_number && a:job > 0 | silent! call jobstop(a:job) | endif
  elseif type(a:job) == v:t_job && job_status(a:job) ==# 'run'
    silent! call job_stop(a:job)
  endif
endfunction
function! wbx#local_job#close_input(job) abort
  if has('nvim')
    if type(a:job) == v:t_number && a:job > 0 | silent! call chanclose(a:job, 'stdin') | endif
  elseif type(a:job) == v:t_job
    silent! call ch_close_in(job_getchannel(a:job))
  endif
endfunction
function! wbx#local_job#release(owner) abort
  " Caller invalidates its generation first. Never consult a replaceable owner.
  call wbx#local_job#stop(get(a:owner, 'viewer', 0))
  call wbx#local_job#close_input(get(a:owner, 'lease', 0))
endfunction
function! wbx#local_job#viewer(argv, nvim_exit, vim_exit) abort
  return has('nvim') ? jobstart(a:argv, {'on_exit': a:nvim_exit, 'stdin': 'null'})
        \ : job_start(a:argv, {'exit_cb': a:vim_exit, 'in_io': 'null', 'out_io': 'null', 'err_io': 'null'})
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
