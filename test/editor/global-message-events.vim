" Recorded actual SDK/worker/engine snapshots, or a bounded local equivalent.
set encoding=utf-8 hidden noswapfile
let $TZ = 'UTC'
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_notification_records = []
if has('nvim')
  lua vim.notify = function(body, _, opts) local log=vim.g.wbx_notification_records;log[#log+1]={body=body,title=opts.title};vim.g.wbx_notification_records=log end
endif
let g:wbx_tui = {'notifications': {'mode': 'editor', 'preview': 0}}
call setline(1, 'Native editing remains untouched')
let before = [bufnr('%'), b:changedtick, win_getid(), winsaveview()]
try
  if !empty($WBX_MESSAGE_SNAPSHOTS)
    let recording = json_decode(join(readfile($WBX_MESSAGE_SNAPSHOTS), "\n"))
    let states = recording.states
    let sent_messages = recording.sent
    let g:wbx_tui.notifications.preview = get(recording, 'preview', 0)
    let g:wbx_tui.notifications.sender_names = get(recording, 'senderNames', 0)
  else
    let now = localtime() * 1000
    let state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:true, 'room': {'id': 'selected', 'title': 'Selected'}, 'messages': [],
          \ 'readStatus': 'ready', 'rooms': [{'id': 'other', 'title': 'Other space', 'unread': v:false, 'unreadActivity': '2026-11-09T12:00:00.000Z'}],
          \ 'messageEvents': {'state': 'live', 'received': 0, 'items': []}}
    let states = [deepcopy(state)]
    let item = {'id': 'incoming', 'roomId': 'other', 'created': strftime('%Y-%m-%dT%H:%M:%S', localtime()) . '.000Z', 'self': v:false, 'observedAt': now + 123}
    let state.revision += 1 | let state.messageEvents.items = [item] | let state.messageEvents.received = 1
    call add(states, deepcopy(state))
    let state.revision += 1
    call add(state.messageEvents.items, extend(copy(item), {'id': 'native-own', 'self': v:true}))
    call add(state.messageEvents.items, extend(copy(item), {'id': 'local-own', 'self': v:true})) | let state.messageEvents.received = 3
    let sent_messages = [{'roomId': 'other', 'id': 'local-own'}]
    call add(states, deepcopy(state))
  endif
  for state in states
    call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}), 'actual new snapshots must pass native protocol validation')
    if state.state ==# 'ready' && !empty(sent_messages)
      for sent in sent_messages | call wbx#notifications#sent(sent.roomId, sent.id) | endfor
      let sent_messages = []
    endif
    call wbx#notifications#observe(state)
  endfor
  let start = reltime()
  while wbx#notifications#status().submitted.editor < 1 && reltimefloat(reltime(start)) < 2 | sleep 10m | endwhile
  call assert_equal(1, wbx#notifications#status().submitted.editor, 'incoming other-space events still notify with unchanged unread=false')
  call assert_equal({'state': 'live', 'received': 3, 'other_space': 1}, wbx#notifications#status().message_events, 'all same-account creations are suppressed')
  if has('nvim')
    let body = 'New message'
    if g:wbx_tui.notifications.preview
      let excerpt = filter(copy(states[-1].messageEvents.items), '!v:val.self')[0].preview
      let body = excerpt
      if get(g:wbx_tui.notifications, 'sender_names', 0)
        let body = filter(copy(states[-1].messageEvents.items),'!v:val.self')[0].senderName . ': ' . body
      endif
    endif
    call assert_equal([{'title': 'Webex · Other space', 'body': body}], g:wbx_notification_records)
    call assert_notmatch('EXCLUDED_LOCAL_SNIPPET', string(g:wbx_notification_records), 'excluded plugin echoes cannot supply a coalesced preview')
  endif
  call assert_equal(before, [bufnr('%'), b:changedtick, win_getid(), winsaveview()])
  let state = deepcopy(states[-1])
  let original = deepcopy(state)
  let state.messageEvents.items[0].text = 'PRIVATE'
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}), 'unknown/private event fields are rejected')
  let state = deepcopy(original) | call add(state.messageEvents.items, copy(state.messageEvents.items[0]))
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}), 'duplicate event IDs are rejected')
  let state = deepcopy(original) | let state.messageEvents.preview = v:false
  let state.messageEvents.items[0].preview = 'not-consented'
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}), 'unconsented excerpt fields are rejected')
  let state.messageEvents.preview = v:true | let state.messageEvents.items[0].preview = repeat('x', 161)
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}), 'oversized excerpts are rejected')
  let state.messageEvents.items[0].preview = "unsafe\npreview"
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}), 'unsafe excerpts are rejected')
  call wbx#notifications#stop()
  call assert_equal(0, wbx#notifications#status().message_events.received)
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#notifications#stop()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
