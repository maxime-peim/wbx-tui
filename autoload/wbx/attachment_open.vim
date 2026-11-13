" Explicit attachment action/intent lifetime. Physical sinks, files, image snapshots and RPC have other owners.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#attachment_open#new(ports) abort
  return {'ports':a:ports, 'busy':0, 'serial':0, 'generation':0, 'intent':{}}
endfunction
function! wbx#attachment_open#generation(owner) abort
  return a:owner.generation
endfunction
function! wbx#attachment_open#blocks_previews(owner) abort
  return !empty(a:owner.intent) && a:owner.intent.action ==# 'open'
endfunction
function! wbx#attachment_open#prepare(owner) abort
  let a:owner.busy = 0
  let a:owner.serial += 1
  let a:owner.generation += 1
  let a:owner.intent = {}
  call wbx#attachments#stop()
endfunction
function! wbx#attachment_open#lost(owner) abort
  call wbx#attachments#stop()
  call wbx#attachment_stream#stop()
  let a:owner.busy = 0
  let a:owner.serial += 1
  let a:owner.generation += 1
  let a:owner.intent = {}
endfunction
function! wbx#attachment_open#stop(owner) abort
  call wbx#attachments#stop()
  call wbx#attachment_open#cancel(a:owner)
  let a:owner.generation += 1
  let a:owner.busy = 0
  let a:owner.serial += 1
endfunction
function! wbx#attachment_open#selected(owner, changed) abort
  call wbx#attachment_open#cancel(a:owner)
  if a:changed | let a:owner.serial += 1 | let a:owner.busy = 0 | endif
endfunction
function! wbx#attachment_open#context(owner, context) abort
  if a:context.serial != a:owner.serial || win_getid() != a:context.window || bufnr('%') != a:context.buffer || line('.') != a:context.row | return 0 | endif
  if get(a:context, 'typed', 0) && (get(a:context, 'revoked', 0) || a:context.owner != a:owner.generation
        \ || a:context.settings !=# wbx#attachments#settings(a:context.action)) | return 0 | endif
  let message = call(a:owner.ports.Message, [])
  return get(message, 'id', '') ==# a:context.message && get(b:, 'wbx_history_room', '') ==# a:context.room
        \ && !empty(filter(copy(get(message, 'attachments', [])), 'v:val.id ==# a:context.attachment'))
endfunction
function! wbx#attachment_open#valid(owner, context) abort
  if !get(a:context, 'typed', 0) | return 1 | endif
  return a:context.serial == a:owner.serial && a:context.owner == a:owner.generation && !get(a:context, 'revoked', 0)
        \ && !call(a:owner.ports.Disconnected, []) && get(call(a:owner.ports.State, []), 'ready', 0) && get(get(call(a:owner.ports.State, []), 'room', {}), 'id', '') ==# a:context.room
        \ && wbx#attachments#config(a:context)
        \ && wbx#view#owned(a:context.buffer, 'history') && !wbx#view#edited(a:context.buffer)
endfunction
function! wbx#attachment_open#handoff(owner, context) abort
  if get(a:owner.intent, 'serial', -1) == a:context.serial | let a:owner.intent = {} | endif
endfunction
function! wbx#attachment_open#cancel(owner) abort
  if empty(a:owner.intent) | return | endif
  let previous = a:owner.intent
  let a:owner.intent = {}
  let previous.revoked = 1
  let a:owner.serial += 1
  let a:owner.busy = 0
  call wbx#attachments#stop()
  call wbx#attachment_stream#stop()
  if call(a:owner.ports.CanCancel, []) && get(previous, 'request', -1) > 0
    call call(a:owner.ports.Request, ['messages.attachmentCancel', {'requestId': previous.request}])
  endif
endfunction
function! wbx#attachment_open#check(owner, leaving) abort
  if !empty(a:owner.intent) && (a:leaving || !wbx#attachment_open#context(a:owner, a:owner.intent)) | call wbx#attachment_open#cancel(a:owner) | endif
endfunction
function! s:resolved(owner, context, response) abort
  if a:context.serial != a:owner.serial | return | endif
  let a:owner.busy = 0
  call wbx#images#schedule()
  if has_key(a:response, 'error')
    if get(a:context, 'transfer', 0) | call wbx#attachment_stream#stop() | endif
    call wbx#attachment_open#handoff(a:owner, a:context)
    return
  endif
  let value = get(a:response, 'result', v:null)
  if !wbx#protocol#resolved_attachment(value, get(a:context, 'request', -1)) || value.meta.id !=# a:context.attachment
        \ || (get(a:context, 'transfer', 0) ? 'chunks' : 'inline') !=# get(get(value, 'body', {}), 'payload', {}).mode
    call call(a:owner.ports.ProtocolError, [])
    return
  endif
  if !wbx#attachment_open#context(a:owner, a:context) | call wbx#attachment_open#cancel(a:owner) | return | endif
  let original = wbx#attachments#original(value.meta, a:context)
  if original != (value.body.kind ==# 'original') | call call(a:owner.ports.ProtocolError, []) | return | endif
  try
    if get(a:context, 'transfer', 0)
      let a:owner.busy = 1
      call wbx#attachment_stream#resolved(a:context, value)
      return
    endif
    if original
      call wbx#attachments#open({'id': value.meta.id, 'name': value.meta.name, 'mime': value.meta.mime,
            \ 'size': value.body.decodedBytes, 'text': value.body.text, 'data': value.body.payload.data}, a:context)
    else
      let mode = a:context.settings.mode
      if index(['buffer', 'external'], mode) < 0 | throw 'image_open must be buffer or external.' | endif
      if mode ==# 'external' | call wbx#image_external#validate() | endif
      call wbx#attachment_open#handoff(a:owner, a:context)
      call wbx#images#open({'id': value.meta.id, 'state': 'ready', 'png': value.body.payload.data,
            \ 'width': value.body.width, 'height': value.body.height, 'lines': value.body.lines}, mode,
            \ {'owner': a:context.owner, 'room': a:context.room, 'message': a:context.message}, a:context)
    endif
  catch
    call wbx#attachment_open#handoff(a:owner, a:context)
    call call(a:owner.ports.Notify, [v:exception])
  endtry
