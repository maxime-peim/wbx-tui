" Destination-bound local state only. No transport, receipt authority or UI focus.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:drafts = {}
let s:replies = {}
let s:sends = {}
let s:uncertain = {}
let s:uncertain_serial = 0
function! s:uncertain(room) abort
  let s:uncertain_serial += 1
  let s:uncertain[a:room] = s:uncertain_serial
endfunction
let s:upload_next = 0
let s:presence = {}
let s:badges = {}
let s:badge_revision = 0
function! wbx#drafts#revision() abort
  return s:badge_revision
endfunction
function! s:count(value, delta) abort
  if empty(a:value) | return | endif
  let room = a:value.room
  if !has_key(s:badges, room) | let s:badges[room] = {'normal': 0, 'reply': 0} | endif
  let key = a:value.reply ? 'reply' : 'normal'
  let s:badges[room][key] += a:delta
  if s:badges[room].normal + s:badges[room].reply <= 0 | call remove(s:badges, room) | endif
endfunction
function! wbx#drafts#forget(buffer) abort
  let key = string(a:buffer)
  if !has_key(s:presence, key) | return 0 | endif
  call s:count(remove(s:presence, key), -1)
  let s:badge_revision += 1
  return 1
endfunction
function! wbx#drafts#observe(buffer) abort
  let next = {}
  if getbufvar(a:buffer, 'wbx_registered_draft', 0) && wbx#view#owned(a:buffer, 'compose')
    let length = wbx#drafts#length(a:buffer)
    if (length.units !=# 0 || !empty(getbufvar(a:buffer, 'wbx_staged_upload', {}))) && !wbx#drafts#is_sent(a:buffer)
      let next = {'room': getbufvar(a:buffer, 'wbx_room'), 'reply': !empty(getbufvar(a:buffer, 'wbx_parent', ''))}
    endif
  endif
  let key = string(a:buffer)
  if get(s:presence, key, {}) ==# next | return 0 | endif
  call wbx#drafts#forget(a:buffer)
  if !empty(next) | let s:presence[key] = next | call s:count(next, 1) | let s:badge_revision += 1 | endif
  return 1
endfunction
function! wbx#drafts#is_sent(buffer) abort
  let sent = getbufvar(a:buffer, 'wbx_confirmed_sent', {})
  return !empty(sent) && getbufvar(a:buffer, 'changedtick', -1) == sent.tick
        \ && getbufvar(a:buffer, 'wbx_room', '') ==# sent.roomId
        \ && getbufvar(a:buffer, 'wbx_parent', '') ==# sent.parentId
        \ && getbufvar(a:buffer, 'wbx_format', 'plain') ==# sent.format
        \ && getbufvar(a:buffer, 'wbx_attachment_revision', 0) == get(sent, 'attachmentRevision', 0)
endfunction
function! wbx#drafts#rooms(rooms) abort
  " One lookup per LOADED room, never a scan/copy of every retained draft body.
  let out = []
  for room in a:rooms
    let flags = get(s:badges, room.id, {})
    call add(out, extend(copy(room), {'localDraft': get(flags, 'normal', 0) > 0, 'localReplyDraft': get(flags, 'reply', 0) > 0}))
  endfor
  return out
endfunction
function! wbx#drafts#length(buffer) abort
  let tick = getbufvar(a:buffer, 'changedtick', -1)
  let cached = getbufvar(a:buffer, 'wbx_draft_length', {})
  if get(cached, 'tick', -2) == tick | return copy(cached) | endif
  " Match existing wire limits, not glyph/cell counts. At most 1001 short rows
  " and 4004 bytes/row are inspected once per changedtick; huge native drafts
  " display an honest lower bound instead of adding unbounded statusline work.
  let units = 0 | let bytes = 0 | let first = 1
  for text in getbufline(a:buffer, 1, 1001)
    let units += !first | let bytes += !first | let first = 0
    let bytes += strlen(text)
    for code in str2list(strpart(text, 0, 4004))
      let units += code > 65535 ? 2 : 1
      if units > 1000 | break | endif
    endfor
    if units > 1000 || bytes > 4000 | break | endif
  endfor
  let value = {'tick': tick, 'units': units > 1000 ? '>1000' : units, 'bytes': bytes > 4000 ? '>4000' : bytes,
        \ 'valid': units <= 1000 && bytes <= 4000}
  call setbufvar(a:buffer, 'wbx_draft_length', value)
  return copy(value)
endfunction
function! wbx#drafts#summary(buffer) abort
  let length = wbx#drafts#length(a:buffer)
  return toupper(getbufvar(a:buffer, 'wbx_format', 'plain')) . ' · ' . length.units . '/1000 UTF-16 · '
        \ . length.bytes . '/4000 bytes' . (length.valid ? '' : ' · OVER LIMIT; not sendable')
endfunction
function! wbx#drafts#draft_id(buffer) abort
  if wbx#conversations#is_direct(a:buffer) | return getbufvar(a:buffer, 'wbx_recipient_draft', '') | endif
  if !wbx#view#owned(a:buffer, 'compose') | return '' | endif
  let target = [getbufvar(a:buffer, 'wbx_room'), getbufvar(a:buffer, 'wbx_parent', ''), bufname(a:buffer)]
  if getbufvar(a:buffer, 'wbx_upload_target', []) !=# target
    let s:upload_next += 1
    call setbufvar(a:buffer, 'wbx_upload_target', target)
    call setbufvar(a:buffer, 'wbx_draft_id', 'native-' . getpid() . '-' . s:upload_next)
    call setbufvar(a:buffer, 'wbx_staged_upload', {})
  endif
  return getbufvar(a:buffer, 'wbx_draft_id', '')
endfunction
function! wbx#drafts#upload(buffer, ...) abort
  if empty(wbx#drafts#draft_id(a:buffer)) | return {} | endif
  if a:0
    if (a:0 < 2 || a:2) && get(getbufvar(a:buffer, 'wbx_staged_upload', {}), 'attachmentId', '') !=# get(a:1, 'attachmentId', '')
      call setbufvar(a:buffer, 'wbx_attachment_revision', getbufvar(a:buffer, 'wbx_attachment_revision', 0) + 1)
    endif
    call setbufvar(a:buffer, 'wbx_staged_upload', deepcopy(a:1))
    call wbx#drafts#observe(a:buffer)
  endif
  return deepcopy(getbufvar(a:buffer, 'wbx_staged_upload', {}))
endfunction
function! wbx#drafts#upload_pending(id) abort
  if wbx#conversations#upload_pending(a:id) | return 1 | endif
  for pending in values(s:sends)
    if get(pending, 'attachmentId', '') ==# a:id | return 1 | endif
  endfor
  return 0
endfunction
function! wbx#drafts#buffers() abort
  return copy(s:drafts)
endfunction
function! wbx#drafts#reply(room, ...) abort
  if a:0
    if empty(a:1)
      if has_key(s:replies, a:room) | call remove(s:replies, a:room) | endif
    else
      let s:replies[a:room] = a:1
    endif
  endif
  return get(s:replies, a:room, '')
endfunction
function! wbx#drafts#compose(room, messages, Create) abort
  let parent = wbx#drafts#reply(a:room.id)
  let key = empty(parent) ? a:room.id : 'reply:' . json_encode([a:room.id, parent])
  if !has_key(s:drafts, key) || !wbx#view#owned(s:drafts[key], 'compose')
    let buffer = call(a:Create, [wbx#view#compose_name(a:room.id, parent), 'compose', a:room.id])
    call setbufvar(buffer, 'wbx_parent', parent)
    let s:drafts[key] = buffer
  endif
  call setbufvar(s:drafts[key], 'wbx_title', a:room.title)
  call setbufvar(s:drafts[key], 'wbx_registered_draft', 1)
  call setbufvar(s:drafts[key], 'wbx_reply_label', empty(parent) ? '' : wbx#history#reply_label(a:messages, parent))
  call wbx#drafts#observe(s:drafts[key])
  return s:drafts[key]
endfunction
function! wbx#drafts#pending(...) abort
  if !a:0 | return !empty(s:sends) | endif
  for pending in values(s:sends)
    if pending.roomId ==# a:1 | return 1 | endif
  endfor
  return 0
endfunction
function! wbx#drafts#uncertain(room) abort
  return has_key(s:uncertain, a:room)
endfunction
function! wbx#drafts#mark_uncertain(room) abort
  call s:uncertain(a:room)
endfunction
function! wbx#drafts#evidence(room) abort
  return get(s:uncertain, a:room, 0)
endfunction
function! wbx#drafts#resolve(room, ...) abort
  if a:0 && get(s:uncertain, a:room, 0) != a:1 | return 0 | endif
  if has_key(s:uncertain, a:room) | call remove(s:uncertain, a:room) | endif
  return 1
endfunction
function! wbx#drafts#register(request, params, buffer, tick) abort
  let s:sends[a:request] = extend({'bufnr': a:buffer, 'tick': a:tick}, deepcopy(a:params))
endfunction
function! wbx#drafts#failed(request, uncertain) abort
  if !has_key(s:sends, a:request) | return 0 | endif
  let pending = remove(s:sends, a:request)
  if a:uncertain | call s:uncertain(pending.roomId) | endif
  return 1
endfunction
function! wbx#drafts#delivery(result) abort
  if !has_key(s:sends, a:result.requestId) | return {'known': 0} | endif
  let pending = s:sends[a:result.requestId]
  if pending.roomId !=# a:result.roomId || get(pending, 'parentId', '') !=# get(a:result, 'parentId', '')
        \ || (has_key(a:result, 'text') || has_key(pending, 'format') && has_key(pending, 'attachmentId'))
        \    && pending.text !=# get(a:result, 'text', v:null)
        \ || get(pending, 'attachmentId', '') !=# get(a:result, 'attachmentId', '') || get(pending, 'draftId', '') !=# get(a:result, 'draftId', '')
        \ || get(pending, 'format', '') !=# get(a:result, 'format', '')
    return {'known': 1, 'valid': 0}
  endif
  call remove(s:sends, a:result.requestId)
  if a:result.status ==# 'unknown' | call s:uncertain(pending.roomId) | endif
  return {'known': 1, 'valid': 1, 'pending': deepcopy(pending)}
endfunction
function! wbx#drafts#disconnect() abort
  let pending_count = len(s:sends)
  for pending in values(s:sends) | call s:uncertain(pending.roomId) | endfor
  let s:sends = {}
  return pending_count
endfunction
function! wbx#drafts#revoke_room(room) abort
  for [id, pending] in items(copy(s:sends))
    if pending.roomId ==# a:room | call s:uncertain(a:room) | call remove(s:sends, id) | endif
  endfor
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
