" One physical incremental sink, one scheduled pull, no aggregate base64 handoff.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:helper = fnamemodify(expand('<sfile>:p'), ':h:h:h') . '/scripts/attachment-sink.mjs'
let s:serial = 0
let s:active = {}
function! wbx#attachment_stream#busy() abort
  return !empty(s:active)
endfunction
function! s:valid() abort
  if empty(s:active) || get(s:active, 'revoked', 0) | return 0 | endif
  return get(s:active, 'local', 0) ? call(s:active.Valid, []) : wbx#attachment_context(s:active.context)
endfunction
function! s:send(value) abort
  let line = json_encode(a:value) . "\n"
  if strlen(line) > (get(a:value, 'type', '') ==# 'chunk' ? 69633 : 8193) | throw 'Attachment sink message exceeds its bound.' | endif
  if has('nvim')
    if chansend(s:active.job, line) <= 0 | throw 'Attachment sink input unavailable.' | endif
  else
    call ch_sendraw(job_getchannel(s:active.job), line)
  endif
endfunction
function! wbx#attachment_stream#stop() abort
  if empty(s:active) || get(s:active, 'revoked', 0) | return | endif
  let s:active.revoked = 1
  call timer_stop(get(s:active, 'timer', -1))
  call timer_stop(get(s:active, 'pull_timer', -1))
  if !empty(get(s:active, 'candidate', '')) | call wbx#snapshots#drop(s:active.candidate) | let s:active.candidate = '' | endif
  " Revocation is not exit. Keep this physical owner through stubborn cleanup.
  call wbx#local_job#close_input(get(s:active, 'job', 0))
endfunction
function! s:fail(text) abort
  if empty(s:active) | return | endif
  let local = get(s:active, 'local', 0)
  let context = get(s:active, 'context', {})
  call wbx#attachment_stream#stop()
  if !local | call wbx#_attachment_stream_failed(context, a:text) | endif
endfunction
function! s:exit(serial, ...) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let old = s:active
  let s:active = {}
  call timer_stop(get(old, 'timer', -1))
  call timer_stop(get(old, 'pull_timer', -1))
  if !empty(get(old, 'candidate', '')) | call wbx#snapshots#drop(old.candidate) | endif
  if has_key(old, 'Exit')
    call call(old.Exit, [])
  elseif !get(old, 'revoked', 0) && old.phase !=# 'done' && !get(old, 'local', 0)
    call wbx#_attachment_stream_failed(old.context, 'Attachment sink ended before completion. Nothing was retried.')
  endif
endfunction
function! s:timeout(serial, timer) abort
  if get(s:active, 'serial', -1) == a:serial | call s:fail('Attachment sink preflight timed out; nothing was fetched.') | endif
endfunction
function! s:open() abort
  let serial = s:active.serial
  let command = [exepath('node'), s:helper]
  if has('nvim')
    let job = jobstart(command, {'on_stdout': function('s:nvim_data', [serial]), 'on_exit': function('s:exit', [serial]), 'stderr_buffered': v:false})
    if job <= 0 | let s:active = {} | throw 'Attachment sink could not start; nothing was fetched.' | endif
  else
    let job = job_start(command, {'out_mode': 'nl', 'out_cb': function('s:vim_data', [serial]), 'exit_cb': function('s:exit', [serial]), 'err_io': 'null'})
    if job_status(job) ==# 'fail' | let s:active = {} | throw 'Attachment sink could not start; nothing was fetched.' | endif
  endif
  let s:active.job = job
  let s:active.timer = timer_start(10000, function('s:timeout', [serial]))
  return job
endfunction
function! wbx#attachment_stream#start(context, params) abort
  if !empty(s:active) | throw 'An attachment sink is still active or draining.' | endif
  if !executable('node') || !filereadable(s:helper) | throw 'The bundled incremental attachment sink is unavailable; nothing was fetched.' | endif
  let s:serial += 1
  let s:active = {'serial': s:serial, 'context': a:context, 'params': deepcopy(a:params), 'phase': 'starting', 'output': '', 'seq': 0}
  return s:open()
endfunction
function! wbx#attachment_stream#snapshot(image, Ready, Exit, Valid) abort
  if !empty(s:active) | throw 'An attachment sink is still active or draining.' | endif
  if !executable('node') | throw 'Node is required for a private PNG lease.' | endif
  let value = wbx#snapshots#value(get(a:image.png, 'snapshot', ''))
  if empty(value) | throw 'Completed PNG snapshot is unavailable.' | endif
  let s:serial += 1
  let s:active = {'serial': s:serial, 'local': 1, 'value': value, 'snapshot': a:image.png.snapshot,
        \ 'Ready': a:Ready, 'Exit': a:Exit, 'Valid': a:Valid, 'phase': 'starting', 'output': '', 'seq': 0}
  return s:open()
endfunction
function! wbx#attachment_stream#resolved(context, value) abort
  if empty(s:active) || get(s:active, 'context', {}) isnot a:context || s:active.phase !=# 'resolving' | throw 'Attachment sink owner changed.' | endif
  let s:active.value = a:value
  if a:value.body.kind ==# 'png' | let s:active.candidate = wbx#snapshots#begin(a:value) | endif
  let s:active.phase = 'beginning'
  call s:send({'type': 'begin', 'value': a:value})
endfunction
function! s:schedule() abort
  let s:active.pull_timer = timer_start(0, function('s:pull', [s:active.serial]))
endfunction
function! s:pull(serial, timer) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  try
  let s:active.pull_timer = -1
  if !s:valid() | call s:fail('Attachment opening canceled by context change.') | return | endif
  let value = s:active.value
  let payload = value.body.payload
  if s:active.seq == payload.chunks
    let s:active.phase = 'preparing'
    call s:send({'type': 'prepare'})
  elseif get(s:active, 'local', 0)
    let seq = s:active.seq
    let bytes = min([49152, value.body.decodedBytes - seq * 49152])
    let s:active.phase = 'sinking'
    call s:send({'type': 'chunk', 'seq': seq, 'offset': seq * 49152, 'decodedBytes': bytes,
          \ 'data': wbx#snapshots#piece(s:active.snapshot, seq)})
  else
    let s:active.phase = 'pulling'
    if wbx#rpc('messages.attachmentChunk', {'requestId': payload.requestId, 'transferId': payload.transferId,
          \ 'seq': s:active.seq, 'offset': s:active.seq * 49152}, function('s:chunk', [a:serial])) < 0
      call s:fail('Attachment chunk request could not be sent.')
    endif
  endif
  catch
    call s:fail(v:exception)
  endtry
endfunction
function! s:chunk(serial, response) abort
  if get(s:active, 'serial', -1) != a:serial || get(s:active, 'revoked', 0) | return | endif
  try
  if has_key(a:response, 'error') | call s:fail('Attachment chunk failed. Nothing was retried.') | return | endif
  if !s:valid() | call s:fail('Attachment opening canceled.') | return | endif
  let value = s:active.value
  let chunk = get(a:response, 'result', v:null)
  if s:active.phase !=# 'pulling' || !wbx#protocol#attachment_chunk(chunk, value, s:active.seq)
    call wbx#_protocol_error()
    return
  endif
  if has_key(s:active, 'candidate') | call wbx#snapshots#append(s:active.candidate, chunk.data) | endif
  let s:active.phase = 'sinking'
  call s:send({'type': 'chunk', 'seq': chunk.seq, 'offset': chunk.offset, 'decodedBytes': chunk.decodedBytes, 'data': chunk.data})
  catch
    call s:fail(v:exception)
  endtry
endfunction
function! s:complete(serial, response) abort
  if get(s:active, 'serial', -1) != a:serial || get(s:active, 'revoked', 0) | return | endif
  let payload = s:active.value.body.payload
  let result = get(a:response, 'result', {})
  if has_key(a:response, 'error') | call s:fail('Attachment completion failed. Nothing was retried.') | return | endif
  if type(result) != v:t_dict || sort(keys(result)) !=# ['complete', 'requestId', 'transferId']
        \ || result.complete isnot v:true || type(result.requestId) != v:t_number || result.requestId != payload.requestId
        \ || type(result.transferId) != v:t_string || result.transferId !=# payload.transferId
    call wbx#_protocol_error()
    return
  endif
  if !s:valid() | call s:fail('Attachment completion canceled.') | return | endif
  let s:active.phase = 'prepared'
  if has_key(s:active, 'candidate') | call wbx#snapshots#verify(s:active.candidate) | endif
  call wbx#_attachment_stream_result(s:active.context, s:active.value, get(s:active, 'candidate', ''))
endfunction
function! wbx#attachment_stream#commit(mode, path, Ready, Exit) abort
  if empty(s:active) || s:active.phase !=# 'prepared' || !s:valid() | throw 'Attachment sink is no longer prepared.' | endif
  let s:active.Ready = a:Ready
  let s:active.Exit = a:Exit
  let s:active.phase = 'committing'
  call s:send(extend({'type': 'commit', 'mode': a:mode}, a:mode ==# 'save' ? {'path': a:path} : {}))
  return s:active.job
endfunction
function! wbx#attachment_stream#discard() abort
  if empty(s:active) || s:active.phase !=# 'prepared' | throw 'Attachment sink is not prepared.' | endif
  " The committed image view, not this short-lived sink, now owns these pieces.
  let s:active.candidate = ''
  let s:active.phase = 'discarding'
  call s:send({'type': 'commit', 'mode': 'discard'})
endfunction
function! s:message(serial, text) abort
  if get(s:active, 'serial', -1) != a:serial || get(s:active, 'revoked', 0) | return | endif
  try
    if strlen(a:text) > 8192 | throw 'Oversized attachment sink output.' | endif
    let v = json_decode(a:text)
    if type(v) != v:t_dict | throw 'Invalid attachment sink response.' | endif
    if s:active.phase ==# 'starting'
      if v !=# {'type': 'ready', 'version': 1} | throw 'Unsupported attachment sink.' | endif
      call timer_stop(s:active.timer)
      if !s:valid() | throw 'Attachment preflight canceled.' | endif
      if get(s:active, 'local', 0)
        let s:active.phase = 'beginning'
        call s:send({'type': 'begin', 'value': s:active.value})
      else
        let s:active.phase = 'resolving'
        call wbx#_attachment_stream_ready(s:active.context, s:active.params)
      endif
    elseif s:active.phase ==# 'beginning'
      if v !=# {'type': 'begun'} | throw 'Invalid attachment sink begin.' | endif
      call s:schedule()
    elseif s:active.phase ==# 'sinking'
      if v !=# {'type': 'chunk', 'seq': s:active.seq} | throw 'Invalid attachment sink credit.' | endif
      let s:active.seq += 1
      call s:schedule()
    elseif s:active.phase ==# 'preparing'
      let value = s:active.value
      let p = value.body.payload
      if sort(keys(v)) !=# ['chunks', 'decodedBytes', 'encodedBytes', 'sha256', 'text', 'type'] || v.type !=# 'prepared'
            \ || type(v.chunks) != v:t_number || type(v.decodedBytes) != v:t_number || type(v.encodedBytes) != v:t_number
            \ || type(v.sha256) != v:t_string
            \ || v.chunks != p.chunks || v.decodedBytes != value.body.decodedBytes || v.encodedBytes != p.encodedBytes
            \ || v.sha256 !=# p.sha256 || type(v.text) != v:t_bool || v.text != get(value.body, 'text', v:false)
        throw 'Attachment sink integrity check failed.'
      endif
      if !s:valid() | throw 'Attachment preparation canceled.' | endif
      if get(s:active, 'local', 0)
        let s:active.phase = 'prepared'
        call wbx#attachment_stream#commit('lease', '', s:active.Ready, s:active.Exit)
      else
        let s:active.phase = 'completing'
        if wbx#rpc('messages.attachmentComplete', {'requestId': p.requestId, 'transferId': p.transferId, 'chunks': p.chunks,
              \ 'decodedBytes': value.body.decodedBytes, 'encodedBytes': p.encodedBytes, 'sha256': p.sha256},
              \ function('s:complete', [a:serial])) < 0 | throw 'Attachment completion could not be sent.' | endif
      endif
    elseif s:active.phase ==# 'committing'
      if sort(keys(v)) !=# ['path', 'text', 'type'] || v.type !=# 'committed' || type(v.path) != v:t_string || type(v.text) != v:t_bool
        throw 'Invalid committed attachment sink response.'
      endif
      let s:active.phase = 'lease'
      if !empty(get(s:active, 'candidate', '')) | call wbx#snapshots#drop(s:active.candidate) | let s:active.candidate = '' | endif
      call call(s:active.Ready, [json_encode({'path': v.path, 'text': v.text})])
    elseif s:active.phase ==# 'discarding'
      if v !=# {'type': 'discarded'} | throw 'Invalid attachment discard response.' | endif
      let s:active.phase = 'done'
    else
      throw 'Unexpected attachment sink phase.'
    endif
  catch
    call s:fail(v:exception)
  endtry
endfunction
function! s:nvim_data(serial, job, data, event) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let s:active.output .= join(a:data, "\n")
  if strlen(s:active.output) > 8193 | call s:fail('Oversized attachment sink output.') | return | endif
  let end = stridx(s:active.output, "\n")
  if end >= 0
    let line = strpart(s:active.output, 0, end)
    let s:active.output = strpart(s:active.output, end + 1)
    if !empty(s:active.output) | call s:fail('Unexpected attachment sink output credit.') | return | endif
    call s:message(a:serial, line)
  endif
endfunction
function! s:vim_data(serial, channel, text) abort
  call s:message(a:serial, a:text)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