endfunction
function! wbx#attachment_open#stream_ready(owner, context, params) abort
  if !wbx#attachment_open#context(a:owner, a:context) | call wbx#attachment_open#cancel(a:owner) | return | endif
  let a:context.request = call(a:owner.ports.Request, ['messages.attachmentResolve', a:params, function('s:resolved', [a:owner, a:context])])
  if a:context.request < 0 | call wbx#attachment_open#cancel(a:owner) | endif
endfunction
function! wbx#attachment_open#stream_failed(owner, context, text) abort
  if get(a:context, 'serial', -1) != a:owner.serial | return | endif
  call wbx#attachment_open#cancel(a:owner)
  call call(a:owner.ports.Notify, [a:text])
endfunction
function! wbx#attachment_open#stream_result(owner, context, value, key) abort
  if !wbx#attachment_open#context(a:owner, a:context) | call wbx#attachment_open#cancel(a:owner) | return | endif
  let a:owner.busy = 0
  try
    if a:value.body.kind ==# 'original'
      call wbx#attachments#open({'id': a:value.meta.id, 'name': a:value.meta.name, 'mime': a:value.meta.mime,
            \ 'size': a:value.body.decodedBytes, 'text': a:value.body.text}, a:context, 1)
    else
      let mode = a:context.settings.mode
      if index(['buffer', 'external'], mode) < 0 | throw 'image_open must be buffer or external.' | endif
      call wbx#attachment_open#handoff(a:owner, a:context)
      call wbx#images#open({'id': a:value.meta.id, 'state': 'ready', 'png': {'snapshot': a:key},
            \ 'width': a:value.body.width, 'height': a:value.body.height, 'lines': a:value.body.lines}, mode,
            \ {'owner': a:context.owner, 'room': a:context.room, 'message': a:context.message}, a:context, 1)
      if mode ==# 'buffer' | call wbx#attachment_stream#discard() | endif
    endif
  catch
    call wbx#attachment_stream#stop()
    call wbx#attachment_open#handoff(a:owner, a:context)
    call call(a:owner.ports.Notify, [v:exception])
  endtry
endfunction
function! s:done(owner, context, response) abort
  if a:context.serial != a:owner.serial | return | endif
  let a:owner.busy = 0
  if has_key(a:response, 'error') | return | endif
  let file = get(a:response, 'result', v:null)
  if !wbx#protocol#opened_attachment(file) || file.id !=# a:context.attachment
    call call(a:owner.ports.ProtocolError, [])
    return
  endif
  if !wbx#attachment_open#context(a:owner, a:context) | return | endif
  try
    call wbx#attachments#open(file, a:context)
  catch
    call call(a:owner.ports.Notify, [v:exception])
  endtry
