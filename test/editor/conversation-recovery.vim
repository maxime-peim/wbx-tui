" Native unknown-result consent and ACK ordering; inert RPC callbacks only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:conversation_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_space(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_description(format) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_lock(format) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_announcement(format) abort', 'return 1', 'endfunction',
      \ 'function! wbx#supports_description_clear(format) abort', 'return 1', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Protocol error"', 'endfunction',
      \ 'function! wbx#select(room, ...) abort', 'call add(g:conversation_selected, a:room)', 'endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort',
      \ 'call add(g:conversation_requests, {"method": a:method, "params": deepcopy(a:params)})',
      \ 'if !a:0 | return 1 | endif',
      \ 'if a:method ==# "direct.prepare"',
      \ 'call call(a:1, [{"result": {"targetId": repeat("a", 32), "personId": "person", "label": "Exact recipient", "expiresAt": 1999999999999}}])',
      \ 'elseif a:method ==# "direct.send"',
      \ 'let value = {"requestId": a:params.requestId, "action": "direct", "status": "unknown", "notice": "Unknown direct", "targetId": a:params.targetId, "draftId": a:params.draftId}',
      \ 'call call(a:1, [{"result": value}])',
      \ 'elseif a:method ==# "rooms.descriptionPrepare"',
      \ 'call call(a:1, [{"result": {"roomId": a:params.roomId, "expectedTitle": g:conversation_state.room.title, "expectedDescription": "Synthetic old description", "sessionId": g:conversation_state.localContext.sessionId, "observedAt": localtime() * 1000}}])',
      \ 'elseif a:method =~# "resolve$"',
      \ 'if get(g:, "conversation_hold", 0) | let g:ConversationResolve = a:1 | return 1 | endif',
      \ 'call call(a:1, [get(g:, "conversation_refuse", 0) ? {"error": {"code": -1, "message": "Synthetic refusal"}} : {"result": v:null}])',
      \ 'else',
      \ 'let action = a:method ==# "rooms.create" ? "create" : a:method ==# "rooms.rename" ? "rename" : a:method ==# "rooms.describe" ? "describe" : a:method ==# "rooms.descriptionClear" ? "description-clear" : a:method ==# "rooms.lock" ? "lock" : a:method ==# "rooms.announcement" ? "announcement" : a:params.action',
      \ 'let value = {"requestId": a:params.requestId, "action": action, "status": g:conversation_outcome, "notice": "Synthetic outcome"}',
      \ 'if action ==# "rename" | let value.expectedTitle = a:params.expectedTitle | let value.title = a:params.title | endif',
      \ 'if action ==# "describe" | let value.expectedTitle = a:params.expectedTitle | let value.expectedDescription = a:params.expectedDescription | let value.description = a:params.description | endif',
      \ 'if action ==# "description-clear" | let value.expectedTitle = a:params.expectedTitle | let value.expectedDescription = a:params.expectedDescription | endif',
      \ 'if action ==# "lock" | let value.expectedTitle = a:params.expectedTitle | let value.expectedLocked = a:params.expectedLocked | let value.locked = a:params.locked | endif',
      \ 'if action ==# "announcement" | let value.expectedTitle = a:params.expectedTitle | let value.expectedAnnouncementOnly = a:params.expectedAnnouncementOnly | let value.announcementOnly = a:params.announcementOnly | endif',
      \ 'if action !=# "create" | let value.roomId = a:params.roomId | elseif value.status ==# "changed" | let value.roomId = "returned-group" | endif',
      \ 'if get(g:, "conversation_action_hold", 0) | let g:ConversationAction = a:1 | let g:conversation_ack = value | return 1 | endif',
      \ 'call call(a:1, [{"result": value}])',
      \ 'endif', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:conversation_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Room', 'type': 'group'},
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'},
      \ 'rooms': [{'id': 'returned-group', 'title': 'Not an identity', 'type': 'group'}]}
