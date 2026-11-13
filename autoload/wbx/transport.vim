let s:save_cpo = &cpoptions
set cpoptions&vim
let s:job = 0
let s:running = 0
let s:parts = []
let s:tail = []
let s:tail_bytes = 0
let s:frame_bytes = 0
let s:terminal = {}
let s:terminal_generation = 0
let s:generation = 0

function! s:reset_frame() abort
  let s:parts = []
  let s:tail = []
  let s:tail_bytes = 0
  let s:frame_bytes = 0
endfunction
function! s:append(text, bytes) abort
  if a:bytes == 0 | return | endif
  let s:frame_bytes += a:bytes
  let s:tail_bytes += a:bytes
  call add(s:tail, a:text)
  " Compact once per block, not once per callback. Metadata stays bounded even
  " for one-byte fragments; each byte is joined at most into a block and a record.
  if s:tail_bytes >= 4096
    call add(s:parts, len(s:tail) == 1 ? s:tail[0] : join(s:tail, ''))
    let s:tail = []
    let s:tail_bytes = 0
  endif
endfunction
function! s:consume(text) abort
  if !s:running | return | endif
  let generation = s:generation
  let offset = 0
  let bytes = strlen(a:text)
  while offset < bytes
    " Search only the unconsumed callback bytes. strpart() copies a segment,
    " never the increasingly large incomplete prefix or remaining callback tail.
    let newline = stridx(a:text, "\n", offset)
    let end = newline < 0 ? bytes : newline
    let size = end - offset
    if s:frame_bytes + size > 8388608
      call wbx#_protocol_error()
      return
    endif
    call s:append(strpart(a:text, offset, size), size)
    if newline < 0 | return | endif
    let offset = newline + 1
    if !empty(s:tail)
      call add(s:parts, len(s:tail) == 1 ? s:tail[0] : join(s:tail, ''))
    endif
    let line = len(s:parts) == 1 ? s:parts[0] : join(s:parts, '')
    call s:reset_frame()
    if empty(line)
      continue
    endif
    try
      let message = json_decode(line)
    catch
      call wbx#_protocol_error()
      return
    endtry
    call wbx#_receive(message)
    if !s:running || generation != s:generation
      " Invalid output stops admission immediately, including later ACKs in
      " this same callback, even if a hook already started a replacement job.
      return
    endif
  endwhile
endfunction

function! s:nvim_out(generation, job, data, event) abort
  if a:generation == s:generation
    call s:consume(join(a:data, "\n"))
  endif
endfunction
function! s:vim_out(generation, channel, text) abort
  if a:generation == s:generation
    call s:consume(a:text)
  endif
endfunction
function! s:nvim_exit(generation, job, code, event) abort
  if a:generation != s:generation
    return
  endif
  let s:running = 0
  call s:reset_frame()
  call wbx#_exit(a:code)
endfunction
function! s:vim_exit(generation, job, code) abort
  if a:generation != s:generation
    return
  endif
  let s:running = 0
  call s:reset_frame()
  call wbx#_exit(a:code)
endfunction
function! s:stderr(...) abort
  " Never copy arbitrary backend/provider output into editor history.
endfunction

function! wbx#transport#start(command) abort
  if s:running
    return 1
  endif
  call s:reset_frame()
  let s:generation += 1
  if has('nvim')
    let s:job = jobstart(a:command, {'on_stdout': function('s:nvim_out', [s:generation]), 'on_stderr': function('s:stderr'), 'on_exit': function('s:nvim_exit', [s:generation])})
    let s:running = s:job > 0
  elseif has('job') && has('channel')
    let s:job = job_start(a:command, {'in_mode': 'raw', 'out_mode': 'raw', 'err_mode': 'raw', 'out_cb': function('s:vim_out', [s:generation]), 'err_cb': function('s:stderr'), 'exit_cb': function('s:vim_exit', [s:generation]), 'stoponexit': 'term'})
    let s:running = job_status(s:job) ==# 'run'
  else
    throw 'wbx-tui requires Vim job/channel support or Neovim.'
  endif
  " Explicit private acceptance probe only. Read the editor's actual native job
  " metadata, not the configured command or a guessed bundle/source policy.
  if !empty($WBX_TEST_BACKEND_AUDIT)
    let native = !s:running ? [] : has('nvim') ? get(nvim_get_chan_info(s:job), 'argv', []) : get(job_info(s:job), 'cmd', [])
    call writefile([json_encode({'editor': has('nvim') ? 'Neovim' : 'Vim', 'argv': native,
          \ 'fixture': $WBX_TEST_FIXTURE, 'started': s:running ? v:true : v:false})], $WBX_TEST_BACKEND_AUDIT, 'a')
  endif
  return s:running
