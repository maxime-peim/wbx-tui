" Explicit recipient drafts and conversation/member actions. No secrets or role inference.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:buffers = {}
let s:pending = {}
let s:serial = 0
let s:action = {}
let s:unknown = {}
let s:created = {}
let s:epoch = 0
let s:descriptions = {} " At most eight active preparations; text/undo remain in native buffers.
let s:description_read = {}
let s:team_read = {}
function! s:key(intent) abort
  return a:intent.action . ':' . get(a:intent, index(['team-rename', 'team-describe'], a:intent.action) >= 0 ? 'teamId' : 'roomId', '')
endfunction
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Yes, continue", 1) == 2
endfunction
function! s:pick(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! s:notice(text) abort
  echohl WbxWarning | echomsg '[wbx-tui] ' . a:text | echohl None
endfunction
function! s:owned(buffer) abort
  let target = getbufvar(a:buffer, 'wbx_recipient', {})
  return bufexists(a:buffer) && getbufvar(a:buffer, '&buftype') ==# 'nofile' && !empty(target)
        \ && bufname(a:buffer) ==# 'wbx://direct/' . target.targetId
endfunction
function! wbx#conversations#is_direct(buffer) abort
  return s:owned(a:buffer)
endfunction
function! wbx#conversations#pending() abort
  return !empty(s:pending) || !empty(s:action) || !empty(s:description_read) || !empty(s:team_read)
endfunction
function! wbx#conversations#upload_pending(id) abort
  for pending in values(s:pending)
    if get(pending, 'attachmentId', '') ==# a:id | return 1 | endif
  endfor
  return 0
endfunction
function! wbx#conversations#send_reason() abort
  let rich = get(b:, 'wbx_format', 'plain') ==# 'markdown'
  let file = !empty(get(b:, 'wbx_staged_upload', {}))
  let mode = rich ? (file ? 'markdown-single-file-v1' : 'markdown-v1') : (file ? 'single-file-v1' : '')
  return !empty(mode) && !wbx#supports_direct(mode) ? 'Recipient mode needs explicit ' . mode . ' support; no downgrade or file drop' : ''
endfunction
function! s:prepared(origin, response) abort
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#recipient(value) | call wbx#_protocol_error() | return | endif
  if !wbx#view#intent_valid(a:origin)
    if wbx#supports('conversations-v1') | call wbx#rpc('direct.discard', {'targetId': value.targetId}) | endif
    call s:notice('Recipient preparation changed focus. No placeholder/message was sent.') | return
  endif
  for [id, buffer] in items(copy(s:buffers))
    if !s:owned(buffer) || getbufvar(buffer, 'wbx_recipient_stale', 0) | call remove(s:buffers, id) | endif
  endfor
  if len(s:buffers) >= 8
    call wbx#rpc('direct.discard', {'targetId': value.targetId}) | call s:notice('Recipient draft budget reached. Cancel an unused preparation explicitly.') | return
  endif
  execute 'new wbx://direct/' . value.targetId
  setlocal buftype=nofile bufhidden=hide noswapfile modifiable
  setlocal noundofile nomodeline
  let b:wbx_recipient = deepcopy(value)
  let b:wbx_recipient_status = 'prepared; first Send may create a persistent DM'
  let b:wbx_recipient_stale = 0
  let b:wbx_recipient_draft = 'direct-' . getpid() . '-' . value.targetId
  call wbx#completion#sync()
  let s:buffers[value.targetId] = bufnr('%')
  setlocal statusline=%!wbx#conversations#status()
  setlocal filetype=wbx-direct
  call wbx#completion#sync()
  call s:notice('Direct draft prepared · not sent. First send may create a persistent DM.')
endfunction
function! wbx#conversations#direct(person) abort
  if !wbx#supports('conversations-v1') | call s:notice('New conversations require an updated connected backend.') | return | endif
  let origin = wbx#view#intent()
  let person = empty(a:person) ? input('Exact person ID or email (no name scan): ') : a:person
  if empty(person) || !wbx#view#intent_valid(origin) | return | endif
  call wbx#rpc('direct.prepare', {'person': person}, function('s:prepared', [origin]))
endfunction
function! s:response(request, response) abort
  if !has_key(s:pending, a:request) | return | endif
  if has_key(a:response, 'error')
    let pending = remove(s:pending, a:request)
    if s:owned(pending.buffer)
      call setbufvar(pending.buffer, 'wbx_recipient_revision', getbufvar(pending.buffer, 'wbx_recipient_revision', 0) + 1)
      call setbufvar(pending.buffer, 'wbx_recipient_status', 'unknown; check exact recipient in Webex before resolving')
    endif
  else
    call wbx#conversations#delivery(get(a:response, 'result', {}))
  endif
endfunction
function! wbx#conversations#send() abort
  if !s:owned(bufnr('%')) || !wbx#supports('conversations-v1') | return | endif
  if get(b:, 'wbx_recipient_stale', 0) | call s:notice('Recipient context is stale. Preserve text and prepare explicitly; nothing was retried.') | return | endif
  if !empty(s:pending) | call s:notice('A direct delivery is pending. Nothing was queued.') | return | endif
  if get(b:, 'wbx_recipient_status', '') =~# '^unknown' | call s:notice('Direct outcome unresolved. Check Webex, then :WebexDirectResolve; no send was queued.') | return | endif
  let reason = wbx#conversations#send_reason()
  if !empty(reason) | call s:notice(reason) | return | endif
  let rich = get(b:, 'wbx_format', 'plain') ==# 'markdown'
  let staged = wbx#drafts#upload(bufnr('%'))
  if get(staged, 'stale', 0) | call s:notice('Staged recipient file is stale; explicitly reselect.') | return | endif
  let text = join(getline(1, '$'), "\n")
  if empty(substitute(text, '\_s', '', 'g')) && (rich || empty(staged)) | return | endif
  if rich && text =~# '<@\|<spark-mention' | call s:notice('Real mentions are group-only; no direct message/file was sent.') | return | endif
  if !wbx#drafts#length(bufnr('%')).valid | call s:notice('Plaintext limit: 1000 UTF-16 units / 4000 bytes. Text retained.') | return | endif
  let target = deepcopy(b:wbx_recipient)
  let draft = b:wbx_recipient_draft
  let origin = wbx#view#intent()
  if !has_key(target, 'roomId') && !s:confirm('First Send to ' . target.label . ' [' . target.personId . '] may CREATE a persistent DM. Send this exact '
        \ . (rich ? 'Markdown' : 'plaintext') . (empty(staged) ? '' : ' + file "' . staged.name . '"') . ' once?') | return | endif
  if !wbx#view#intent_valid(origin) || !empty(s:pending) || b:wbx_recipient !=# target || b:wbx_recipient_draft !=# draft
        \ || wbx#drafts#upload(bufnr('%')) !=# staged || join(getline(1, '$'), "\n") !=# text | return | endif
  let s:serial += 1
  let request = 'direct-' . getpid() . '-' . s:serial
  let params = {'targetId': target.targetId, 'draftId': b:wbx_recipient_draft, 'requestId': request, 'text': text, 'confirmed': v:true}
  if rich | let params.format = 'markdown' | endif
  if !empty(staged) | let params.attachmentId = staged.attachmentId | endif
  let s:pending[request] = extend({'buffer': bufnr('%'), 'bufnr': bufnr('%'), 'tick': b:changedtick}, deepcopy(params))
  if wbx#rpc('direct.send', params, function('s:response', [request])) < 0 | call remove(s:pending, request) | endif
endfunction
function! wbx#conversations#delivery(value) abort
  if !wbx#protocol#conversation(a:value) || a:value.action !=# 'direct' | call wbx#_protocol_error() | return | endif
  if !has_key(s:pending, a:value.requestId) | return | endif
  let pending = s:pending[a:value.requestId]
  if pending.targetId !=# a:value.targetId || pending.draftId !=# a:value.draftId | call wbx#_protocol_error() | return | endif
  if get(pending, 'format', '') !=# get(a:value, 'format', '') || get(pending, 'attachmentId', '') !=# get(a:value, 'attachmentId', '')
        \ || (has_key(pending, 'format') || has_key(pending, 'attachmentId')) && pending.text !=# get(a:value, 'text', v:null)
    call wbx#_protocol_error() | return
  endif
  call remove(s:pending, a:value.requestId)
  if a:value.status ==# 'changed' | call wbx#notifications#sent(a:value.roomId, a:value.messageId) | endif
  if s:owned(pending.buffer) && getbufvar(pending.buffer, 'wbx_recipient_draft', '') ==# pending.draftId
        \ && get(getbufvar(pending.buffer, 'wbx_recipient', {}), 'targetId', '') ==# pending.targetId
    call setbufvar(pending.buffer, 'wbx_recipient_revision', getbufvar(pending.buffer, 'wbx_recipient_revision', 0) + 1)
    if a:value.status ==# 'changed'
      let target = getbufvar(pending.buffer, 'wbx_recipient')
      let target.roomId = a:value.roomId | call setbufvar(pending.buffer, 'wbx_recipient', target)
       if !getbufvar(pending.buffer, 'wbx_recipient_stale', 0) && getbufvar(pending.buffer, 'changedtick') == pending.tick
             \ && join(getbufline(pending.buffer, 1, '$'), "\n") ==# pending.text
             \ && getbufvar(pending.buffer, 'wbx_format', 'plain') ==# get(pending, 'format', 'plain') && wbx#uploads#same(pending)
        call setbufline(pending.buffer, 1, '')
        if len(getbufline(pending.buffer, 1, '$')) > 1 | call deletebufline(pending.buffer, 2, '$') | endif
      endif
    endif
    call wbx#uploads#delivered(pending, {'status': a:value.status ==# 'changed' ? 'sent' : a:value.status})
    call setbufvar(pending.buffer, 'wbx_recipient_status', a:value.status)
  endif
  call s:notice(a:value.notice)
  redrawstatus
endfunction
function! wbx#conversations#open() abort
  if s:owned(bufnr('%')) | return wbx#conversations#open_direct() | endif
  if !wbx#supports('conversations-v1') || empty(s:created) | call s:notice('No retained confirmed group creation in this session; no title was guessed.') | return | endif
  let room = s:created.roomId
  if empty(filter(copy(get(wbx#state(), 'rooms', [])), 'v:val.id ==# room && !get(v:val, "cached", 0)'))
    call s:notice('Confirmed created room is no longer listed/accessible. Nothing was reopened or recreated.') | return
  endif
  call wbx#select(room, 1)
endfunction
function! wbx#conversations#open_direct() abort
  if !s:owned(bufnr('%')) || !wbx#supports('conversations-v1') | return | endif
  let room = get(b:wbx_recipient, 'roomId', '')
  if empty(room) | call s:notice('No confirmed returned room ID. Check/resolve unknown delivery first.') | return | endif
  call wbx#select(room)
endfunction
function! wbx#conversations#resolve_direct() abort
  if !s:owned(bufnr('%')) || !wbx#supports('conversations-v1') | return | endif
  let origin = wbx#view#intent()
  let target = deepcopy(b:wbx_recipient)
  let revision = get(b:, 'wbx_recipient_revision', 0)
  if s:confirm('Have you checked the exact recipient ' . b:wbx_recipient.personId . ' in Webex? Resolve without replay?')
    if !wbx#view#intent_valid(origin) || b:wbx_recipient !=# target | return | endif
    call wbx#rpc('direct.resolve', {'targetId': target.targetId}, function('s:direct_resolved', [bufnr('%'), target, revision]))
  endif
endfunction
function! s:direct_resolved(buffer, target, revision, response) abort
  if has_key(a:response, 'error') || !s:owned(a:buffer) || getbufvar(a:buffer, 'wbx_recipient', {}) !=# a:target
        \ || getbufvar(a:buffer, 'wbx_recipient_revision', 0) != a:revision | return | endif
  call setbufvar(a:buffer, 'wbx_recipient_revision', a:revision + 1)
  call setbufvar(a:buffer, 'wbx_recipient_status', 'resolved explicitly; any resend may duplicate')
endfunction
function! wbx#conversations#cancel_direct() abort
  if !s:owned(bufnr('%')) | return | endif
  if !empty(s:pending) | call s:notice('Delivery is admitted; cancel cannot prove it unsent. Check the outcome.') | return | endif
  if get(b:, 'wbx_recipient_status', '') =~# '^unknown' | call s:notice('Unknown delivery must be checked/resolved before discarding its context; cancel cannot prove it unsent.') | return | endif
  if wbx#supports('conversations-v1') | call wbx#rpc('direct.discard', {'targetId': b:wbx_recipient.targetId}) | endif
  let file = wbx#drafts#upload(bufnr('%'))
  if !empty(file) | let file.stale = 1 | call wbx#drafts#upload(bufnr('%'), file) | endif
  let b:wbx_recipient_stale = 1 | let b:wbx_recipient_status = 'canceled; native text retained'
endfunction
function! wbx#conversations#status() abort
  let target = get(b:, 'wbx_recipient', {})
  return substitute('Webex recipient → ' . get(target, 'label', '') . ' [' . get(target, 'personId', '') . '] · '
        \ . wbx#drafts#summary(bufnr('%')) . ' · ' . wbx#uploads#label(bufnr('%')) . ' · ' . get(b:, 'wbx_recipient_status', '') . (get(b:, 'wbx_recipient_stale', 0) ? ' · STALE' : ''), '%', '%%', 'g')
endfunction
function! wbx#conversations#invalidate() abort
  let s:epoch += 1
  for buffer in values(s:buffers)
    if s:owned(buffer)
      call setbufvar(buffer, 'wbx_recipient_stale', 1)
      call setbufvar(buffer, 'wbx_recipient_revision', getbufvar(buffer, 'wbx_recipient_revision', 0) + 1)
    endif
  endfor
  for pending in values(s:pending)
    if s:owned(pending.buffer) | call setbufvar(pending.buffer, 'wbx_recipient_status', 'unknown; disconnected, check Webex') | endif
  endfor
  if !empty(s:action) | call s:action_unknown(s:action) | endif
  for [buffer, entry] in items(s:descriptions)
    if wbx#conversations#is_description(str2nr(buffer)) | call setbufvar(str2nr(buffer), 'wbx_space_description_stale', 1) | endif
    if wbx#conversations#is_team_description(str2nr(buffer)) | call setbufvar(str2nr(buffer), 'wbx_team_description_stale', 1) | endif
    let entry.retired = 1
  endfor
  let s:description_read = {}
  let s:team_read = {}
  let s:pending = {} | let s:action = {} | let s:created = {}
endfunction
function! s:description_settle(intent, status) abort
  if a:intent.action ==# 'team-describe'
    if !wbx#conversations#is_team_description(get(a:intent, 'buffer', 0)) | return | endif
    let entry = s:descriptions[string(a:intent.buffer)]
    if entry.epoch != get(a:intent, 'nativeEpoch', -1) || getbufvar(a:intent.buffer, 'wbx_team_description', {}) !=# entry.snapshot | return | endif
    call setbufvar(a:intent.buffer, 'wbx_team_description_status', a:status)
    if a:status !=# 'failed' | let entry.retired = 1 | endif
    return
  endif
  if index(['describe', 'description-clear'], a:intent.action) < 0 || !wbx#conversations#is_description(get(a:intent, 'buffer', 0)) | return | endif
  let entry = s:descriptions[string(a:intent.buffer)]
  if entry.epoch != get(a:intent, 'nativeEpoch', -1) || getbufvar(a:intent.buffer, 'wbx_space_description', {}) !=# entry.snapshot | return | endif
  call setbufvar(a:intent.buffer, 'wbx_space_description_status', a:status)
  if a:status !=# 'failed' | let entry.retired = 1 | endif
endfunction
function! s:action_unknown(intent) abort
  let s:unknown[s:key(a:intent)] = copy(a:intent)
  call s:description_settle(a:intent, 'unknown')
endfunction
function! s:action_result(intent, response) abort
  if get(s:action, 'requestId', '') !=# a:intent.requestId | return | endif
  let s:action = {}
  if index(['team-rename', 'team-describe'], a:intent.action) >= 0
        \ && (get(a:intent, 'nativeEpoch', -1) != s:epoch || get(a:intent, 'session', '') !=# get(get(wbx#state(), 'localContext', {}), 'sessionId', ''))
    call s:action_unknown(a:intent) | return
  endif
  if has_key(a:response, 'error') | call s:action_unknown(a:intent) | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#conversation(value) || value.action !=# a:intent.action || value.requestId !=# a:intent.requestId
        \ || index(['create', 'team-rename', 'team-describe'], a:intent.action) < 0 && get(value, 'roomId', '') !=# a:intent.roomId
        \ || a:intent.action ==# 'team-describe' && (get(value, 'teamId', '') !=# a:intent.teamId
        \     || value.expectedName !=# a:intent.expectedName || value.expectedDescription !=# a:intent.expectedDescription || value.description !=# a:intent.description)
        \ || a:intent.action ==# 'team-rename' && (get(value, 'teamId', '') !=# a:intent.teamId
        \     || get(value, 'expectedName', '') !=# a:intent.expectedName || get(value, 'name', '') !=# a:intent.name)
        \ || a:intent.action ==# 'rename' && (value.expectedTitle !=# a:intent.expectedTitle || value.title !=# a:intent.title)
        \ || a:intent.action ==# 'describe' && (value.expectedTitle !=# a:intent.expectedTitle
        \     || value.expectedDescription !=# a:intent.expectedDescription || value.description !=# a:intent.description)
        \ || a:intent.action ==# 'description-clear' && (value.expectedTitle !=# a:intent.expectedTitle
        \     || value.expectedDescription !=# a:intent.expectedDescription)
        \ || a:intent.action ==# 'lock' && (value.expectedTitle !=# a:intent.expectedTitle
        \     || value.expectedLocked != a:intent.expectedLocked || value.locked != a:intent.locked)
        \ || a:intent.action ==# 'announcement' && (value.expectedTitle !=# a:intent.expectedTitle
        \     || value.expectedAnnouncementOnly != a:intent.expectedAnnouncementOnly || value.announcementOnly != a:intent.announcementOnly)
    call s:action_unknown(a:intent)
    call wbx#_protocol_error() | return
  endif
  if value.status ==# 'unknown' | call s:action_unknown(a:intent) | endif
  call s:description_settle(a:intent, value.status)
  if value.action ==# 'create' && value.status ==# 'changed' | let s:created = {'roomId': value.roomId, 'requestId': value.requestId} | endif
  if value.action ==# 'team-rename' && value.status ==# 'changed'
    call wbx#joined_teams#invalidate(a:intent.session, a:intent.revision)
  endif
  call s:notice(value.notice . (value.action ==# 'create' && value.status ==# 'changed' ? ' Created room: ' . value.roomId . '. Invitations remain separate.' : ''))
endfunction
function! s:space_unresolved(room) abort
  return has_key(s:unknown, 'rename:' . a:room) || has_key(s:unknown, 'describe:' . a:room)
        \ || has_key(s:unknown, 'lock:' . a:room) || has_key(s:unknown, 'announcement:' . a:room)
        \ || has_key(s:unknown, 'description-clear:' . a:room)
endfunction
function! s:rename_source(room) abort
  let kind = get(b:, 'wbx_kind', '')
  return index(['rooms', 'history', 'compose'], kind) >= 0 && wbx#view#owned(bufnr('%'), kind)
        \ && (kind ==# 'rooms' || (kind ==# 'history' ? get(b:, 'wbx_history_room', '') : get(b:, 'wbx_room', '')) ==# a:room)
endfunction
function! wbx#conversations#rename_reason() abort
  if !wbx#supports_space('rename-v1') | return 'Rename needs explicit rename-v1 support and a current messaging session' | endif
  let state = wbx#state() | let room = get(state, 'room', v:null)
  if type(room) != v:t_dict || !get(state, 'ready', 0) || get(room, 'type', '') !=# 'group'
        \ || has_key(room, 'teamId') || get(room, 'cached', 0) || get(room, 'isReadOnly', 0)
        \ || !wbx#protocol#space_title(get(room, 'title', v:null))
    return 'Choose a ready standalone group space; direct/Team/cached/read-only spaces are excluded'
  endif
  if !s:rename_source(room.id) | return 'Choose an owned selected-space history, space list or composer; promoted work cannot authorize rename' | endif
  if wbx#conversations#pending() | return 'Conversation action active; nothing will be queued' | endif
  if s:space_unresolved(room.id) | return 'Space metadata outcome unknown; inspect Webex then :WebexConversationResolve without replay' | endif
  return ''
endfunction
function! s:rename_context() abort
  " Snapshot native metadata without allocating/rebinding draft or file authority.
  let room = get(wbx#state(), 'room', v:null)
  return {'room': deepcopy(room), 'owned': type(room) == v:t_dict && s:rename_source(room.id),
        \ 'draft': get(b:, 'wbx_draft_id', ''), 'destination': get(b:, 'wbx_room', ''),
        \ 'history': get(b:, 'wbx_history_room', ''), 'kind': get(b:, 'wbx_kind', ''),
        \ 'file': deepcopy(get(b:, 'wbx_staged_upload', {})), 'target': deepcopy(get(b:, 'wbx_upload_target', {}))}
endfunction
function! wbx#conversations#lock_reason() abort
  if !exists('*wbx#supports_lock') || !wbx#supports_lock('lock-unlock-v1') | return 'Moderation changes need explicit lock-unlock-v1 support and a current session' | endif
  let state = wbx#state() | let room = get(state, 'room', v:null)
  if type(room) != v:t_dict || !get(state, 'ready', 0) || get(room, 'type', '') !=# 'group'
        \ || has_key(room, 'teamId') || get(room, 'cached', 0) || get(room, 'isReadOnly', 0)
        \ || !wbx#protocol#space_title(get(room, 'title', v:null))
    return 'Choose a ready standalone group; fresh private/nonannouncement/creator/moderator proof is still required'
  endif
  if !s:rename_source(room.id) | return 'Choose an owned selected-space history, space list or composer; promoted/unrelated work cannot authorize moderation' | endif
  if wbx#conversations#pending() | return 'Conversation action/preparation active; nothing will be queued' | endif
  if s:space_unresolved(room.id) | return 'Space metadata outcome unknown; inspect Webex then :WebexConversationResolve without replay' | endif
  if len(s:unknown) >= 256 | return 'Unresolved action budget reached; nothing will be evicted' | endif
  return ''
endfunction
function! wbx#conversations#lock(locked) abort
  if type(a:locked) != v:t_bool | return | endif
  let reason = wbx#conversations#lock_reason()
  if !empty(reason) | call s:notice(reason) | return | endif
  let context = s:rename_context() | let origin = wbx#view#intent()
  let effect = a:locked ? 'LOCK / moderate false -> true: only the freshly verified creator may lock, becoming a moderator and restricting shared membership/settings management.'
        \ : 'UNLOCK / unmoderate true -> false: fresh moderator proof required; this broadens shared management. Subsequent moderator memberships/roles are not inferred.'
  if !s:confirm(effect . ' Space [' . context.room.id . '], required unchanged title echo "' . context.room.title
        \ . '". This is a requested precondition, not a cached permission or toggle. Fresh private/nonannouncement proof still applies.'
        \ . ' GET to PUT is not atomic: title echo may overwrite a concurrent rename, and moderation/role changes may race. Continue once?') | return | endif
  if !wbx#view#intent_valid(origin) || context !=# s:rename_context() || !empty(wbx#conversations#lock_reason()) | return | endif
  let s:serial += 1
  let params = {'requestId': 'lock-' . getpid() . '-' . s:serial, 'roomId': context.room.id,
        \ 'expectedTitle': context.room.title, 'expectedLocked': a:locked ? v:false : v:true, 'locked': a:locked, 'confirmed': v:true}
  let s:action = extend(copy(params), {'action': 'lock'})
  if wbx#rpc('rooms.lock', params, function('s:action_result', [copy(s:action)])) < 0 | let s:action = {} | endif
endfunction
function! wbx#conversations#announcement_reason() abort
  if !exists('*wbx#supports_announcement') || !wbx#supports_announcement('enable-disable-v1')
    return 'Announcement-mode changes need explicit enable-disable-v1 support and a current session'
  endif
  let state = wbx#state() | let room = get(state, 'room', v:null)
  if type(room) != v:t_dict || !get(state, 'ready', 0) || get(room, 'type', '') !=# 'group'
        \ || has_key(room, 'teamId') || get(room, 'cached', 0) || get(room, 'isReadOnly', 0)
        \ || !wbx#protocol#space_title(get(room, 'title', v:null))
    return 'Choose a ready standalone group; fresh already-locked/private/moderator proof is still required'
  endif
  if !s:rename_source(room.id) | return 'Choose an owned selected-space history, space list or composer; unrelated/promoted work cannot authorize mode changes' | endif
  if wbx#conversations#pending() | return 'Conversation action/preparation active; nothing will be queued' | endif
  if s:space_unresolved(room.id) | return 'Space metadata outcome unknown; inspect Webex then :WebexConversationResolve without replay' | endif
  if len(s:unknown) >= 256 | return 'Unresolved action budget reached; nothing will be evicted' | endif
  return ''
endfunction
function! wbx#conversations#announcement(enabled) abort
  if type(a:enabled) != v:t_bool | return | endif
  let reason = wbx#conversations#announcement_reason()
  if !empty(reason) | call s:notice(reason) | return | endif
  let context = s:rename_context() | let origin = wbx#view#intent()
  let effect = a:enabled
        \ ? 'Enable announcement mode false -> true: moderators, bots and integrations may post; other participants can still read/view files/join meetings. Webex notifies other people in the space when enabled.'
        \ : 'Disable announcement mode true -> false: broader participant posting resumes subject to remaining Webex policy. This does not unlock or change moderator roles.'
  if !s:confirm(effect . ' Space [' . context.room.id . '], required unchanged title echo "' . context.room.title
        \ . '". Both directions require fresh moderator proof in an already locked/private space. No implicit lock, role or public-state write.'
        \ . ' GET to PUT is not atomic: title echo may overwrite a concurrent rename, and lock/mode/role changes may race. Continue once?') | return | endif
  if !wbx#view#intent_valid(origin) || context !=# s:rename_context() || !empty(wbx#conversations#announcement_reason()) | return | endif
  let s:serial += 1
  let params = {'requestId': 'announcement-' . getpid() . '-' . s:serial, 'roomId': context.room.id,
        \ 'expectedTitle': context.room.title, 'expectedAnnouncementOnly': a:enabled ? v:false : v:true,
        \ 'announcementOnly': a:enabled, 'confirmed': v:true}
  let s:action = extend(copy(params), {'action': 'announcement'})
  if wbx#rpc('rooms.announcement', params, function('s:action_result', [copy(s:action)])) < 0 | let s:action = {} | endif
endfunction
function! wbx#conversations#is_description(buffer) abort
  let entry = get(s:descriptions, string(a:buffer), {})
  return !empty(entry) && get(entry, 'scope', 'room') ==# 'room' && s:description_owned(a:buffer, entry)
endfunction
function! s:description_owned(buffer, entry) abort
  return bufexists(a:buffer) && getbufvar(a:buffer, '&buftype') ==# 'nofile' && bufname(a:buffer) ==# a:entry.name
endfunction
function! wbx#conversations#is_team_description(buffer) abort
  let entry = get(s:descriptions, string(a:buffer), {})
  return !empty(entry) && get(entry, 'scope', 'room') ==# 'team' && s:description_owned(a:buffer, entry)
endfunction
function! s:description_now() abort
  return localtime() * 1000
endfunction
function! s:description_current(buffer) abort
  if !wbx#conversations#is_description(a:buffer) | return 0 | endif
  let entry = s:descriptions[string(a:buffer)] | let snapshot = entry.snapshot
  let state = wbx#state() | let room = get(state, 'room', v:null)
  let age = s:description_now() - snapshot.observedAt
  return !entry.retired && entry.epoch == s:epoch && !getbufvar(a:buffer, 'wbx_space_description_stale', 0)
        \ && getbufvar(a:buffer, 'wbx_space_description', {}) ==# snapshot
        \ && get(get(state, 'localContext', {}), 'sessionId', '') ==# snapshot.sessionId
        \ && entry.selection == (exists('*wbx#context_epoch') ? wbx#context_epoch() : 0)
        \ && get(state, 'state', '') ==# 'ready' && get(state, 'ready', 0) && type(room) == v:t_dict
        \ && room.id ==# snapshot.roomId && room.title ==# snapshot.expectedTitle && age >= -999 && age < 120000
endfunction
function! wbx#conversations#description_reason(submit) abort
  if !exists('*wbx#supports_description') || !wbx#supports_description('replace-v1')
    return 'Description edits need explicit replace-v1 support and a current messaging session'
  endif
  let state = wbx#state() | let room = get(state, 'room', v:null)
  if type(room) != v:t_dict || !get(state, 'ready', 0) || get(room, 'type', '') !=# 'group'
        \ || has_key(room, 'teamId') || get(room, 'cached', 0) || get(room, 'isReadOnly', 0)
        \ || !wbx#protocol#space_title(get(room, 'title', v:null))
    return 'Choose a ready standalone group; direct/Team/cached/read-only spaces are excluded'
  endif
  if wbx#conversations#pending() | return 'Conversation action/preparation active; nothing will be queued' | endif
  if s:space_unresolved(room.id) | return 'Space metadata outcome unknown; inspect Webex then :WebexConversationResolve without replay' | endif
  if len(s:unknown) >= 256 | return 'Unresolved action budget reached; nothing will be evicted' | endif
  if a:submit
    if !s:description_current(bufnr('%')) | return 'Description preparation completed, changed, expired or stale; prepare afresh from selected-space history/list/composer' | endif
    if get(b:, 'wbx_format', 'plain') !=# 'plain' || !empty(get(b:, 'wbx_parent', '')) || !empty(get(b:, 'wbx_staged_upload', {}))
      return 'Description text is plain metadata, not a Markdown/reply/file draft'
    endif
  else
    if !s:rename_source(room.id) | return 'Choose an owned selected-space history, space list or composer; native text is retained' | endif
    let active = 0
    for buffer in keys(s:descriptions) | let active += s:any_description_current(str2nr(buffer)) | endfor
    if active >= 8 | return 'Eight description preparations are active; cancel one explicitly' | endif
  endif
  return ''
endfunction
function! s:description_received(origin, response) abort
  if get(s:description_read, 'serial', -1) != a:origin.serial | return | endif
  let s:description_read = {}
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#space_description(value) || value.roomId !=# a:origin.context.room.id
        \ || value.expectedTitle !=# a:origin.context.room.title || value.sessionId !=# a:origin.session
    call wbx#_protocol_error() | return
  endif
  let age = s:description_now() - value.observedAt
  if a:origin.epoch != s:epoch || !wbx#view#intent_valid(a:origin.intent) || a:origin.context !=# s:rename_context()
        \ || !empty(wbx#conversations#description_reason(0)) || age < -999 || age >= 120000 | return | endif
  let name = 'wbx://space-description/' . value.sessionId . '-' . a:origin.serial
  execute 'new ' . name
  " User autocommands may choose a different buffer/work; never overwrite it.
  let room = get(wbx#state(), 'room', v:null)
  if bufname('%') !=# name || getline(1, '$') !=# [''] || &modified || a:origin.epoch != s:epoch
        \ || !wbx#supports_description('replace-v1') || type(room) != v:t_dict || room.id !=# value.roomId
        \ || room.title !=# value.expectedTitle || get(get(wbx#state(), 'localContext', {}), 'sessionId', '') !=# value.sessionId | return | endif
  setlocal buftype=nofile bufhidden=hide noswapfile noundofile nomodeline modifiable
  let b:wbx_space_description = deepcopy(value)
  let b:wbx_space_description_status = 'prepared'
  let b:wbx_space_description_stale = 0
  let s:descriptions[string(bufnr('%'))] = {'name': name, 'snapshot': deepcopy(value), 'epoch': s:epoch,
        \ 'selection': exists('*wbx#context_epoch') ? wbx#context_epoch() : 0, 'retired': 0}
  call setline(1, split(value.expectedDescription, "\n", 1))
  setlocal nomodified filetype=wbx-space-description
  setlocal statusline=%!wbx#conversations#description_status()
  call s:notice('Space description prepared · not submitted.')
endfunction
function! wbx#conversations#description() abort
  let reason = wbx#conversations#description_reason(0)
  if !empty(reason) | call s:notice(reason) | return | endif
  for buffer in keys(copy(s:descriptions))
    if !s:any_description_current(str2nr(buffer)) | call remove(s:descriptions, buffer) | endif
  endfor
  let s:serial += 1
  let origin = {'serial': s:serial, 'epoch': s:epoch, 'intent': wbx#view#intent(), 'context': s:rename_context(),
        \ 'session': wbx#state().localContext.sessionId}
  let s:description_read = origin
  if wbx#rpc('rooms.descriptionPrepare', {'roomId': origin.context.room.id}, function('s:description_received', [origin])) < 0
    let s:description_read = {}
  endif
endfunction
function! wbx#conversations#description_submit() abort
  let reason = wbx#conversations#description_reason(1)
  if !empty(reason) | call s:notice(reason) | return | endif
  let snapshot = deepcopy(b:wbx_space_description)
  let lines = getline(1, '$') | let text = join(lines, "\n")
  if !empty(filter(copy(lines), 'v:val =~# "\n"')) || !wbx#protocol#description_text(text, 1) || text ==# snapshot.expectedDescription
    call s:notice('Choose a changed nonblank description: LF-only, 1000 UTF-16 units / 4000 UTF-8 bytes. No clearing, controls or truncation.') | return
  endif
  let origin = wbx#view#intent()
  if !s:confirm('Replace description in standalone group [' . snapshot.roomId . ']? Required unchanged title echo: "' . snapshot.expectedTitle
        \ . '". Old description: "' . snapshot.expectedDescription . '". New description: "' . text
        \ . '". GET to PUT is not atomic: concurrent description edits may be lost AND the title echo may overwrite a concurrent rename. Continue once?') | return | endif
  if !wbx#view#intent_valid(origin) || !empty(wbx#conversations#description_reason(1))
        \ || b:wbx_space_description !=# snapshot || join(getline(1, '$'), "\n") !=# text | return | endif
  let s:serial += 1
  let params = {'requestId': 'description-' . getpid() . '-' . s:serial, 'roomId': snapshot.roomId,
        \ 'expectedTitle': snapshot.expectedTitle, 'expectedDescription': snapshot.expectedDescription, 'description': text, 'confirmed': v:true}
  let s:action = extend(copy(params), {'action': 'describe', 'buffer': bufnr('%'), 'nativeEpoch': s:epoch})
  if wbx#rpc('rooms.describe', params, function('s:action_result', [copy(s:action)])) < 0 | let s:action = {} | endif
endfunction
function! wbx#conversations#description_clear_reason() abort
  if !exists('*wbx#supports_description_clear') || !wbx#supports_description_clear('single-space-v1')
    return 'Clearing requires independent single-space-v1 support and existing description preparation'
  endif
  let reason = wbx#conversations#description_reason(1)
  if !empty(reason) | return reason | endif
  let snapshot = s:descriptions[string(bufnr('%'))].snapshot
  if !wbx#protocol#description_text(snapshot.expectedDescription, 1)
    return 'Clear requires an explicitly nonblank old description, not empty/whitespace/sentinel inference'
  endif
  if !empty(filter(getline(1, '$'), 'v:val =~# "\n"')) || join(getline(1, '$'), "\n") !=# snapshot.expectedDescription
    return 'Native description text changed; clearing cannot discard newer edits. Undo or prepare afresh'
  endif
  return ''
endfunction
function! wbx#conversations#description_clear() abort
  let reason = wbx#conversations#description_clear_reason()
  if !empty(reason) | call s:notice(reason) | return | endif
  let snapshot = deepcopy(s:descriptions[string(bufnr('%'))].snapshot)
  let origin = wbx#view#intent() | let context = s:rename_context()
  if !s:confirm('CLEAR / remove the description in standalone group [' . snapshot.roomId . ']? Old description: "'
        \ . snapshot.expectedDescription . '". Required unchanged title echo: "' . snapshot.expectedTitle
        \ . '". This is destructive removal, not blank Submit. Fresh private/nonannouncement/member/moderator checks still apply.'
        \ . ' GET to PUT is not atomic: concurrent description edits may be lost AND title echo may overwrite a concurrent rename; roles/flags may race.'
        \ . ' Only an explicit empty ACK confirms; missing/null/echoed-space responses stay UNKNOWN. Native text/full undo remain. Continue once?') | return | endif
  if !wbx#view#intent_valid(origin) || context !=# s:rename_context() || !empty(wbx#conversations#description_clear_reason())
        \ || b:wbx_space_description !=# snapshot | return | endif
  let s:serial += 1
  let params = {'requestId': 'description-clear-' . getpid() . '-' . s:serial, 'roomId': snapshot.roomId,
        \ 'expectedTitle': snapshot.expectedTitle, 'expectedDescription': snapshot.expectedDescription, 'confirmed': v:true}
  let s:action = extend(copy(params), {'action': 'description-clear', 'buffer': bufnr('%'), 'nativeEpoch': s:epoch})
  if wbx#rpc('rooms.descriptionClear', params, function('s:action_result', [copy(s:action)])) < 0 | let s:action = {} | endif
endfunction
function! wbx#conversations#description_cancel() abort
  if !wbx#conversations#is_description(bufnr('%')) | return | endif
  if index(['describe', 'description-clear'], get(s:action, 'action', '')) >= 0 && get(s:action, 'buffer', 0) == bufnr('%')
    call s:notice('Metadata write admitted; cancellation cannot prove it unsent. Inspect its result.') | return
  endif
  if get(b:, 'wbx_space_description_status', '') !=# 'unknown' | let b:wbx_space_description_status = 'canceled' | endif
  let b:wbx_space_description_stale = 1
  call remove(s:descriptions, string(bufnr('%')))
  call s:notice('Description preparation retired; native text/full undo retained. Prepare afresh from selected-space history/list/composer.')
endfunction
function! wbx#conversations#description_status() abort
  let value = get(b:, 'wbx_space_description', {})
  return substitute('Space description [' . get(value, 'roomId', '') . '] · ' . get(b:, 'wbx_space_description_status', 'retired'), '%', '%%', 'g')
endfunction
function! wbx#conversations#action(action, value) abort
  let capability = a:action ==# 'create' ? 'conversations-v1' : 'memberships-write-v1'
  if a:action ==# 'rename'
    let reason = wbx#conversations#rename_reason()
    if !empty(reason) | call s:notice(reason) | return | endif
    let rename = s:rename_context()
  endif
  if (a:action !=# 'rename' && !wbx#supports(capability)) || wbx#conversations#pending() || len(s:unknown) >= 256 | call s:notice('Conversation action unavailable/busy or unresolved budget reached; no request queued.') | return | endif
  let origin = wbx#view#intent()
  let params = {'confirmed': v:true}
  if a:action ==# 'create'
    let params.title = empty(a:value) ? input('New GROUP space title (no invitations): ') : a:value
    if empty(params.title) || !s:confirm('Create one named GROUP space "' . params.title . '"? Invitations are separate. Unknown outcomes must be checked before retrying.') | return | endif
  elseif a:action ==# 'rename'
    let params.roomId = rename.room.id | let params.expectedTitle = rename.room.title
    let params.title = empty(a:value) ? input('New standalone GROUP title: ', rename.room.title) : a:value
    if !wbx#protocol#space_title(params.title) || params.title ==# params.expectedTitle
      call s:notice('Choose a different exact canonical title: 1–80 characters / 320 UTF-8 bytes. Nothing was renamed.') | return
    endif
    if !wbx#view#intent_valid(origin) || rename !=# s:rename_context() | return | endif
    if !s:confirm('RENAME standalone group [' . params.roomId . '] from "' . params.expectedTitle . '" to "' . params.title
          \ . '"? Fresh identity/membership/moderator checks still apply. GET to PUT is not atomic: a concurrent title/role change race remains. Continue once?') | return | endif
    if !empty(wbx#conversations#rename_reason()) || rename !=# s:rename_context() | return | endif
  else
    let room = get(wbx#state(), 'room', v:null)
    if type(room) != v:t_dict | return | endif
    let params.roomId = room.id | let params.action = a:action
    if a:action ==# 'invite'
      let params.target = empty(a:value) ? input('Invite exact person ID/email to ' . room.title . ': ') : a:value
      if empty(params.target) | return | endif
    elseif a:action ==# 'remove'
      let roster = get(b:, 'wbx_members_snapshot', {})
      if empty(roster) || roster.roomId !=# room.id || !wbx#lists#clean(bufnr('%'), 'members') | call s:notice('Load an unchanged :WebexMembers view and choose an exact membership there first.') | return | endif
      let target = wbx#members#selected()
      if empty(target)
        call s:pick(['Remove member (fresh moderator proof still required):'] + map(copy(roster.items), 'printf("%d. %s [%s]", v:key + 1, v:val.label, v:val.personId)'),
              \ function('s:remove_picked', [origin, deepcopy(room), deepcopy(roster)]))
        return
      endif
      let params.target = target.id
    endif
    let text = a:action ==# 'leave' ? 'LEAVE this space by removing YOUR OWN membership; this does NOT delete the room for everyone.'
          \ : a:action . ' exact target ' . params.target . ' in this space.'
    if !s:confirm(text . ' Space: ' . room.title . ' [' . room.id . ']. Fresh role/identity checks and server denial control admission. Continue?') | return | endif
  endif
  call s:submit_action(a:action, params, origin)
endfunction
function! s:remove_picked(origin, room, roster, choice) abort
  if a:choice < 1 || a:choice > len(a:roster.items) || !wbx#view#picker_valid(a:origin)
        \ || get(b:, 'wbx_members_snapshot', {}) !=# a:roster || !wbx#lists#clean(bufnr('%'), 'members')
        \ || get(wbx#state(), 'room', v:null) !=# a:room || !wbx#supports('memberships-write-v1')
        \ || wbx#conversations#pending() || len(s:unknown) >= 256 | return | endif
  let target = a:roster.items[a:choice - 1]
  let origin = wbx#view#intent()
  if !s:confirm('remove exact target ' . target.id . ' in this space. Space: ' . a:room.title . ' [' . a:room.id
        \ . ']. Fresh role/identity checks and server denial control admission. Continue?')
        \ || get(b:, 'wbx_members_snapshot', {}) !=# a:roster || !wbx#lists#clean(bufnr('%'), 'members') | return | endif
  call s:submit_action('remove', {'confirmed': v:true, 'action': 'remove', 'roomId': a:room.id, 'target': target.id}, origin)
endfunction
function! s:submit_action(action, params, origin) abort
  if !wbx#view#intent_valid(a:origin) || has_key(s:unknown, a:action . ':' . get(a:params, 'roomId', ''))
        \ || wbx#conversations#pending() || len(s:unknown) >= 256
        \ || a:action !=# 'rename' && !wbx#supports(a:action ==# 'create' ? 'conversations-v1' : 'memberships-write-v1') | return | endif
  let params = copy(a:params)
  let s:serial += 1 | let params.requestId = 'conversation-' . getpid() . '-' . s:serial
  if a:action ==# 'create' | let s:created = {} | endif
  let s:action = extend(copy(params), {'action': a:action})
  let method = a:action ==# 'create' ? 'rooms.create' : a:action ==# 'rename' ? 'rooms.rename' : 'members.action'
  if wbx#rpc(method, params, function('s:action_result', [copy(s:action)])) < 0 | let s:action = {} | endif
endfunction
function! s:team_context() abort
  return {'snapshot': deepcopy(get(b:, 'wbx_joined_teams_snapshot', {})), 'row': wbx#joined_teams#selected()}
endfunction
function! s:team_valid(origin) abort
  let now = get(a:origin, 'scope', '') ==# 'team' ? s:description_now() : localtime() * 1000
  return !get(a:origin, 'invalid', 0) && a:origin.epoch == s:epoch && wbx#view#intent_valid(a:origin.intent)
        \ && wbx#joined_teams#current() && a:origin.context ==# s:team_context()
        \ && (get(a:origin, 'scope', '') ==# 'team'
        \     ? exists('*wbx#supports_team_description') && wbx#supports_team_description('replace-v1')
        \     : exists('*wbx#supports_team') && wbx#supports_team('rename-v1'))
        \ && now - a:origin.started >= -999 && now - a:origin.started < 120000
endfunction
function! wbx#conversations#team_cursor() abort
  if !empty(s:team_read) && win_getid() == s:team_read.intent.window && bufnr('%') == s:team_read.intent.buffer
        \ && get(wbx#joined_teams#selected(), 'teamId', '') !=# s:team_read.context.row.teamId
    let s:team_read.invalid = 1
  endif
  if !empty(s:description_read) && get(s:description_read, 'scope', '') ==# 'team'
        \ && win_getid() == s:description_read.intent.window && bufnr('%') == s:description_read.intent.buffer
        \ && get(wbx#joined_teams#selected(), 'teamId', '') !=# s:description_read.context.row.teamId
    let s:description_read.invalid = 1
  endif
endfunction
augroup wbx_team_rename_intent
  autocmd!
  autocmd CursorMoved * call wbx#conversations#team_cursor()
augroup END
function! wbx#conversations#team_rename_reason() abort
  if !exists('*wbx#supports_team') || !wbx#supports_team('rename-v1')
    return 'Team rename needs independent rename-v1 Team support; no role/lifecycle writer is inferred'
  endif
  let row = wbx#joined_teams#selected()
  if empty(row) | return 'Choose an unchanged fresh joined-Team row; loaded Team-space labels/composers do not authorize rename' | endif
  if wbx#conversations#pending() | return 'Conversation action active; nothing queued' | endif
  if s:team_unresolved(row.teamId) | return 'Team metadata unknown; inspect exact Team/request in Webex then :WebexConversationResolve without replay' | endif
  if len(s:unknown) >= 256 | return 'Unresolved action budget reached; evidence retained' | endif
  return ''
endfunction
function! s:team_prepared(origin, name, response) abort
  if get(s:team_read, 'serial', 0) != a:origin.serial | return | endif
  try
    if !s:team_valid(a:origin) || has_key(a:response, 'error') | return | endif
    let v = get(a:response, 'result', {})
    if !wbx#protocol#team_rename_preparation(v) || v.teamId !=# a:origin.context.row.teamId
          \ || v.revision != a:origin.context.snapshot.revision || v.sessionId !=# a:origin.context.snapshot.sessionId
      call wbx#_protocol_error() | return
    endif
    let age = localtime() * 1000 - v.observedAt
    if age < -999 || age >= 120000 | call s:notice('Team preimage stale/future-dated; prepare explicitly again.') | return | endif
    let name = empty(a:name) ? input('New Team name (not a Room title): ', v.expectedName) : a:name
    if !s:team_valid(a:origin) || !wbx#protocol#space_title(name) || name ==# v.expectedName | return | endif
    if !s:confirm('RENAME Team [' . v.teamId . '] from "' . v.expectedName . '" to "' . name
          \ . '"? Fresh Team moderator proof is repeated (one complete page, max 100 members). GET to PUT is not atomic: concurrent name/role changes can race.'
          \ . ' Only name is sent; optional-description preservation/tenant behavior is not live-validated. No roles/preferences/Room titles are requested. Continue once?') | return | endif
    if get(s:team_read, 'serial', 0) != a:origin.serial || !s:team_valid(a:origin)
          \ || localtime() * 1000 - v.observedAt < -999 || localtime() * 1000 - v.observedAt >= 120000 | return | endif
    let s:team_read = {}
    if !empty(wbx#conversations#team_rename_reason()) | return | endif
    let s:serial += 1
    let params = {'requestId': 'team-rename-' . getpid() . '-' . s:serial, 'teamId': v.teamId, 'revision': v.revision,
          \ 'expectedName': v.expectedName, 'name': name, 'confirmed': v:true}
    let s:action = extend(copy(params), {'action': 'team-rename', 'session': v.sessionId, 'nativeEpoch': s:epoch})
    let request = wbx#rpc('teams.rename', params, function('s:action_result', [copy(s:action)]))
    if request < 0 | let s:action = {} | endif
  finally
    if get(s:team_read, 'serial', 0) == a:origin.serial | let s:team_read = {} | endif
  endtry
endfunction
function! wbx#conversations#team_rename(name) abort
  if !empty(s:team_read) && (!s:team_valid(s:team_read) || localtime() * 1000 - s:team_read.started >= 20000)
    let s:team_read = {}
  endif
  let reason = wbx#conversations#team_rename_reason()
  if !empty(reason) | call s:notice(reason) | return | endif
  let s:serial += 1
  let origin = {'serial': s:serial, 'epoch': s:epoch, 'started': localtime() * 1000,
        \ 'intent': wbx#view#intent(), 'context': s:team_context()}
  let s:team_read = origin
  let request = wbx#rpc('teams.renamePrepare', {'teamId': origin.context.row.teamId, 'revision': origin.context.snapshot.revision},
        \ function('s:team_prepared', [origin, a:name]))
  if request < 0 && get(s:team_read, 'serial', 0) == origin.serial | let s:team_read = {} | endif
endfunction
function! s:team_unresolved(team) abort
  return has_key(s:unknown, 'team-rename:' . a:team) || has_key(s:unknown, 'team-describe:' . a:team)
endfunction
function! s:team_description_current(buffer) abort
  if !wbx#conversations#is_team_description(a:buffer) | return 0 | endif
  let entry = s:descriptions[string(a:buffer)] | let v = entry.snapshot | let state = wbx#state()
  let joined = getbufvar(entry.joined, 'wbx_joined_teams_snapshot', {})
  let age = s:description_now() - v.observedAt | let joined_age = s:description_now() - entry.query.observedAt
  return !entry.retired && entry.epoch == s:epoch && !getbufvar(a:buffer, 'wbx_team_description_stale', 0)
        \ && getbufvar(a:buffer, 'wbx_team_description', {}) ==# v
        \ && get(state, 'state', '') ==# 'ready' && get(get(state, 'localContext', {}), 'sessionId', '') ==# v.sessionId
        \ && entry.selection == (exists('*wbx#context_epoch') ? wbx#context_epoch() : 0)
        \ && wbx#lists#clean(entry.joined, 'joined-teams') && !getbufvar(entry.joined, 'wbx_joined_teams_stale', 0)
        \ && joined ==# entry.query && joined.revision == v.revision && joined.sessionId ==# v.sessionId
        \ && age >= -999 && age < 120000 && joined_age >= -999 && joined_age < 120000
endfunction
function! s:any_description_current(buffer) abort
  return s:description_current(a:buffer) || s:team_description_current(a:buffer)
endfunction
function! wbx#conversations#team_description_reason(submit) abort
  let state = wbx#state()
  if get(state, 'state', '') !=# 'ready' || !exists('*wbx#supports_team_description') || !wbx#supports_team_description('replace-v1')
    return 'Team description replacement needs independent replace-v1 support and a current messaging session'
  endif
  if wbx#conversations#pending() | return 'Conversation action/preparation active; nothing queued' | endif
  if len(s:unknown) >= 256 | return 'Unresolved action budget reached; evidence retained' | endif
  if a:submit
    if !s:team_description_current(bufnr('%')) | return 'Team description preparation completed, changed, expired or stale; prepare afresh from an exact joined row' | endif
    let team = s:descriptions[string(bufnr('%'))].snapshot.teamId
    if get(b:, 'wbx_format', 'plain') !=# 'plain' || !empty(get(b:, 'wbx_parent', '')) || !empty(get(b:, 'wbx_staged_upload', {}))
          \ || !empty(get(b:, 'wbx_recipient', {})) || !empty(get(b:, 'wbx_room', '')) || !empty(get(b:, 'wbx_history_room', ''))
          \ || !empty(get(b:, 'wbx_draft_id', '')) || !empty(get(b:, 'wbx_upload_target', {})) || !empty(get(b:, 'wbx_kind', ''))
      return 'Team description text is private plain metadata, not a Room/recipient/reply/file/Markdown draft'
    endif
  else
    let row = wbx#joined_teams#selected()
    if empty(row) | return 'Choose an unchanged fresh exact joined-Team row; loaded labels and Room composers cannot authorize Team metadata' | endif
    let team = row.teamId | let active = 0
    for buffer in keys(s:descriptions) | let active += s:any_description_current(str2nr(buffer)) | endfor
    if active >= 8 | return 'Eight combined Room/Team description preparations are active; cancel one explicitly' | endif
  endif
  if s:team_unresolved(team) | return 'Team metadata outcome unknown; inspect original Team/request in Webex then resolve WITHOUT replay' | endif
  return ''
endfunction
function! s:team_description_received(origin, response) abort
  if get(s:description_read, 'serial', -1) != a:origin.serial | return | endif
  let s:description_read = {}
  if !s:team_valid(a:origin) || has_key(a:response, 'error') | return | endif
  let v = get(a:response, 'result', {})
  if !wbx#protocol#team_description(v) || v.teamId !=# a:origin.context.row.teamId
        \ || v.sessionId !=# a:origin.context.snapshot.sessionId || v.revision != a:origin.context.snapshot.revision
    call wbx#_protocol_error() | return
  endif
  let age = s:description_now() - v.observedAt
  if age < -999 || age >= 120000 || !empty(wbx#conversations#team_description_reason(0)) | return | endif
  let name = 'wbx://team-description/' . v.sessionId . '-' . a:origin.serial
  " Reuse the on-demand list window, not an accumulating split per canceled edit.
  " Every edit still has its own buffer/native undo; the joined buffer remains hidden.
  execute 'hide edit ' . name
  if bufname('%') !=# name || getline(1, '$') !=# [''] || &modified || a:origin.epoch != s:epoch
        \ || !wbx#supports_team_description('replace-v1') || get(get(wbx#state(), 'localContext', {}), 'sessionId', '') !=# v.sessionId
        \ || getbufvar(a:origin.intent.buffer, 'wbx_joined_teams_snapshot', {}) !=# a:origin.context.snapshot
        \ || !wbx#lists#clean(a:origin.intent.buffer, 'joined-teams') || getbufvar(a:origin.intent.buffer, 'wbx_joined_teams_stale', 0) | return | endif
  setlocal buftype=nofile bufhidden=hide noswapfile noundofile nomodeline modifiable
  let b:wbx_team_description = deepcopy(v) | let b:wbx_team_description_status = 'prepared' | let b:wbx_team_description_stale = 0
  let s:descriptions[string(bufnr('%'))] = {'scope': 'team', 'name': name, 'snapshot': deepcopy(v), 'epoch': s:epoch, 'retired': 0,
        \ 'selection': exists('*wbx#context_epoch') ? wbx#context_epoch() : 0, 'joined': a:origin.intent.buffer, 'query': deepcopy(a:origin.context.snapshot)}
  call setline(1, split(v.expectedDescription, "\n", 1))
  setlocal nomodified filetype=wbx-team-description
  setlocal statusline=%!wbx#conversations#team_description_status()
  call s:notice('Team description prepared · not submitted.')
endfunction
function! wbx#conversations#team_description() abort
  if !empty(s:description_read) && get(s:description_read, 'scope', '') ==# 'team'
        \ && (!s:team_valid(s:description_read) || s:description_now() - s:description_read.started >= 20000)
    let s:description_read = {}
  endif
  let reason = wbx#conversations#team_description_reason(0)
  if !empty(reason) | call s:notice(reason) | return | endif
  for buffer in keys(copy(s:descriptions))
    if !s:any_description_current(str2nr(buffer)) | call remove(s:descriptions, buffer) | endif
  endfor
  let s:serial += 1
  let origin = {'serial': s:serial, 'scope': 'team', 'epoch': s:epoch, 'started': s:description_now(),
        \ 'intent': wbx#view#intent(), 'context': s:team_context()}
  let s:description_read = origin
  let request = wbx#rpc('teams.descriptionPrepare', {'teamId': origin.context.row.teamId, 'revision': origin.context.snapshot.revision},
        \ function('s:team_description_received', [origin]))
  if request < 0 && get(s:description_read, 'serial', -1) == origin.serial | let s:description_read = {} | endif
endfunction
function! wbx#conversations#team_description_submit() abort
  let reason = wbx#conversations#team_description_reason(1)
  if !empty(reason) | call s:notice(reason) | return | endif
  let snapshot = deepcopy(s:descriptions[string(bufnr('%'))].snapshot)
  let lines = getline(1, '$') | let text = join(lines, "\n")
  if !empty(filter(copy(lines), 'v:val =~# "\n"')) || !wbx#protocol#description_text(text, 1) || text ==# snapshot.expectedDescription
    call s:notice('Choose changed nonblank LF-only metadata: local 1000 UTF-16 units / 4000 UTF-8 bytes; no clearing/sentinel/truncation.') | return
  endif
  let origin = wbx#view#intent()
  if !s:confirm('Replace description in Team [' . snapshot.teamId . ']? Required unchanged name echo: "' . snapshot.expectedName
        \ . '". Old description: "' . snapshot.expectedDescription . '". New description: "' . text
        \ . '". Fresh Team moderator proof repeats. GET to PUT is not atomic: concurrent description edits may be lost AND required name echo may overwrite a concurrent rename; roles/permissions can race. Continue once?') | return | endif
  if !wbx#view#intent_valid(origin) || !empty(wbx#conversations#team_description_reason(1))
        \ || b:wbx_team_description !=# snapshot || join(getline(1, '$'), "\n") !=# text | return | endif
  let s:serial += 1
  let params = {'requestId': 'team-description-' . getpid() . '-' . s:serial, 'teamId': snapshot.teamId, 'revision': snapshot.revision,
        \ 'expectedName': snapshot.expectedName, 'expectedDescription': snapshot.expectedDescription, 'description': text, 'confirmed': v:true}
  let s:action = extend(copy(params), {'action': 'team-describe', 'buffer': bufnr('%'), 'session': snapshot.sessionId, 'nativeEpoch': s:epoch})
  let request = wbx#rpc('teams.describe', params, function('s:action_result', [copy(s:action)]))
  if request < 0 | let s:action = {} | endif
endfunction
function! wbx#conversations#team_description_cancel() abort
  if !wbx#conversations#is_team_description(bufnr('%')) | return | endif
  if get(s:action, 'action', '') ==# 'team-describe' && get(s:action, 'buffer', 0) == bufnr('%')
    call s:notice('Team metadata write admitted; cancellation cannot prove it unsent. Inspect exact outcome.') | return
  endif
  if get(b:, 'wbx_team_description_status', '') !=# 'unknown' | let b:wbx_team_description_status = 'canceled' | endif
  let b:wbx_team_description_stale = 1
  call remove(s:descriptions, string(bufnr('%')))
  call s:notice('Team description preparation retired; native text/full undo retained. Prepare afresh from an exact joined row.')
endfunction
function! wbx#conversations#team_description_status() abort
  return substitute('Team description [' . get(get(b:, 'wbx_team_description', {}), 'teamId', '') . '] · '
        \ . get(b:, 'wbx_team_description_status', 'retired'), '%', '%%', 'g')
endfunction
function! wbx#conversations#resolve() abort
  if empty(s:unknown) || !wbx#supports('conversations-v1') | call s:notice('No retained unknown conversation action to resolve.') | return | endif
  let origin = wbx#view#intent()
  " Retained intents identify the original request, not current account authority.
  " Backend recovery must freshly verify its authenticated partition after reset.
  let choices = values(copy(s:unknown))
  call s:pick(['Choose exact UNKNOWN action after checking Webex:'] + map(copy(choices), 'printf("%d. %s · %s", v:key + 1, v:val.action, v:val.requestId)'),
        \ function('s:resolve_picked', [origin, choices]))
endfunction
function! s:resolve_picked(origin, choices, choice) abort
  if a:choice < 1 || a:choice > len(a:choices) || !wbx#view#picker_valid(a:origin) || !wbx#supports('conversations-v1') | return | endif
  let intent = a:choices[a:choice - 1]
  if get(s:unknown, s:key(intent), {}) !=# intent | return | endif
  let origin = wbx#view#intent()
  if index(['team-rename', 'team-describe'], intent.action) >= 0 && wbx#conversations#pending() | call s:notice('An operation is active; Team uncertainty remains retained.') | return | endif
  if !s:confirm('Have you checked exact ' . intent.action . ' [' . get(intent, 'teamId', get(intent, 'roomId', 'group creation')) . '] / ' . intent.requestId . ' in Webex? Resolve WITHOUT replay?')
        \ || !wbx#view#intent_valid(origin) || get(s:unknown, s:key(intent), {}) !=# intent | return | endif
  let params = {'action': intent.action, 'checked': v:true}
  if has_key(intent, 'roomId') | let params.roomId = intent.roomId | endif
  if index(['team-rename', 'team-describe'], intent.action) >= 0 | let params.teamId = intent.teamId | endif
  if index(['rename', 'describe', 'lock', 'announcement', 'description-clear', 'team-rename', 'team-describe'], intent.action) >= 0 | let params.requestId = intent.requestId | endif
  call wbx#rpc('conversations.resolve', params, function('s:resolved', [intent, s:epoch, get(get(wbx#state(), 'localContext', {}), 'sessionId', '')]))
endfunction
function! s:resolved(intent, epoch, session, response) abort
  if index(['rename', 'describe', 'lock', 'announcement', 'description-clear', 'team-rename', 'team-describe'], a:intent.action) >= 0 && (a:session !=# get(get(wbx#state(), 'localContext', {}), 'sessionId', '')
        \ || !has_key(a:response, 'result') || a:response.result isnot v:null) | return | endif
  if index(['rename', 'describe', 'lock', 'announcement', 'description-clear', 'team-rename', 'team-describe'], a:intent.action) >= 0 && a:epoch != s:epoch | return | endif
  let key = s:key(a:intent)
  if !has_key(a:response, 'error') && get(s:unknown, key, {}) ==# a:intent | call remove(s:unknown, key) | endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
