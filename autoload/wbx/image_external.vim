" A single explicit external viewer with a private file lease; no shell strings.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:helper = fnamemodify(expand('<sfile>:p'), ':h:h:h') . '/scripts/image-lease.mjs'
let s:serial = 0
let s:active = {}

function! s:notice(text) abort
  echohl WbxWarning
  echomsg '[wbx-tui] ' . a:text
  echohl None
endfunction
function! wbx#image_external#stop() abort
  let previous = s:active
  let s:active = {}
  if empty(previous) | return | endif
  call wbx#local_job#release(previous)
endfunction
function! s:viewer_exit(serial, code) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  call wbx#image_external#stop()
  if a:code != 0 | call s:notice('External image viewer exited unsuccessfully; temporary preview released.') | endif
endfunction
function! s:nvim_exit(serial, job, code, event) abort
  call s:viewer_exit(a:serial, a:code)
endfunction
function! s:vim_exit(serial, job, code) abort
  call s:viewer_exit(a:serial, a:code)
endfunction
function! s:terminal_valid(serial, context) abort
  return get(s:active, 'serial', -1) == a:serial && wbx#attachments#config(a:context) && wbx#attachment_valid(a:context)
endfunction
function! s:terminal_bind(serial, buffer) abort
  if get(s:active, 'serial', -1) == a:serial | let s:active.buffer_view = a:buffer | endif
endfunction
function! s:lease_exit(serial, ...) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  call wbx#image_external#stop()
  call s:notice('External image preview lease ended or could not be created.')
endfunction
function! s:ready(serial, text) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  if get(s:active, 'launched', 0) | return | endif
  let origin = s:active
  if win_getid() != origin.window || bufnr('%') != origin.buffer
        \ || get(b:, 'wbx_history_room', '') !=# origin.room || get(b:, 'wbx_kind', '') !=# origin.kind
         \ || line('.') != origin.row || wbx#view#edited(origin.buffer)
         \ || !wbx#attachments#config(get(origin, 'context', {})) || !wbx#attachment_valid(get(origin, 'context', {}))
        \ || origin.kind ==# 'image' && get(get(b:, 'wbx_view_image', {}), 'id', '') !=# origin.image
    call wbx#image_external#stop()
    return
  endif
  try
    let result = json_decode(a:text)
    if type(result) != v:t_dict || type(get(result, 'path', 0)) != v:t_string || !filereadable(result.path) | throw 'Invalid lease' | endif
    let argv = copy(origin.argv) + [result.path]
    let s:active.launched = 1
    if origin.terminal
      let launched = wbx#local_terminal#open(argv, {'marker': 'wbx_image_external', 'serial': a:serial,
            \ 'Valid': function('s:terminal_valid', [a:serial, get(origin, 'context', {})]), 'Bind': function('s:terminal_bind', [a:serial]),
            \ 'nvim_exit': function('s:nvim_exit', [a:serial]), 'vim_exit': function('s:vim_exit', [a:serial])})
      let job = launched.job
    else
      let job = wbx#local_job#viewer(argv, function('s:nvim_exit', [a:serial]), function('s:vim_exit', [a:serial]))
    endif
    if has('nvim') ? job <= 0 : type(job) != v:t_job || job_status(job) ==# 'fail' | throw 'Viewer unavailable' | endif
    if get(s:active, 'serial', -1) != a:serial
      call wbx#local_job#stop(job)
      return
    endif
    let s:active.viewer = job
  catch
    " A hook may have replaced this request; never release the replacement lease.
    if get(s:active, 'serial', -1) == a:serial | call wbx#image_external#stop() | endif
    call s:notice('Could not open the configured image viewer. Check image_viewer argv/terminal settings.')
  endtry
endfunction
function! s:nvim_data(serial, job, data, event) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let s:active.output .= join(a:data, "\n")
  if strlen(s:active.output) > 4096 | call wbx#image_external#stop() | return | endif
  if stridx(s:active.output, "\n") >= 0 | call s:ready(a:serial, split(s:active.output, "\n")[0]) | endif
endfunction
function! s:vim_data(serial, channel, text) abort
  call s:ready(a:serial, a:text)