endfunction

function! wbx#transport#write(text) abort
  if !s:running
    throw 'wbx-tui backend is not running.'
  endif
  if has('nvim')
    call chansend(s:job, a:text)
  else
    call ch_sendraw(job_getchannel(s:job), a:text)
  endif
endfunction
function! wbx#transport#running() abort
  return s:running
endfunction
function! wbx#transport#stop() abort
  if !s:running
    return
  endif
  let job = s:job
  let s:running = 0
  let s:generation += 1
  call s:reset_frame()
  try
    if has('nvim')
      call jobstop(job)
    else
      call job_stop(job)
    endif
  finally
    " Do not depend on a later old-job callback for pending-send cleanup. A
    " replacement backend may already be starting when that callback arrives.
    call wbx#_exit(0)
  endtry
endfunction

function! s:terminal_exit(generation, ...) abort
  if a:generation == s:terminal_generation && !empty(s:terminal)
    let s:terminal.exited = 1
    call wbx#_meeting_view_closed()
  endif
endfunction
function! s:terminal_running() abort
  if empty(s:terminal) || get(s:terminal, 'exited', 0)
    return 0
  endif
  return has('nvim') ? jobwait([s:terminal.job], 0)[0] == -1 : job_status(s:terminal.job) ==# 'run'
endfunction
function! wbx#transport#terminal(command) abort
  if !empty(s:terminal) && bufexists(s:terminal.buffer)
    if s:terminal_running() && get(s:terminal, 'command', []) ==# a:command
      " Readiness/state notifications must not steal focus or recreate a view
      " that is already displayed in another tab (or intentionally hidden).
      return
    endif
    call wbx#transport#detach()
  endif
  tabnew
  let t:wbx_meeting = 1
  let s:terminal_generation += 1
  if has('nvim')
    let job = termopen(a:command, {'env': {'TMUX': '', 'TMUX_PANE': ''}, 'on_exit': function('s:terminal_exit', [s:terminal_generation])})
  elseif has('terminal')
    let buffer = term_start(a:command, {'curwin': 1, 'env': {'TMUX': '', 'TMUX_PANE': ''}, 'exit_cb': function('s:terminal_exit', [s:terminal_generation])})
    let job = term_getjob(buffer)
  else
    close
    throw 'This Vim was built without +terminal. Use the side Kitty display.'
  endif
  let s:terminal = {'buffer': bufnr('%'), 'job': job, 'command': copy(a:command)}
  let b:wbx_meeting_terminal = 1
  setlocal bufhidden=wipe noswapfile noundofile nomodeline
  call wbx#_meeting_view_opened()
endfunction

function! wbx#transport#focus() abort
  if empty(s:terminal) || !bufexists(s:terminal.buffer) || !s:terminal_running()
    return 0
  endif
  let windows = win_findbuf(s:terminal.buffer)
  if empty(windows)
    execute 'tab sbuffer ' . s:terminal.buffer
  else
    call win_gotoid(windows[0])
  endif
  return 1
endfunction

function! wbx#transport#closed_buffer(buffer) abort
  if empty(s:terminal) || s:terminal.buffer != a:buffer
    return 0
  endif
  let s:terminal_generation += 1
  let s:terminal = {}
  return 1
endfunction

function! wbx#transport#detach() abort
  if empty(s:terminal)
    return
  endif
  let terminal = s:terminal
  let s:terminal_generation += 1
  let s:terminal = {}
  " Stop only our tmux *client*. Never send terminal keys/Ctrl+C to the owner.
  if has('nvim')
    call jobstop(terminal.job)
  else
    call job_stop(terminal.job, 'term')
  endif
  if bufexists(terminal.buffer)
    execute 'silent! bwipeout! ' . terminal.buffer
  endif
endfunction

let &cpoptions = s:save_cpo
unlet s:save_cpo
