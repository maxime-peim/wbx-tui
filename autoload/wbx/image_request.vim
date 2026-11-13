" Image preview/open requests and shared logical admission only. No bytes, rendering, leases or RPC registry.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#image_request#new(ports) abort
  return {'ports':a:ports, 'attempts':{}, 'metadata':{}, 'busy':{}, 'room':''}
endfunction
function! wbx#image_request#reset(owner) abort
  let a:owner.busy = {}
  let a:owner.attempts = {}
  let a:owner.metadata = {}
  let a:owner.room = ''
endfunction
function! wbx#image_request#observe(owner, room) abort
  let room = type(a:room) == v:t_dict ? a:room.id : ''
  if room !=# a:owner.room
    let a:owner.room = room
    let a:owner.attempts = {}
    let a:owner.metadata = {}
  endif
endfunction
function! wbx#image_request#busy(owner) abort
  return !empty(a:owner.busy)
endfunction
function! wbx#image_request#set_busy(owner, value, ...) abort
  if a:value
    if !empty(a:owner.busy) | return {} | endif
    let a:owner.busy = {'read':1}
    return a:owner.busy
  endif
  if !a:0 || empty(a:1) || a:owner.busy isnot a:1 | return 0 | endif
  let a:owner.busy = {}
  return 1
endfunction
function! wbx#image_request#snapshot(source, id) abort
  let buffer = bufnr('^wbx://image$')
  let snapshot = getbufvar(buffer, 'wbx_view_image', {})
  return get(snapshot, 'id', '') ==# a:id && has_key(snapshot, 'width')
        \ && getbufvar(buffer, 'wbx_image_source', {}) ==# a:source
        \ && wbx#view#owned(buffer, 'image') && !wbx#view#edited(buffer) ? snapshot : {}
endfunction
function! s:preview_done(owner, read, response) abort
  if !wbx#image_request#set_busy(a:owner, 0, a:read) | return | endif
  call wbx#images#schedule()
endfunction
function! s:visible(owner, room, pending, attempts, method) abort
  if len(a:attempts) >= 16 | return 0 | endif
  for pending in a:pending
    if pending.row >= line('w0') && pending.row <= line('w$') && foldclosed(pending.row) < 0 && !has_key(a:attempts, pending.messageId)
      let a:attempts[pending.messageId] = 1
      let read = wbx#image_request#set_busy(a:owner, 1)
      if call(a:owner.ports.Request, [a:method, {'roomId': a:room.id, 'messageId': pending.messageId}, function('s:preview_done', [a:owner, read])]) < 0
        call wbx#image_request#set_busy(a:owner, 0, read)
      endif
      return 1
    endif
  endfor
  return 0
endfunction
function! wbx#image_request#visible(owner) abort
  if wbx#image_request#busy(a:owner) || !call(a:owner.ports.Ready, []) || call(a:owner.ports.Disconnected, [])
        \ || call(a:owner.ports.Blocked, []) || !wbx#view#owned(bufnr('%'), 'history') || wbx#view#edited(bufnr('%'))
        \ || !get(call(a:owner.ports.State, []), 'ready', 0) | return | endif
  let room = get(call(a:owner.ports.State, []), 'room', v:null)
  if type(room) != v:t_dict || get(b:, 'wbx_history_room', '') !=# room.id | return | endif
  if has_key(a:owner.ports, 'Metadata') && call(a:owner.ports.Metadata, []) ==# ['headers-v1']
        \ && s:visible(a:owner, room, get(b:, 'wbx_attachment_pending', []), a:owner.metadata, 'messages.attachmentMetadata') | return | endif
  if index(call(a:owner.ports.Capabilities, []), 'message-images') < 0
        \ || get(call(a:owner.ports.Options, []), 'images', 'auto') is v:false || get(call(a:owner.ports.Options, []), 'images', 'auto') is 0 | return | endif
  call s:visible(a:owner, room, get(b:, 'wbx_image_pending', []), a:owner.attempts, 'messages.images')
