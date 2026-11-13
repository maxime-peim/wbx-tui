" Explicit local handling of bounded attachment bytes. Never a shell or OS opener.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#attachments#label(file) abort
  let mime = get(a:file, 'mime', 'application/octet-stream')
  return get(a:file, 'name', 'Name unavailable') . ' · ' . (mime ==# 'application/octet-stream' ? 'type unknown' : mime)
endfunction
let s:helper = fnamemodify(expand('<sfile>:p'), ':h:h:h') . '/scripts/attachment-lease.mjs'
let s:serial = 0
let s:active = {}

function! s:notice(text) abort
  echohl WbxWarning
  echomsg '[wbx-tui] ' . a:text
  echohl None
endfunction
function! wbx#attachments#busy() abort
  return !empty(s:active)
endfunction
function! wbx#attachments#settings(action) abort
  let options = get(g:, 'wbx_tui', {})
  if a:action ==# 'download'
    return {'directory': deepcopy(get(options, 'attachment_download_dir', getcwd()))}
  endif
  return {'handlers': deepcopy(get(options, 'attachment_handlers', {})), 'mode': get(options, 'image_open', 'buffer'),
        \ 'viewer': deepcopy(get(options, 'image_viewer', {}))}
endfunction
function! wbx#attachments#config(context) abort
  return !get(a:context, 'typed', 0) || a:context.settings ==# wbx#attachments#settings(a:context.action)
endfunction
function! wbx#attachments#selectors(settings) abort
  let handlers = get(a:settings, 'handlers', {})
  if type(handlers) != v:t_dict | throw 'attachment_handlers must be a dictionary.' | endif
  let selectors = []
  for key in sort(keys(handlers))
    if strlen(key) <= 129 && (key =~# '^\.[a-z0-9_ -]\{0,118}$'
          \ || key =~# '^[a-z0-9!#$&^_.+-]\{1,64}/[a-z0-9!#$&^_.+-]\{1,64}$')
      call add(selectors, {'key': key, 'use': type(handlers[key]) == v:t_dict && empty(handlers[key]) ? 'native' : 'original'})
    endif
  endfor
  if len(selectors) > 128 || strlen(json_encode(selectors)) > 24576 | throw 'Attachment selection policy exceeds its bounded request limit; nothing was fetched.' | endif
  return selectors
endfunction
function! wbx#attachments#original(meta, context) abort
  if a:context.action ==# 'download' | return 1 | endif
  let handlers = a:context.settings.handlers
  let key = '.' . tolower(fnamemodify(a:meta.name, ':e'))
  let config = get(handlers, key, get(handlers, a:meta.mime, {}))
  return !(type(config) == v:t_dict && empty(config)) || index(['image/png', 'image/jpeg', 'image/gif', 'image/webp'], a:meta.mime) < 0
endfunction
function! wbx#attachments#stop() abort
  let previous = s:active
  let s:active = {}
  if empty(previous) | return | endif
  if has_key(previous, 'context') | call wbx#attachment_handoff(previous.context) | endif
  call wbx#local_job#release(previous)
endfunction
function! s:handler(file) abort
  let handlers = get(get(g:, 'wbx_tui', {}), 'attachment_handlers', {})
  if type(handlers) != v:t_dict | throw 'attachment_handlers must be a dictionary of extensions or MIME types to argv/terminal settings.' | endif
  let extension = '.' . tolower(fnamemodify(a:file.name, ':e'))
  let config = get(handlers, extension, get(handlers, a:file.mime, {}))
  if type(config) == v:t_dict && empty(config) | return {} | endif
  let argv = type(config) == v:t_dict ? get(config, 'argv', []) : []
  let terminal = type(config) == v:t_dict ? get(config, 'terminal', 0) : 0
  if type(config) != v:t_dict || !empty(filter(keys(config), 'index(["argv", "terminal"], v:val) < 0'))
        \ || type(argv) != v:t_list || empty(argv) || len(argv) > 32
        \ || !empty(filter(copy(argv), 'type(v:val) != v:t_string || empty(v:val) || strlen(v:val) > 4096 || v:val =~# "[\x00-\x1f\x7f]"'))
        \ || !executable(argv[0]) || index([v:t_bool, v:t_number], type(terminal)) < 0
        \ || type(terminal) == v:t_number && index([0, 1], terminal) < 0
    throw 'Attachment handler must be {argv: [executable, arguments...], terminal: true/false}; no shell strings.'
  endif
  if terminal && !has('nvim') && !has('terminal') | throw 'This editor has no terminal support.' | endif
  return {'argv': copy(argv), 'terminal': !!terminal}
endfunction
function! s:buffer(file, path, serial) abort
  if &encoding !=# 'utf-8' | throw 'Attachment text viewing requires encoding=utf-8; download or configure a tool instead.' | endif
  let lines = readfile(a:path, 'b')
  let eol = !empty(lines) && lines[-1] ==# ''
  if eol | call remove(lines, -1) | endif
  let dos = !empty(lines) && empty(filter(copy(lines), 'v:val !~# "\r$"'))
  if dos | call map(lines, 'substitute(v:val, "\r$", "", "")') | endif
  if empty(lines) | let lines = [''] | endif
  let bom = lines[0] =~# '^\%uFEFF'
  if bom | let lines[0] = substitute(lines[0], '^\%uFEFF', '', '') | endif
  let previous = bufnr('$')
  belowright new
  if get(s:active, 'serial', -1) != a:serial || bufnr('%') <= previous || !empty(bufname('%')) || &modified || line('$') != 1 || getline(1) !=# ''
    throw 'An editor hook changed the new attachment window; its buffer was preserved.'
  endif
  let buffer = bufnr('%')
  setlocal buftype=nofile bufhidden=hide noswapfile noundofile nomodeline
  execute 'file ' . fnameescape('wbx-attachment://' . s:serial . '/' . a:file.name)
  if get(s:active, 'serial', -1) != a:serial || bufnr('%') != buffer || &modified || line('$') != 1 || getline(1) !=# ''
    throw 'Attachment buffer was changed by an editor hook; its contents were preserved.'
  endif
  call setline(1, lines)
  let &l:endofline = eol
  let &l:fileformat = dos ? 'dos' : 'unix'
  let &l:bomb = bom
  setlocal fileencoding=utf-8 nomodified
  let b:wbx_attachment = {'id': a:file.id, 'name': a:file.name, 'mime': a:file.mime}
  " Use this session's filetype detection/plugins, not a plugin-owned text mode.
  " Contents are already installed; later FileType hook edits are never overwritten.
  silent filetype detect
  if bufnr('%') != buffer | return | endif
  if empty(&l:filetype)
    let types = {'application/json': 'json', 'application/xml': 'xml', 'text/csv': 'csv', 'text/markdown': 'markdown', 'text/plain': 'text'}
    let &l:filetype = get(types, a:file.mime, 'text')
  endif
endfunction
function! s:viewer_exit(serial, code) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  call wbx#attachments#stop()
  if a:code != 0 | call s:notice('Attachment handler exited unsuccessfully; private file released.') | endif
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
  if get(s:active, 'serial', -1) == a:serial | let s:active.buffer = a:buffer | endif
endfunction
function! s:lease_exit(serial, ...) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let saved = get(s:active, 'saved', 0)
  call wbx#attachments#stop()
  if !saved | call s:notice('Attachment file could not be created or its private lease ended. Existing destinations are never overwritten.') | endif
endfunction
function! s:ready(serial, text) abort
  if get(s:active, 'serial', -1) != a:serial || get(s:active, 'launched', 0) | return | endif
  let origin = s:active
  try
    let result = json_decode(a:text)
    if type(result) != v:t_dict || type(get(result, 'path', 0)) != v:t_string || !filereadable(result.path)
          \ || type(get(result, 'text', 0)) != v:t_bool | throw 'Invalid attachment file response.' | endif
    let s:active.launched = 1
    if origin.mode ==# 'save'
      if result.path !=# origin.path | throw 'Invalid download destination response.' | endif
      let s:active.saved = 1
      call s:notice('Attachment saved to ' . result.path)
      return
    endif
    if fnamemodify(result.path, ':t') !=# origin.file.name || fnamemodify(result.path, ':h:t') !~# '^wbx-attachment-[A-Za-z0-9]\+$'
          \ || !wbx#attachment_context(origin.context)
      call wbx#attachments#stop()
      return
    endif
    if empty(origin.handler)
      if !result.text | throw 'Attachment is not bounded UTF-8 text. Configure an external handler or download it.' | endif
      call wbx#attachment_handoff(origin.context)
      call s:buffer(origin.file, result.path, a:serial)
      if get(s:active, 'serial', -1) == a:serial | call wbx#attachments#stop() | endif
      return
    endif
    let argv = copy(origin.handler.argv) + [result.path]
    call wbx#attachment_handoff(origin.context)
    if origin.handler.terminal
      let launched = wbx#local_terminal#open(argv, {'marker': 'wbx_attachment_terminal', 'serial': a:serial,
            \ 'Valid': function('s:terminal_valid', [a:serial, origin.context]), 'Bind': function('s:terminal_bind', [a:serial]),
            \ 'nvim_exit': function('s:nvim_exit', [a:serial]), 'vim_exit': function('s:vim_exit', [a:serial])})
      let job = launched.job
    else
      let job = wbx#local_job#viewer(argv, function('s:nvim_exit', [a:serial]), function('s:vim_exit', [a:serial]))
    endif
    if has('nvim') ? job <= 0 : type(job) != v:t_job || job_status(job) ==# 'fail' | throw 'Could not launch the configured attachment handler.' | endif
    if get(s:active, 'serial', -1) != a:serial
      call wbx#local_job#stop(job)
      return
    endif
    let s:active.viewer = job
  catch
    if get(s:active, 'serial', -1) == a:serial | call wbx#attachments#stop() | endif
    call s:notice(v:exception)
  endtry