endfunction
function! wbx#image_external#validate() abort
  let config = get(get(g:, 'wbx_tui', {}), 'image_viewer', {})
  let argv = type(config) == v:t_dict ? get(config, 'argv', []) : []
  let terminal = type(config) == v:t_dict ? get(config, 'terminal', 0) : 0
  if type(argv) != v:t_list || empty(argv) || len(argv) > 32
        \ || !empty(filter(copy(argv), 'type(v:val) != v:t_string || empty(v:val) || strlen(v:val) > 4096 || v:val =~# "[\x00-\x1f\x7f]"'))
        \ || !executable(argv[0]) || !executable('node') || index([v:t_bool, v:t_number], type(terminal)) < 0
        \ || type(terminal) == v:t_number && index([0, 1], terminal) < 0
    throw 'Configure image_viewer = {argv: [executable, arguments...], terminal: true/false}; no shell strings or automatic opener.'
  endif
  let terminal = !!terminal
  if terminal && !has('nvim') && !has('terminal') | throw 'This editor has no terminal support.' | endif
  if !empty(s:active) | throw 'An external image viewer is already active. Close it before opening another.' | endif
  return {'argv': copy(argv), 'terminal': terminal}
endfunction
function! wbx#image_external#open(image, ...) abort
  let config = wbx#image_external#validate()
  let s:serial += 1
  let serial = s:serial
  let s:active = {'serial': serial, 'argv': config.argv, 'terminal': config.terminal, 'output': '', 'image': a:image.id, 'row': line('.'),
        \ 'window': win_getid(), 'buffer': bufnr('%'), 'room': get(b:, 'wbx_history_room', ''), 'kind': get(b:, 'wbx_kind', '')}
  if a:0 | let s:active.context = a:1 | endif
  if a:0 >= 2
    try
      let s:active.lease = wbx#attachment_stream#commit('lease', '', function('s:ready', [serial]), function('s:lease_exit', [serial]))
    catch
      call wbx#image_external#stop()
      call wbx#attachment_stream#stop()
      throw v:exception
    endtry
    return
  elseif type(a:image.png) == v:t_dict
    try
      let s:active.lease = wbx#attachment_stream#snapshot(a:image, function('s:ready', [serial]), function('s:lease_exit', [serial]), function('s:snapshot_valid', [serial]))
    catch
      call wbx#image_external#stop()
      throw v:exception
    endtry
    return
  endif
  let command = [exepath('node'), s:helper]
  if has('nvim')
    let job = jobstart(command, {'on_stdout': function('s:nvim_data', [serial]), 'on_exit': function('s:lease_exit', [serial])})
    let s:active.lease = job
    if job <= 0 | call wbx#image_external#stop() | throw 'Could not create a private image lease.' | endif
    call chansend(job, json_encode(a:image.png) . "\n")
  else
    let job = job_start(command, {'out_mode': 'nl', 'out_cb': function('s:vim_data', [serial]), 'exit_cb': function('s:lease_exit', [serial]), 'err_io': 'null'})
    let s:active.lease = job
    if job_status(job) ==# 'fail' | call wbx#image_external#stop() | throw 'Could not create a private image lease.' | endif
    call ch_sendraw(job_getchannel(job), json_encode(a:image.png) . "\n")
  endif
endfunction
function! s:snapshot_valid(serial) abort
  if get(s:active, 'serial', -1) != a:serial | return 0 | endif
  let origin = s:active
  return win_getid() == origin.window && bufnr('%') == origin.buffer && line('.') == origin.row
        \ && get(b:, 'wbx_history_room', '') ==# origin.room && get(b:, 'wbx_kind', '') ==# origin.kind && !wbx#view#edited(origin.buffer)
        \ && wbx#attachments#config(get(origin, 'context', {})) && wbx#attachment_valid(get(origin, 'context', {}))
endfunction
function! wbx#image_external#closed(buffer) abort
  if get(s:active, 'buffer_view', -1) == a:buffer | call wbx#image_external#stop() | endif
endfunction
augroup wbx_external_image_lifecycle
  autocmd!
  autocmd BufWipeout * call wbx#image_external#closed(str2nr(expand('<abuf>')))
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