endfunction
function! s:image_done(owner, context, response) abort
  call call(a:owner.ports.SetImageBusy, [0, a:context.image_read])
  call wbx#images#schedule()
  if a:context.serial != a:owner.serial | return | endif
  let a:owner.busy = 0
  if has_key(a:response, 'error') | return | endif
  let image = get(a:response, 'result', v:null)
  if !wbx#protocol#opened_image(image) || image.id !=# a:context.attachment | call call(a:owner.ports.ProtocolError, []) | return | endif
  if !wbx#attachment_open#context(a:owner, a:context) | return | endif
  try
    call wbx#images#open(image, a:context.mode, {'owner':a:context.owner, 'room':a:context.room, 'message':a:context.message})
  catch
    call call(a:owner.ports.Notify, [v:exception])
  endtry
endfunction
function! wbx#attachment_open#image(owner, context) abort
  if !wbx#attachment_open#context(a:owner, a:context) | return | endif
  let mode = get(call(a:owner.ports.Options, []), 'image_open', 'buffer')
  if index(['buffer', 'external'], mode) < 0 | throw 'image_open must be buffer or external.' | endif
  if mode ==# 'external' | call wbx#image_external#validate() | endif
  let source = {'owner':a:owner.generation, 'room':a:context.room, 'message':a:context.message}
  let snapshot = wbx#image_request#snapshot(source, a:context.attachment)
  if !empty(snapshot)
    call wbx#images#open(snapshot, mode)
    return
  endif
  if call(a:owner.ports.ImageBusy, []) | throw 'Another image read is active; try opening again when it finishes.' | endif
  if index(call(a:owner.ports.Capabilities, []), 'image-opening') < 0 | throw 'Native image opening requires an updated backend. Preserve drafts, rebuild and restart when ready.' | endif
  let context = extend(copy(a:context), {'mode': mode, 'owner':a:owner.generation})
  let context.image_read = call(a:owner.ports.SetImageBusy, [1])
  let a:owner.busy = 1
  if call(a:owner.ports.Request, ['messages.imageOpen', {'roomId': context.room, 'messageId': context.message, 'imageId': context.attachment}, function('s:image_done', [a:owner, context])]) < 0
    call call(a:owner.ports.SetImageBusy, [0, context.image_read])
    let a:owner.busy = 0
  endif
