" Account-verified local draft autosave; never send, fetch history or restore files.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:session = ''
let s:profile = ''
let s:revision = ''
let s:records = {}
let s:restorable = {}
let s:opening = 0
let s:writing = {}
let s:write_next = 0
let s:dirty = 0
let s:dirty_records = {}
let s:failed = 0
let s:rejected = {}
let s:timer = -1
function! s:enabled() abort
  return get(wbx#options#normalized(), 'persist_drafts', 1)
endfunction
function! s:notice(text) abort
  echohl WarningMsg | echomsg '[wbx-tui] ' . a:text | echohl None
endfunction
function! wbx#draft_persistence#ready() abort
  if !s:enabled() || !exists('*wbx#supports_local_drafts') || !wbx#supports_local_drafts() | return 1 | endif
  let session = get(get(wbx#state(), 'localContext', {}), 'sessionId', '')
  if s:opening || empty(s:profile) || empty(session) || session !=# s:session
    call s:notice(s:failed ? 'Draft recovery unavailable. Inspect/reconnect explicitly, or deliberately opt out with persist_drafts=false for memory-only work; saved delivery evidence was not resolved.'
          \ : 'Wait for account-verified draft recovery before sending or resolving delivery. Native text retained; nothing queued.')
    return 0
  endif
  return 1
endfunction
function! wbx#draft_persistence#valid(buffer) abort
  let profile = getbufvar(a:buffer, 'wbx_draft_profile', '')
  let session = get(get(wbx#state(), 'localContext', {}), 'sessionId', '')
  if empty(profile) && !empty(getbufvar(a:buffer, 'wbx_draft_session', ''))
        \ && getbufvar(a:buffer, 'wbx_draft_session') !=# session
    call s:notice('This draft was written in an earlier unverified account session. Copy/rename it deliberately before sending.')
    return 0
  endif
  if !empty(profile) && (empty(s:profile) || profile !=# s:profile
        \ || get(get(wbx#state(), 'localContext', {}), 'sessionId', '') !=# s:session)
    call s:notice('This retained draft belongs to another/unverified account. Rename/copy it deliberately before composing for this account.')
    return 0
  endif
  return wbx#draft_persistence#ready()
endfunction
function! wbx#draft_persistence#sync(state) abort
  if !s:enabled() || !exists('*wbx#supports_local_drafts') || !wbx#supports_local_drafts() | return | endif
  let session = get(get(a:state, 'localContext', {}), 'sessionId', '')
  if empty(session) || get(a:state, 'state', '') !=# 'ready' || session ==# s:session | return | endif
  let s:session = session | let s:profile = '' | let s:records = {} | let s:restorable = {}
  let s:dirty = 0 | let s:dirty_records = {} | let s:failed = 0 | let s:rejected = {}
  " Retire logical admission; an old callback cannot release a replacement save.
  let s:writing = {}
  if s:timer >= 0 | call timer_stop(s:timer) | let s:timer = -1 | endif
  let s:opening = 1
  if wbx#rpc('drafts.open', {}, function('s:opened', [session])) < 0 | let s:opening = 0 | endif
endfunction
function! s:opened(session, response) abort
  if a:session !=# s:session || get(get(wbx#state(), 'localContext', {}), 'sessionId', '') !=# a:session | return | endif
  let s:opening = 0
  if has_key(a:response, 'error')
    let s:failed = 1 | call s:notice('Drafts remain in editor memory only: verified private storage is unavailable.') | return
  endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#drafts(value, 1) || value.sessionId !=# a:session | call wbx#_protocol_error() | return | endif
  let s:profile = value.profile | let s:revision = value.revision
  for item in value.items
    let key = json_encode([item.roomId, get(item, 'parentId', '')])
    let s:records[key] = item | let s:restorable[key] = 1
    " Evidence is room-wide, even when its particular reply is never opened.
    " Restoring native text is optional; retaining possible-write evidence is not.
    if item.uncertain && !wbx#drafts#uncertain(item.roomId) | call wbx#drafts#mark_uncertain(item.roomId) | endif
  endfor
  for buffer in values(wbx#drafts#buffers()) | call wbx#draft_persistence#observe(buffer) | endfor
  if exists('*wbx#redraw') | call wbx#redraw() | endif
endfunction
function! wbx#draft_persistence#observe(buffer) abort
  if !bufloaded(a:buffer) || !wbx#view#owned(a:buffer, 'compose') | return | endif
  let tick = getbufvar(a:buffer, 'changedtick', -1)
  let authored = getbufvar(a:buffer, 'wbx_draft_session', '')
  if empty(authored)
    let authored = get(get(wbx#state(), 'localContext', {}), 'sessionId', '')
    call setbufvar(a:buffer, 'wbx_draft_session', authored)
  endif
  " A disk opt-out must not opt out of the conservative in-memory session fence.
  if !s:enabled() | return | endif
  if empty(s:profile)
    if !has_key(getbufvar(a:buffer, ''), 'wbx_draft_candidate')
      call setbufvar(a:buffer, 'wbx_draft_candidate', tick)
    endif
    return
  endif
  let old_profile = getbufvar(a:buffer, 'wbx_draft_profile', '')
  if !empty(old_profile) && old_profile !=# s:profile | return | endif
  if empty(old_profile) && !empty(authored) && authored !=# s:session && getbufline(a:buffer, 1, '$') !=# [''] | return | endif
  let room = getbufvar(a:buffer, 'wbx_room', '')
  let parent = getbufvar(a:buffer, 'wbx_parent', '')
  let key = json_encode([room, parent])
  if empty(old_profile)
    call setbufvar(a:buffer, 'wbx_draft_profile', s:profile)
    let previous = get(s:records, key, {})
    if has_key(s:restorable, key) && !empty(previous) && getbufline(a:buffer, 1, '$') ==# ['']
          \ && tick == getbufvar(a:buffer, 'wbx_draft_candidate', tick)
      call setbufline(a:buffer, 1, split(previous.text, "\n", 1))
      call setbufvar(a:buffer, 'wbx_format', previous.format)
      call setbufvar(a:buffer, 'wbx_restore_language', previous.format)
      for window in win_findbuf(a:buffer)
        call win_execute(window, 'call wbx#draft_persistence#present()')
      endfor
      let tick = getbufvar(a:buffer, 'changedtick')
    endif
    if has_key(s:restorable, key) | call remove(s:restorable, key) | endif
  endif
  let format = getbufvar(a:buffer, 'wbx_format', 'plain')
  let uncertain = wbx#drafts#pending(room) || wbx#drafts#uncertain(room)
  let sent = wbx#drafts#is_sent(a:buffer)
  let observed = [s:session, tick, format, uncertain, sent]
  if getbufvar(a:buffer, 'wbx_draft_saved_observation', []) ==# observed | return | endif
  call setbufvar(a:buffer, 'wbx_draft_saved_observation', observed)
  let value = {'roomId': room, 'text': sent ? '' : join(getbufline(a:buffer, 1, '$'), "\n"),
        \ 'format': format, 'uncertain': !sent && uncertain ? v:true : v:false}
  if !empty(parent) | let value.parentId = parent | endif
  if get(s:records, key, {}) ==# value | return | endif
  if has_key(s:rejected, key) | call remove(s:rejected, key) | endif
  let s:records[key] = value
  let s:dirty_records[key] = value
  let s:dirty = 1 | let s:failed = 0
  if s:timer < 0 | let s:timer = timer_start(500, function('s:save_timer')) | endif
endfunction
function! wbx#draft_persistence#resolved(room) abort
  if !s:enabled() || empty(s:profile) || !wbx#draft_persistence#ready() || wbx#drafts#uncertain(a:room) | return | endif
  for [key, item] in items(s:records)
    if item.roomId ==# a:room && item.uncertain
      let item.uncertain = v:false
      let s:dirty_records[key] = deepcopy(item)
      if has_key(s:rejected, key) | call remove(s:rejected, key) | endif
      let s:dirty = 1
    endif
  endfor
  if s:dirty && s:timer < 0 | let s:timer = timer_start(500, function('s:save_timer')) | endif
endfunction
function! wbx#draft_persistence#present() abort
  if !wbx#view#owned(bufnr('%'), 'compose') || !get(b:, 'wbx_initialized', 0) || !exists('b:wbx_restore_language') | return | endif
  let format = b:wbx_restore_language
  unlet b:wbx_restore_language
  silent call wbx#rich#format(format)
endfunction
function! s:storage(key) abort
  return has_key(s:rejected, a:key) ? 'unsaved/oversize' : get(s:writing, 'key', '') ==# a:key ? 'saving'
        \ : has_key(s:dirty_records, a:key) ? (s:failed ? 'unsaved' : 'queued') : 'saved'
endfunction
function! wbx#draft_persistence#rooms(rooms, state) abort
  if !s:enabled() || empty(s:profile) || get(a:state, 'state', '') !=# 'ready'
        \ || get(get(a:state, 'localContext', {}), 'sessionId', '') !=# s:session | return a:rooms | endif
  let badges = {}
  for [key, item] in items(s:records)
    if empty(item.text) && !item.uncertain | continue | endif
    let flags = get(badges, item.roomId, {'recoveryDraft': 0, 'recoverySaved': 0, 'recoveryUnsaved': 0, 'recoveryUncertain': 0})
    let flags.recoveryDraft = flags.recoveryDraft || !empty(item.text)
    if !empty(item.text)
      let saved = s:storage(key) ==# 'saved'
      let flags.recoverySaved = flags.recoverySaved || saved
      let flags.recoveryUnsaved = flags.recoveryUnsaved || !saved
    endif
    let flags.recoveryUncertain = flags.recoveryUncertain || item.uncertain
    let badges[item.roomId] = flags
  endfor
  return map(copy(a:rooms), 'extend(copy(v:val), get(badges,v:val.id,{}))')
endfunction
function! wbx#draft_persistence#inventory() abort
  let state = wbx#state()
  let session = get(get(state, 'localContext', {}), 'sessionId', '')
  let reason = !s:enabled() ? 'Disk recovery is disabled; native memory-only drafts are not a saved-work index.'
        \ : !exists('*wbx#supports_local_drafts') || !wbx#supports_local_drafts() ? 'Verified disk recovery is unsupported/unavailable; no records exposed.'
        \ : empty(s:profile) || s:opening || session !=# s:session || get(state, 'state', '') !=# 'ready'
        \ ? 'Account-verified recovery is not ready; no earlier account records are exposed.' : ''
  let out = {'session': session, 'profile': empty(reason) ? s:profile : '', 'reason': reason, 'items': []}
  if !empty(reason) | return out | endif
  for key in sort(keys(s:records))
    let item = s:records[key]
    if empty(item.text) && !item.uncertain && !has_key(s:dirty_records, key)
          \ && get(s:writing, 'key', '') !=# key && !has_key(s:rejected, key) | continue | endif
    let storage = s:storage(key)
    call add(out.items, {'key': key, 'roomId': item.roomId, 'parentId': get(item, 'parentId', ''),
          \ 'format': item.format, 'bytes': strlen(item.text), 'uncertain': item.uncertain || wbx#drafts#uncertain(item.roomId),
          \ 'storage': storage, 'fingerprint': sha256(json_encode(item))})
  endfor
  return out
endfunction
function! wbx#draft_persistence#record(key, fingerprint) abort
  if !empty(wbx#draft_persistence#inventory().reason) | return {} | endif
  let item = get(s:records, a:key, {})
  return empty(item) || sha256(json_encode(item)) !=# a:fingerprint ? {} : deepcopy(item)
endfunction
function! wbx#draft_persistence#restore_reason(key, fingerprint) abort
  let item = wbx#draft_persistence#record(a:key, a:fingerprint)
  if empty(item) | return 'Recovery record changed or is no longer verified.' | endif
  let state = wbx#state() | let room = get(state, 'room', v:null) | let parent = get(item, 'parentId', '')
  if type(room) != v:t_dict || room.id !=# item.roomId || !get(state, 'ready', 0)
        \ || empty(filter(copy(get(state, 'rooms', [])), 'v:val.id ==# item.roomId && !get(v:val,"cached",0)'))
        \ || !empty(parent) && empty(filter(copy(get(state, 'messages', [])), 'v:val.id ==# parent && empty(get(v:val,"parentId",""))'))
    return 'Restore needs the exact ready selected space and a loaded reply root. Export remains inert/available; no history was fetched.'
  endif
  let buffer = bufnr(wbx#view#compose_name(item.roomId, parent))
  if buffer > 0 && (!wbx#view#owned(buffer, 'compose') || !bufloaded(buffer) || getbufvar(buffer, 'wbx_draft_profile', '') !=# s:profile
        \ || getbufline(buffer, 1, '$') !=# split(item.text, "\n", 1) || getbufvar(buffer, 'wbx_format', 'plain') !=# item.format)
    return 'Existing native draft retained. Export the saved text; nothing was overwritten.'
  endif
  if buffer <= 0 && !has_key(s:restorable, a:key)
    return 'This record was already considered for restore. Export it explicitly; no native buffer was recreated.'
  endif
  return ''
endfunction
function! wbx#draft_persistence#restore(key, fingerprint) abort
  let reason = wbx#draft_persistence#restore_reason(a:key,a:fingerprint)
  if !empty(reason) | call s:notice(reason) | return 0 | endif
  let item = wbx#draft_persistence#record(a:key,a:fingerprint)
  call wbx#drafts#reply(item.roomId, get(item,'parentId',''))
  call wbx#compose()
  return 1
endfunction
function! wbx#draft_persistence#discard(key, fingerprint) abort
  let item = wbx#draft_persistence#record(a:key, a:fingerprint)
  if empty(item) || wbx#drafts#pending(item.roomId) | return 0 | endif
  let buffer = bufnr(wbx#view#compose_name(item.roomId, get(item, 'parentId', '')))
  if buffer > 0
    call s:notice('A native draft still owns this destination. Export/clear it deliberately there; the saved index cannot discard newer native work.') | return 0
  endif
  let item.text = ''
  " Discarding text is NOT delivery resolution, including unopened replies.
  let item.uncertain = item.uncertain || wbx#drafts#uncertain(item.roomId) ? v:true : v:false
  let s:records[a:key] = item | let s:dirty_records[a:key] = deepcopy(item)
  if has_key(s:restorable, a:key) | call remove(s:restorable, a:key) | endif
  if has_key(s:rejected, a:key) | call remove(s:rejected, a:key) | endif
  let s:dirty = 1 | let s:failed = 0
  if s:timer < 0 | let s:timer = timer_start(500, function('s:save_timer')) | endif
  return 1
endfunction
function! s:save_timer(timer) abort
  if a:timer != s:timer | return | endif
  let s:timer = -1
  call s:save()
endfunction
function! s:save() abort
  let state = wbx#state()
  if !empty(s:writing) || !s:dirty || empty(s:profile) || !s:enabled() || get(state, 'state', '') !=# 'ready'
        \ || !wbx#supports_local_drafts() || get(get(state, 'localContext', {}), 'sessionId', '') !=# s:session | return | endif
  " Preserve the existing 32 KiB RPC framing limit. Patch one draft at a time,
  " never serialize all retained message bodies into a single oversized request.
  for key in sort(keys(s:dirty_records))
    let item = s:dirty_records[key]
    if strlen(json_encode(item)) <= 24576 | break | endif
    let s:rejected[key] = deepcopy(item)
    call remove(s:dirty_records, key)
    call s:notice('An oversized draft cannot be autosaved (24 KiB encoded limit). Its native/previous disk text is retained; other drafts continue saving.')
  endfor
  let s:dirty = !empty(s:dirty_records)
  if !s:dirty | return | endif
  call remove(s:dirty_records, key)
  let s:dirty = !empty(s:dirty_records)
  let s:write_next += 1
  let owner = {'serial': s:write_next, 'session': s:session, 'profile': s:profile, 'key': key}
  let s:writing = owner
  if wbx#rpc('drafts.save', {'profile': s:profile, 'revision': s:revision, 'items': [item]},
        \ function('s:saved', [owner])) < 0 && s:writing ==# owner
    let s:dirty_records[key] = s:records[key]
    let s:writing = {} | let s:dirty = 1 | let s:failed = 1
  endif
endfunction
function! s:saved(owner, response) abort
  if s:writing !=# a:owner || a:owner.session !=# s:session || a:owner.profile !=# s:profile | return | endif
  let s:writing = {}
  if has_key(a:response, 'error')
    let s:dirty_records[a:owner.key] = s:records[a:owner.key]
    let s:dirty = 1 | let s:failed = 1
    call s:notice('Draft autosave failed. Native text is retained; inspect storage/account or another editor before quitting.')
    return
  endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#drafts(value, 0) || value.sessionId !=# a:owner.session || value.profile !=# a:owner.profile
    call wbx#_protocol_error() | return
  endif
  let s:revision = value.revision
  if s:dirty | call s:save() | endif
  if exists('*wbx#redraw') | call wbx#redraw() | endif
endfunction
function! wbx#draft_persistence#flush() abort
  if !s:enabled() || empty(s:session) | return | endif
  for buffer in values(wbx#drafts#buffers()) | call wbx#draft_persistence#observe(buffer) | endfor
  if s:timer >= 0 | call timer_stop(s:timer) | let s:timer = -1 | endif
  let start = reltime()
  while s:opening && reltimefloat(reltime(start)) < 4 | sleep 10m | endwhile
  call s:save()
  while (!empty(s:writing) || s:dirty && !s:failed) && reltimefloat(reltime(start)) < 4 | sleep 10m | endwhile
  if s:opening || !empty(s:writing) || s:dirty || !empty(s:rejected)
    call s:notice('Some drafts were NOT saved to disk; retain/export the native buffers before leaving the editor.')
  endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