endfunction
function! s:opened(owner, context, read, response) abort
  if !wbx#image_request#set_busy(a:owner, 0, a:read) | return | endif
  call wbx#images#schedule()
  if a:context.source.owner != call(a:owner.ports.Generation, []) || has_key(a:response, 'error') | return | endif
  let opened = get(a:response, 'result', v:null)
  if !wbx#protocol#opened_image(opened) || opened.id !=# a:context.image
    call call(a:owner.ports.ProtocolError, [])
    return
  endif
  if win_getid() != a:context.window || bufnr('%') != a:context.buffer | return | endif
  let message = call(a:owner.ports.Message, [])
  if get(message, 'id', '') !=# a:context.message || get(b:, 'wbx_history_room', '') !=# a:context.room | return | endif
  for image in get(message, 'images', [])
    if image.id ==# a:context.image
      try
        call wbx#images#open(opened, a:context.mode, a:context.source)
      catch
        call call(a:owner.ports.Notify, [v:exception])
      endtry
      return
    endif
  endfor
endfunction
function! wbx#image_request#open(owner, mode, index) abort
  let mode = empty(a:mode) ? get(call(a:owner.ports.Options, []), 'image_open', 'buffer') : a:mode
  if index(['buffer', 'external'], mode) < 0 | call call(a:owner.ports.Notify, ['image_open must be buffer or external.']) | return | endif
  if mode ==# 'external'
    try
      call wbx#image_external#validate()
    catch
      call call(a:owner.ports.Notify, [v:exception])
      return
    endtry
  endif
  " Viewer-local snapshots never reselect or authorize a history destination.
  if wbx#view#owned(bufnr('%'), 'image') && !wbx#view#edited(bufnr('%'))
    try
      call wbx#images#open(get(b:, 'wbx_view_image', {}), mode)
    catch
      call call(a:owner.ports.Notify, [v:exception])
    endtry
    return
  endif
  let message = call(a:owner.ports.Message, [])
  let images = get(message, 'images', [])
  if empty(images) | call call(a:owner.ports.Notify, ['Place the cursor on a message with a Webex image attachment.']) | return | endif
  let number = 1
  if !empty(a:index)
    if a:index !~# '^[1-4]$' | call call(a:owner.ports.Notify, ['Image index must be 1–4.']) | return | endif
    let number = str2nr(a:index)
  else
    for placement in get(b:, 'wbx_image_placements', [])
      if line('.') >= placement.row - 1 && line('.') < placement.row + 12
        let found = index(map(copy(images), 'v:val.id'), placement.id)
        if found >= 0 | let number = found + 1 | endif
      endif
    endfor
  endif
  if number > len(images) | call call(a:owner.ports.Notify, ['That image attachment is not present.']) | return | endif
  let image = images[number - 1]
  let context = {'window': win_getid(), 'buffer': bufnr('%'), 'message': message.id, 'room': b:wbx_history_room, 'image': image.id, 'mode': mode}
  let context.source = {'owner':call(a:owner.ports.Generation, []), 'room':context.room, 'message':context.message}
  let buffer = bufnr('^wbx://image$')
  if mode ==# 'buffer' && get(getbufvar(buffer, 'wbx_view_image', {}), 'id', '') ==# image.id
        \ && getbufvar(buffer, 'wbx_image_source', {}) ==# context.source
        \ && (!wbx#view#owned(buffer, 'image') || wbx#view#edited(buffer) || !bufloaded(buffer))
    call call(a:owner.ports.Notify, ['Image buffer holds other work. Rename or close it explicitly before reopening.'])
    return
  endif
  let snapshot = wbx#image_request#snapshot(context.source, image.id)
  if !empty(snapshot)
    try
      call wbx#images#open(snapshot, mode)
    catch
      call call(a:owner.ports.Notify, [v:exception])
    endtry
  elseif index(call(a:owner.ports.Capabilities, []), 'image-opening') < 0
    call call(a:owner.ports.Notify, ['Higher-resolution image opening requires an updated backend. Preserve drafts, rebuild and restart when ready.'])
  elseif !wbx#image_request#busy(a:owner)
    let read = wbx#image_request#set_busy(a:owner, 1)
    if call(a:owner.ports.Request, ['messages.imageOpen', {'roomId': context.room, 'messageId': message.id, 'imageId': image.id}, function('s:opened', [a:owner, context, read])]) < 0
      call wbx#image_request#set_busy(a:owner, 0, read)
    endif
  else
    call call(a:owner.ports.Notify, ['Another image read is active; try opening again when it finishes.'])
  endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