let g:conversation_requests = [] | let g:conversation_selected = []
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn 1\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\nif get(g:, 'conversation_pick_hold', 0) | let g:ConversationPick = a:Callback | return | endif\nnew\nclose\ncall call(a:Callback, [1])\nendfunction"
try
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#action('create', 'Exact group')
  let g:conversation_pick_hold = 1
  call wbx#conversations#resolve()
  let attempts = len(g:conversation_requests)
  let g:conversation_state.localContext.sessionId = repeat('b',32)
  call call(g:ConversationPick,[1])
  call assert_equal(attempts,len(g:conversation_requests),'old-session menu cannot resolve uncertainty')
  let g:conversation_state.localContext.sessionId = repeat('a',32)
  let g:conversation_pick_hold = 0
  let g:conversation_outcome = 'changed'
  call wbx#conversations#action('invite', 'exact-person')
  let g:conversation_refuse = 1
  call wbx#conversations#resolve()
  call assert_equal('create', g:conversation_requests[-1].params.action, 'unrelated successful invite cannot erase uncertain creation')
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve()
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#action('create', 'Another exact group')
  call call(g:ConversationResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('create', 'Must not replay')
  call assert_equal(attempts, len(g:conversation_requests), 'late older resolution cannot clear a newer uncertain creation')
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'changed'
  call wbx#conversations#action('create', 'Confirmed group')
  call wbx#conversations#open()
  call assert_equal(['returned-group'], g:conversation_selected, 'Open uses only the exact confirmed returned room')
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#action('create', 'Uncertain newer group')
  call wbx#conversations#open()
  call assert_equal(['returned-group'], g:conversation_selected, 'an uncertain new creation cannot silently Open the older group')
  call wbx#conversations#direct('person')
  call setline(1, 'Exact plaintext')
  call wbx#conversations#send()
  let attempts = len(g:conversation_requests)
  call wbx#conversations#send()
  call wbx#conversations#cancel_direct()
  call assert_equal(attempts, len(g:conversation_requests), 'unknown direct send neither replays nor discards the only resolvable context')
  let g:conversation_refuse = 1
  call wbx#conversations#resolve_direct()
  call assert_match('^unknown', b:wbx_recipient_status, 'failed resolution does not claim success')
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve_direct()
  call wbx#conversations#invalidate()
  call call(g:ConversationResolve, [{'result': v:null}])
  call assert_true(b:wbx_recipient_stale)
  call assert_match('unknown', b:wbx_recipient_status, 'old-session resolution cannot clear a newer stale/unknown context')
  call assert_equal(['Exact plaintext'], getline(1, '$'))
  " MF23 reuses recovery but correlates exact original title/request evidence.
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  new wbx://compose/r
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'r' | let b:wbx_parent = ''
  call setline(1, 'Rename never clears or sends this native draft')
  call wbx#conversations#action('rename', 'First rename')
  let first = deepcopy(g:conversation_requests[-1].params)
  call assert_false(has_key(first, 'action'), 'rooms.rename is a finite title intent, not a generic action map')
  call assert_equal('Room', first.expectedTitle)
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'Must stay blocked')
  call assert_equal(attempts, len(g:conversation_requests))
  let g:conversation_refuse = 1
  call wbx#conversations#resolve()
  call assert_equal(first.requestId, g:conversation_requests[-1].params.requestId, 'resolution carries original unknown request')
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve()
  let OlderRenameResolve = g:ConversationResolve
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  call wbx#conversations#action('rename', 'Second rename')
  call call(OlderRenameResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'Older ACK cannot unblock')
  call assert_equal(attempts, len(g:conversation_requests))
  let g:conversation_hold = 1
  call wbx#conversations#resolve()
  call wbx#conversations#invalidate()
  call call(g:ConversationResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'Old-session resolution cannot unblock')
  call assert_equal(attempts, len(g:conversation_requests))
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'conflict'
  call wbx#conversations#action('rename', 'Changed remotely')
  let g:conversation_outcome = 'changed'
  call wbx#conversations#action('rename', 'Fresh explicit choice')
  call assert_equal('Fresh explicit choice', g:conversation_requests[-1].params.title, 'conflict is not an unknown latch')
  call assert_equal(['Rename never clears or sends this native draft'], getline(1, '$'))
  let source = bufnr('%')
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#action('rename', 'Unknown title')
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call wbx#conversations#lock(v:true)
  call wbx#conversations#announcement(v:true)
  call assert_match('unknown', wbx#conversations#description_clear_reason(), 'rename unknown blocks clear before private-preparation checks')
  call assert_equal(attempts, len(g:conversation_requests), 'unknown rename prevents description preparation/title-echo bypass')
  call wbx#conversations#resolve()
  call wbx#conversations#description()
  let edit = bufnr('%')
  call assert_true(exists('b:wbx_space_description'))
  call setline(1, 'Exact new description')
  call wbx#conversations#description_submit()
  let original = deepcopy(g:conversation_requests[-1].params)
  call assert_equal('unknown', b:wbx_space_description_status)
  call wbx#conversations#description_cancel()
  execute 'buffer ' . source
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'No bypass after metadata cancel')
  call wbx#conversations#description()
  call wbx#conversations#lock(v:true)
  call wbx#conversations#announcement(v:true)
  call assert_match('unknown', wbx#conversations#description_clear_reason(), 'describe unknown blocks clear despite buffer retirement')
  call assert_equal(attempts, len(g:conversation_requests), 'retiring a native buffer cannot resolve unknown metadata')
  let g:conversation_refuse = 1
  call wbx#conversations#resolve()
  call assert_equal(original.requestId, g:conversation_requests[-1].params.requestId, 'describe recovery sends the original request evidence')
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve()
  let OlderDescriptionResolve = g:ConversationResolve
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  call wbx#conversations#description()
  call setline(1, 'Newer uncertain description')
  call wbx#conversations#description_submit()
  call call(OlderDescriptionResolve, [{'result': v:null}])
  execute 'buffer ' . source
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'Older describe resolution cannot unblock')
  call assert_equal(attempts, len(g:conversation_requests))
  let g:conversation_hold = 1
  call wbx#conversations#resolve()
  call wbx#conversations#invalidate()
  call call(g:ConversationResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'old-session resolution cannot erase describe uncertainty')
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'changed'
  call wbx#conversations#description()
  call setline(1, 'Confirmed description')
  call wbx#conversations#description_submit()
  call assert_equal('changed', b:wbx_space_description_status)
  call assert_equal(['Confirmed description'], getline(1, '$'), 'metadata ACK leaves native work intact')
  execute 'buffer ' . source
  call assert_equal(['Rename never clears or sends this native draft'], getline(1, '$'))
  " Lock shares the same uncertainty owner but binds exact boolean preconditions.
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#lock(v:true)
  let original_lock = deepcopy(g:conversation_requests[-1].params)
  call assert_equal(v:false, original_lock.expectedLocked) | call assert_equal(v:true, original_lock.locked)
  let attempts = len(g:conversation_requests)
  call wbx#conversations#lock(v:false)
  call wbx#conversations#action('rename', 'Cannot bypass lock unknown')
  call wbx#conversations#description()
  call wbx#conversations#announcement(v:true)
  call assert_equal(attempts, len(g:conversation_requests))
  let g:conversation_refuse = 1
  call wbx#conversations#resolve()
  call assert_equal(original_lock.requestId, g:conversation_requests[-1].params.requestId)
  call assert_match('unknown', wbx#conversations#description_clear_reason(), 'lock unknown blocks clear')
  call assert_equal('lock', g:conversation_requests[-1].params.action)
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve()
  let OlderLockResolve = g:ConversationResolve
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  call wbx#conversations#lock(v:false)
  call call(OlderLockResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'old lock resolution cannot clear newer unlock uncertainty')
  let g:conversation_hold = 1
  call wbx#conversations#resolve()
  call wbx#conversations#invalidate()
  call call(g:ConversationResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'Old-session lock resolve cannot unblock')
  call assert_equal(attempts, len(g:conversation_requests))
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_action_hold = 1 | let g:conversation_outcome = 'changed'
  call wbx#conversations#lock(v:true)
  call assert_true(wbx#conversations#pending())
  call wbx#conversations#invalidate()
  call call(g:ConversationAction, [{'result': g:conversation_ack}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'late admitted lock ACK cannot erase disconnected uncertainty')
  let g:conversation_action_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'conflict'
  call wbx#conversations#lock(v:true)
  let g:conversation_outcome = 'changed'
  call wbx#conversations#lock(v:true)
  call assert_equal('rooms.lock', g:conversation_requests[-1].method, 'conflict does not create unknown authority')
  call assert_equal(['Rename never clears or sends this native draft'], getline(1, '$'))
  " Announcement keeps its original request and explicit mode preconditions.
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#announcement(v:true)
  let original_announcement = deepcopy(g:conversation_requests[-1].params)
  call assert_equal(v:false, original_announcement.expectedAnnouncementOnly)
  call assert_equal(v:true, original_announcement.announcementOnly)
  call assert_equal('r', original_announcement.roomId)
  let attempts = len(g:conversation_requests)
  call wbx#conversations#announcement(v:false)
  call wbx#conversations#lock(v:false)
  call wbx#conversations#action('rename', 'Cannot bypass announcement unknown')
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'unknown announcement interlocks every metadata operation and preparation')
  call assert_match('unknown', wbx#conversations#description_clear_reason(), 'announcement unknown blocks clear')
  let g:conversation_refuse = 1
  call wbx#conversations#resolve()
  call assert_equal(original_announcement.requestId, g:conversation_requests[-1].params.requestId)
  call assert_equal('announcement', g:conversation_requests[-1].params.action)
  call assert_equal('r', g:conversation_requests[-1].params.roomId)
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve()
  let OlderAnnouncementResolve = g:ConversationResolve
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  call wbx#conversations#announcement(v:false)
  call call(OlderAnnouncementResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#lock(v:false)
  call assert_equal(attempts, len(g:conversation_requests), 'old On resolution cannot clear newer Off uncertainty')
  let g:conversation_hold = 1
  call wbx#conversations#resolve()
  call wbx#conversations#invalidate()
  call call(g:ConversationResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#announcement(v:true)
  call assert_equal(attempts, len(g:conversation_requests), 'old-session announcement resolution cannot unblock')
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_action_hold = 1 | let g:conversation_outcome = 'changed'
  call wbx#conversations#announcement(v:true)
  let OlderAnnouncementAction = g:ConversationAction | let old_ack = deepcopy(g:conversation_ack)
  call assert_true(wbx#conversations#pending())
  call wbx#conversations#invalidate()
  call call(OlderAnnouncementAction, [{'result': old_ack}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'late admitted announcement ACK cannot erase disconnected uncertainty')
  let g:conversation_action_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#announcement(v:false)
  call call(OlderAnnouncementAction, [{'result': old_ack}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#announcement(v:true)
  call assert_equal(attempts, len(g:conversation_requests), 'old action ACK cannot clear newer mode uncertainty')
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'conflict'
  call wbx#conversations#announcement(v:true)
  let g:conversation_outcome = 'changed'
  call wbx#conversations#announcement(v:true)
  call assert_equal('rooms.announcement', g:conversation_requests[-1].method, 'mode conflict is not an unknown latch')
  call assert_equal(['Rename never clears or sends this native draft'], getline(1, '$'))
  " Clear uses the same privately owned preparation; cancellation never resolves it.
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#description()
  let clear_edit = bufnr('%') | let clear_text = getline(1, '$')
  call feedkeys("i\<Esc>", 'xt')
  let clear_tree = undotree()
  call wbx#conversations#description_clear()
  let original_clear = deepcopy(g:conversation_requests[-1].params)
  call assert_equal('Synthetic old description', original_clear.expectedDescription)
  call assert_false(has_key(original_clear, 'description'), 'caller/native IPC never owns sentinel input')
  call assert_equal('unknown', b:wbx_space_description_status)
  call assert_equal(clear_text, getline(1, '$')) | call assert_equal(clear_tree, undotree())
  call wbx#conversations#description_cancel()
  execute 'buffer ' . source
  let attempts = len(g:conversation_requests)
  call wbx#conversations#action('rename', 'Cannot bypass clear unknown')
  call wbx#conversations#lock(v:false)
  call wbx#conversations#announcement(v:false)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'clear cancellation cannot unblock five-way metadata uncertainty')
  let g:conversation_refuse = 1
  call wbx#conversations#resolve()
  call assert_equal('description-clear', g:conversation_requests[-1].params.action)
  call assert_equal(original_clear.roomId, g:conversation_requests[-1].params.roomId)
  call assert_equal(original_clear.requestId, g:conversation_requests[-1].params.requestId)
  let g:conversation_refuse = 0 | let g:conversation_hold = 1
  call wbx#conversations#resolve()
  let OlderClearResolve = g:ConversationResolve
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  call wbx#conversations#description()
  call wbx#conversations#description_clear()
  execute 'buffer ' . source
  call call(OlderClearResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'older clear resolution cannot erase newer clear evidence')
  let g:conversation_hold = 1
  call wbx#conversations#resolve()
  call wbx#conversations#invalidate()
  call call(g:ConversationResolve, [{'result': v:null}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'old-session clear resolution cannot unblock')
  let g:conversation_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'changed' | let g:conversation_action_hold = 1
  call wbx#conversations#description()
  let admitted_clear = bufnr('%') | let retained = getline(1, '$')
  call wbx#conversations#description_clear()
  let OlderClearAction = g:ConversationAction | let old_clear_ack = deepcopy(g:conversation_ack)
  call wbx#conversations#description_cancel()
  call assert_true(wbx#conversations#pending(), 'cancel cannot retire an admitted sentinel PUT')
  call assert_true(wbx#conversations#is_description(admitted_clear))
  call wbx#conversations#invalidate()
  call call(OlderClearAction, [{'result': old_clear_ack}])
  call assert_equal('unknown', b:wbx_space_description_status, 'late explicit clear ACK cannot erase disconnected uncertainty')
  call assert_equal(retained, getline(1, '$'))
  execute 'buffer ' . source
  let g:conversation_action_hold = 0
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'unknown'
  call wbx#conversations#action('rename', 'Newer uncertain title')
  call call(OlderClearAction, [{'result': old_clear_ack}])
  let attempts = len(g:conversation_requests)
  call wbx#conversations#description()
  call assert_equal(attempts, len(g:conversation_requests), 'old clear action ACK cannot erase newer cross-action uncertainty')
  call wbx#conversations#resolve()
  let g:conversation_outcome = 'conflict'
  call wbx#conversations#description()
  call wbx#conversations#description_clear()
  call assert_equal('conflict', b:wbx_space_description_status)
  call assert_equal('Synthetic old description', getline(1), 'conflict retires but never clears native text')
  execute 'buffer ' . source
  call assert_equal(['Rename never clears or sends this native draft'], getline(1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