endfunction
function! s:nvim_data(serial, job, data, event) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let s:active.output .= join(a:data, "\n")
  if strlen(s:active.output) > 8192 | call wbx#attachments#stop() | return | endif
  if stridx(s:active.output, "\n") >= 0 | call s:ready(a:serial, split(s:active.output, "\n")[0]) | endif
endfunction
function! s:vim_data(serial, channel, text) abort
  call s:ready(a:serial, a:text)
endfunction
function! wbx#attachments#open(file, context, ...) abort
  if !empty(s:active) | throw 'Another attachment handler or download is active.' | endif
  if !executable('node') | throw 'Node is required to materialize attachment files safely.' | endif
  let handler = a:context.action ==# 'open' ? s:handler(a:file) : {}
  if !get(a:context, 'typed', 0) && a:context.action ==# 'open' && empty(handler) && index(['image/png', 'image/jpeg', 'image/gif', 'image/webp'], a:file.mime) >= 0
    call wbx#attachment_image(a:context)
    return
  endif
  if a:context.action ==# 'open' && empty(handler) && !a:file.text
    throw 'No editor text view or configured handler for this attachment. Use :WebexAttachmentDownload to save it.'
  endif
  let path = ''
  if a:context.action ==# 'download'
    let directory = get(get(a:context, 'settings', {}), 'directory', get(get(g:, 'wbx_tui', {}), 'attachment_download_dir', getcwd()))
    if type(directory) != v:t_string || directory =~# '[\x00-\x1f\x7f]' | throw 'attachment_download_dir must be a directory path.' | endif
    call inputsave()
    try
      let path = input('Save attachment as (new file only): ', substitute(fnamemodify(expand(directory), ':p'), '/$', '', '') . '/' . a:file.name, 'file')
    finally
      call inputrestore()
    endtry
    if empty(path) || !wbx#attachment_context(a:context)
      if a:0 | call wbx#attachment_stream#stop() | endif
      call wbx#attachment_handoff(a:context)
      return
    endif
    let path = fnamemodify(path, ':p')
    if strlen(path) > 4096 || path =~# '[\x00-\x1f\x7f]' | throw 'Invalid download destination.' | endif
  endif
  if !wbx#attachment_context(a:context) | return | endif
  let s:serial += 1
  let serial = s:serial
  let mode = a:context.action ==# 'download' ? 'save' : 'lease'
  let s:active = {'serial': serial, 'file': {'id': a:file.id, 'name': a:file.name, 'mime': a:file.mime}, 'handler': handler,
        \ 'context': a:context, 'mode': mode, 'path': path, 'output': ''}
  if a:0
    try
      let s:active.lease = wbx#attachment_stream#commit(mode, path, function('s:ready', [serial]), function('s:lease_exit', [serial]))
    catch
      call wbx#attachments#stop()
      call wbx#attachment_stream#stop()
      throw v:exception
    endtry
    return
  endif
  let value = {'mode': mode, 'name': a:file.name, 'data': a:file.data, 'path': path}
  let command = [exepath('node'), s:helper]
  try
    if has('nvim')
      let job = jobstart(command, {'on_stdout': function('s:nvim_data', [serial]), 'on_exit': function('s:lease_exit', [serial])})
      let s:active.lease = job
      if job <= 0 | throw 'Could not create an attachment file helper.' | endif
      call chansend(job, json_encode(value) . "\n")
    else
      let job = job_start(command, {'out_mode': 'nl', 'out_cb': function('s:vim_data', [serial]), 'exit_cb': function('s:lease_exit', [serial]), 'err_io': 'null'})
      let s:active.lease = job
      if job_status(job) ==# 'fail' | throw 'Could not create an attachment file helper.' | endif
      call ch_sendraw(job_getchannel(job), json_encode(value) . "\n")
    endif
  catch
    call wbx#attachments#stop()
    throw v:exception
  endtry
endfunction
function! wbx#attachments#closed(buffer) abort
  if get(s:active, 'buffer', -1) == a:buffer | call wbx#attachments#stop() | endif
endfunction
augroup wbx_attachment_lifecycle
  autocmd!
  autocmd BufWipeout * call wbx#attachments#closed(str2nr(expand('<abuf>')))
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
