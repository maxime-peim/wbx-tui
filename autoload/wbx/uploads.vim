" Explicit file selection/cancellation and inert metadata. No bytes or local file I/O.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:serial = 0
let s:stage = {}
let s:progress = {}
let s:owners = {} " At most eight discovery hints, never draft or send authority.
function! s:owned(buffer) abort
  return wbx#view#owned(a:buffer, 'compose') || wbx#conversations#is_direct(a:buffer)
endfunction
function! s:binding(buffer) abort
  if wbx#conversations#is_direct(a:buffer)
    return {'targetId': getbufvar(a:buffer, 'wbx_recipient').targetId, 'draftId': wbx#drafts#draft_id(a:buffer)}
  endif
  let binding = {'roomId': getbufvar(a:buffer, 'wbx_room', ''), 'draftId': wbx#drafts#draft_id(a:buffer)}
  let parent = getbufvar(a:buffer, 'wbx_parent', '')
  if !empty(parent) | let binding.parentId = parent | endif
  return binding
endfunction
function! s:notice(text) abort
  echohl WbxWarning | echo '[wbx-tui] ' . a:text | echohl None
endfunction
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Yes, continue", 1) == 2
endfunction
function! s:staged(context, response) abort
  let current = !empty(s:stage) && s:stage.serial == a:context.serial
  if current | let s:stage = {} | endif
  if has_key(a:response, 'error')
    if current | let s:progress = {} | call wbx#redraw_status() | endif
    return
  endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#staged_upload(value) | call wbx#_protocol_error() | return | endif
  if !current || !s:owned(a:context.buffer) || s:binding(a:context.buffer) !=# a:context.binding
        \ || wbx#conversations#is_direct(a:context.buffer) && getbufvar(a:context.buffer, 'wbx_recipient_stale', 0)
    if wbx#supports('uploads-v1') | call wbx#rpc('uploads.remove', extend(copy(a:context.binding), {'attachmentId': value.attachmentId})) | endif
    return
  endif
  let old = wbx#drafts#upload(a:context.buffer)
  call wbx#drafts#upload(a:context.buffer, value)
  let s:owners[a:context.binding.draftId] = a:context.buffer
  if !empty(old) && !get(old, 'stale', 0) && !wbx#drafts#upload_pending(old.attachmentId)
    call wbx#rpc('uploads.remove', extend(copy(a:context.binding), {'attachmentId': old.attachmentId}))
  endif
  let s:progress = {}
  call wbx#redraw_status()
endfunction
function! wbx#uploads#stage(path) abort
  if !s:owned(bufnr('%')) || (wbx#conversations#is_direct(bufnr('%'))
        \ ? get(b:, 'wbx_recipient_stale', 0) || (!wbx#supports_direct('single-file-v1') && !wbx#supports_direct('markdown-single-file-v1'))
        \ : empty(wbx#destination()) || !wbx#destination().ready)
    call s:notice('Stage only in a ready destination-bound composer.') | return
  endif
  if !wbx#supports('uploads-v1') | call s:notice('Uploads need an updated connected backend.') | return | endif
  if !empty(s:stage) | call s:notice('File staging is active. No selection was queued.') | return | endif
  let origin = wbx#view#intent()
  let binding = s:binding(bufnr('%'))
  let old = wbx#drafts#upload(bufnr('%'))
  let path = empty(a:path) ? input('Attach one local file (10 MiB upload; generic receive 6,000,000 bytes): ', '', 'file') : a:path
  if empty(path) | return | endif
  if !empty(old) && !s:confirm('Replace this draft file snapshot "' . old.name . '" after successful staging? The previous snapshot remains if staging fails. Sending is separate.') | return | endif
  if !wbx#view#intent_valid(origin) || s:binding(bufnr('%')) !=# binding || wbx#drafts#upload(bufnr('%')) !=# old | return | endif
  let s:serial += 1
  let s:stage = {'serial': s:serial, 'buffer': bufnr('%'), 'binding': binding}
  call wbx#rpc('uploads.stage', extend(copy(binding), {'path': fnamemodify(path, ':p')}), function('s:staged', [deepcopy(s:stage)]))
endfunction
function! wbx#uploads#remove() abort
  if !s:owned(bufnr('%')) | call s:notice('Choose a composer first.') | return | endif
  let binding = s:binding(bufnr('%'))
  if !empty(s:stage) && s:stage.buffer == bufnr('%')
    let s:stage = {} | let s:serial += 1
    if wbx#supports('uploads-v1') | call wbx#rpc('uploads.cancel', {'draftId': binding.draftId, 'phase': 'stage'}) | endif
  endif
  let value = wbx#drafts#upload(bufnr('%'))
  call wbx#drafts#upload(bufnr('%'), {})
  if has_key(s:owners, binding.draftId) | call remove(s:owners, binding.draftId) | endif
  if !empty(value) && !get(value, 'stale', 0) && wbx#supports('uploads-v1')
    call wbx#rpc('uploads.remove', extend(copy(binding), {'attachmentId': value.attachmentId}))
  endif
  let s:progress = {}
  call wbx#redraw_status()
endfunction
function! wbx#uploads#cancel() abort
  if !s:owned(bufnr('%')) || !wbx#supports('uploads-v1') | return | endif
  call wbx#rpc('uploads.cancel', {'draftId': wbx#drafts#draft_id(bufnr('%'))})
endfunction
function! wbx#uploads#invalidate() abort
  let buffers = uniq(sort(values(s:owners) + (empty(s:stage) ? [] : [s:stage.buffer]), 'n'))
  let s:stage = {} | let s:progress = {} | let s:owners = {} | let s:serial += 1
  for buffer in buffers
    let value = wbx#drafts#upload(buffer)
    if !empty(value) | let value.stale = 1 | call wbx#drafts#upload(buffer, value) | endif
  endfor
endfunction
function! wbx#uploads#revoke_room(room) abort
  for [id, buffer] in items(copy(s:owners))
    if getbufvar(buffer, 'wbx_room', '') ==# a:room
      let value = wbx#drafts#upload(buffer)
      if !empty(value) | let value.stale = 1 | call wbx#drafts#upload(buffer, value) | endif
      call remove(s:owners, id)
    endif
  endfor
  if !empty(s:stage) && get(s:stage.binding, 'roomId', '') ==# a:room | let s:stage = {} | let s:serial += 1 | endif
  if get(s:progress, 'roomId', '') ==# a:room | let s:progress = {} | endif
endfunction
function! wbx#uploads#progress(value) abort
  let binding = filter(copy(a:value), 'index(["roomId", "parentId", "targetId", "draftId"], v:key) >= 0')
  let known = !empty(s:stage) && s:stage.binding ==# binding
  if !known
    let buffer = get(s:owners, a:value.draftId, 0)
    if buffer
      let value = wbx#drafts#upload(buffer)
      if !empty(value) && !get(value, 'stale', 0) && value.attachmentId ==# a:value.attachmentId
            \ && s:binding(buffer) ==# binding
        let known = 1
      endif
    endif
  endif
  if known | let s:progress = deepcopy(a:value) | call wbx#redraw_status() | endif
endfunction
function! wbx#uploads#label(buffer) abort
  if empty(getbufvar(a:buffer, 'wbx_staged_upload', {})) && empty(s:stage) && empty(s:progress) | return '' | endif
  " A promoted native file may display inert metadata, never gain send authority.
  let value = deepcopy(getbufvar(a:buffer, 'wbx_staged_upload', {}))
  let label = empty(value) ? '' : (get(value, 'stale', 0) ? 'FILE STALE; reselect snapshot: ' : 'FILE snapshot: ') . value.name . ' (' . value.bytes . ' bytes)'
  if !empty(s:progress) && get(s:progress, 'draftId', '') ==# wbx#drafts#draft_id(a:buffer)
    let label .= ' · ' . toupper(s:progress.phase) . ' ' . s:progress.bytes . '/' . s:progress.total
  endif
  return label
endfunction
function! wbx#uploads#status() abort
  let label = wbx#uploads#label(bufnr('%'))
  call s:notice((empty(label) ? 'No staged attachment in this draft.' : label)
        \ . ' · one file; Plain/Markdown combinations need explicit support · upload max 10 MiB; generic receive max 6,000,000 bytes'
        \ . ' · not sent.')
endfunction
function! wbx#uploads#same(pending) abort
  if !empty(s:stage) && s:stage.buffer == a:pending.bufnr | return 0 | endif
  let value = getbufvar(a:pending.bufnr, 'wbx_staged_upload', {})
  return get(value, 'attachmentId', '') ==# get(a:pending, 'attachmentId', '') && !get(value, 'stale', 0)
endfunction
function! wbx#uploads#delivered(pending, result) abort
  if !has_key(a:pending, 'attachmentId') | return | endif
  let value = wbx#drafts#upload(a:pending.bufnr)
  if empty(value) && has_key(s:owners, a:pending.draftId) | call remove(s:owners, a:pending.draftId) | endif
  if a:result.status ==# 'sent' && get(value, 'attachmentId', '') ==# a:pending.attachmentId
    call wbx#drafts#upload(a:pending.bufnr, {}, 0)
    if has_key(s:owners, a:pending.draftId) | call remove(s:owners, a:pending.draftId) | endif
  elseif a:result.status !=# 'sent' && get(value, 'attachmentId', '') !=# a:pending.attachmentId && wbx#supports('uploads-v1')
    let binding = extend(has_key(a:pending, 'targetId') ? {'targetId': a:pending.targetId} : {'roomId': a:pending.roomId},
          \ {'draftId': a:pending.draftId, 'attachmentId': a:pending.attachmentId})
    if has_key(a:pending, 'parentId') | let binding.parentId = a:pending.parentId | endif
    call wbx#rpc('uploads.remove', binding)
  endif
  let s:progress = {}
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