endfunction
function! wbx#attachment_open#open(owner, action, index) abort
  if index(['open', 'download'], a:action) < 0 | return | endif
  if a:action ==# 'open' && wbx#view#owned(bufnr('%'), 'image')
    call call(a:owner.ports.ImageOpen, ['', a:index])
    return
  endif
  let message = call(a:owner.ports.Message, [])
  let files = get(message, 'attachments', [])
  " Older image-only projections keep working through the unified open binding.
  if empty(files) && a:action ==# 'open' && !empty(get(message, 'images', []))
    call call(a:owner.ports.ImageOpen, ['', a:index])
    return
  endif
  if empty(files) | call call(a:owner.ports.Notify, ['Place the cursor on a loaded message with attachments.']) | return | endif
  if a:owner.busy || wbx#attachments#busy() || wbx#attachment_stream#busy() | call call(a:owner.ports.Notify, ['Another attachment read, sink or external handler is active.']) | return | endif
  let context = {'window': win_getid(), 'buffer': bufnr('%'), 'row': line('.'), 'message': message.id, 'room': b:wbx_history_room,
        \ 'serial': a:owner.serial, 'action': a:action}
  let number = 0
  if !empty(a:index)
    if a:index !~# '^\([1-9]\|10\)$' | call call(a:owner.ports.Notify, ['Attachment index must be 1–10.']) | return | endif
    let number = str2nr(a:index)
  elseif a:action ==# 'open'
    for placement in get(b:, 'wbx_image_placements', [])
      if line('.') >= placement.row - 1 && line('.') < placement.row + 12
        let number = index(map(copy(files), 'v:val.id'), placement.id) + 1
      endif
    endfor
  endif
  if number == 0 && len(files) > 1
    call wbx#chooser#select(['Choose attachment:'] + map(copy(files), 'wbx#attachments#label(v:val)'),
          \ function('s:picked', [a:owner, wbx#view#intent(), context, deepcopy(files)]))
    return
  elseif number == 0
    let number = 1
  endif
  if number > len(files) | call call(a:owner.ports.Notify, ['That attachment is not present.']) | return | endif
  let context.attachment = files[number - 1].id
  if a:owner.busy || wbx#attachments#busy() || !wbx#attachment_open#context(a:owner, context) | return | endif
  let a:owner.serial += 1
  let context.serial = a:owner.serial
  if index(call(a:owner.ports.Capabilities, []), 'attachment-typed-open-v1') >= 0
    try
      let context.typed = 1
      let context.owner = a:owner.generation
      let context.settings = wbx#attachments#settings(a:action)
      let selectors = a:action ==# 'download' ? [] : wbx#attachments#selectors(context.settings)
      let snapshot_buffer = bufnr('^wbx://image$')
      let snapshot = getbufvar(snapshot_buffer, 'wbx_view_image', {})
      let source = getbufvar(snapshot_buffer, 'wbx_image_source', {})
      if a:action ==# 'open' && empty(context.settings.handlers) && get(snapshot, 'id', '') ==# context.attachment
            \ && source ==# {'owner': context.owner, 'room': context.room, 'message': context.message}
            \ && wbx#view#owned(snapshot_buffer, 'image') && !wbx#view#edited(snapshot_buffer)
        call wbx#images#open(snapshot, context.settings.mode)
        return
      endif
      if a:action ==# 'open' && call(a:owner.ports.ImageBusy, []) | call call(a:owner.ports.Notify, ['Opening attachment; an active preview may delay admission by up to ten seconds.']) | endif
      let params = {'roomId': context.room, 'messageId': context.message, 'attachmentId': context.attachment, 'action': a:action, 'selectors': selectors}
      if index(call(a:owner.ports.Capabilities, []), 'attachment-chunks-v1') >= 0 | let context.transfer = 1 | let params.transfer = 'chunks-v1' | endif
      if strlen(json_encode({'jsonrpc': '2.0', 'id': 2147483647, 'method': 'messages.attachmentResolve', 'params': params})) > 32768 | throw 'Attachment request exceeds its byte limit.' | endif
      let a:owner.intent = context
      let a:owner.busy = 1
      if get(context, 'transfer', 0)
        call wbx#attachment_stream#start(context, params)
      else
        let context.request = call(a:owner.ports.Request, ['messages.attachmentResolve', params, function('s:resolved', [a:owner, context])])
        if context.request < 0 | let a:owner.busy = 0 | let a:owner.intent = {} | endif
      endif
    catch
      call wbx#attachment_open#cancel(a:owner)
      call call(a:owner.ports.Notify, [v:exception])
    endtry
    return
  endif
  " Already-projected images need no extra generic read. Configured file handlers
  " require the filename/MIME from the explicit attachment response first.
  let handlers = get(call(a:owner.ports.Options, []), 'attachment_handlers', {})
  if a:action ==# 'open' && type(handlers) == v:t_dict && empty(handlers)
        \ && !empty(filter(copy(get(message, 'images', [])), 'v:val.id ==# context.attachment && v:val.state ==# "ready"'))
    try
      call wbx#attachment_open#image(a:owner, context)
    catch
      call call(a:owner.ports.Notify, [v:exception])
    endtry
    return
  endif
  if index(call(a:owner.ports.Capabilities, []), 'message-attachments') < 0
    call call(a:owner.ports.Notify, ['Attachment opening requires an updated backend. Preserve drafts, rebuild and restart when ready.'])
    return
  endif
  call call(a:owner.ports.Notify, ['Legacy attachment backend: generic/image dispatch may require two reads and the generic 6 MB limit. Rebuild/restart deliberately for single-fetch support.'])
  let a:owner.busy = 1
  if call(a:owner.ports.Request, ['messages.attachmentOpen', {'roomId': context.room, 'messageId': context.message, 'attachmentId': context.attachment}, function('s:done', [a:owner, context])]) < 0
    let a:owner.busy = 0
  endif
endfunction
function! s:picked(owner, origin, context, files, choice) abort
  if a:choice < 1 || a:choice > len(a:files) || !wbx#view#picker_valid(a:origin)
        \ || !wbx#attachment_open#context(a:owner, extend(copy(a:context), {'attachment': a:files[a:choice - 1].id}))
        \ || get(call(a:owner.ports.Message, []), 'attachments', []) !=# a:files | return | endif
  call wbx#attachment_open#open(a:owner, a:context.action, string(a:choice))
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
