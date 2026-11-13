" Bounded, editor-neutral event detection. No jobs, UI, timers, RPC or receipts.
let s:save_cpo = &cpoptions
set cpoptions&vim
" Pure UTC results only, never message identities, bodies or event decisions.
" FIFO replacement is O(1); bound both entry count and retained input length.
let s:time_cache_limit = 2048
let s:time_cache = {}
let s:time_cache_keys = []
let s:time_cache_next = 0
function! wbx#notify_events#new() abort
  return {'room': '', 'ready': 0, 'watermark': -1, 'at_time': {}, 'saturated': 0,
        \ 'unread': {}, 'activity': {}, 'sent': {}, 'skip': {}, 'meetings': {},
        \ 'globalReady': 0, 'globalSeen': {}, 'globalOrder': [], 'globalState': 'legacy', 'globalReceived': 0, 'globalAlerts': 0,
        \ 'globalActivity': {}, 'fallbackActivity': {},
        \ 'held': [], 'uploadSeen': {}, 'uploadOrder': []}
endfunction
function! s:hold(tracker, event) abort
  let key = json_encode([a:event.room, a:event.messageId])
  if has_key(a:tracker.uploadSeen, key) | return | endif
  " Consume even overflow, so switching rooms cannot resurrect a dropped echo.
  let a:tracker.uploadSeen[key] = 1 | call add(a:tracker.uploadOrder, key)
  if len(a:tracker.uploadOrder) > 1000 | call remove(a:tracker.uploadSeen, remove(a:tracker.uploadOrder, 0)) | endif
  if len(a:tracker.held) < 64 | call add(a:tracker.held, a:event) | endif
endfunction
function! wbx#notify_events#clear_held(tracker) abort
  let a:tracker.held = []
endfunction
function! s:pending(state) abort
  return get(a:state, 'uploadPending', 0) || get(a:state, 'directPending', 0)
endfunction
function! s:release(tracker, state, now, options, visible, listed) abort
  let keep = [] | let released = []
  for event in a:tracker.held
    let target = get(a:listed, event.room, {})
    if a:now < event.at || a:now - event.at > 90000 || !a:options.messages
          \ || has_key(a:tracker.sent, json_encode([event.room, event.messageId]))
          \ || empty(target) || get(target, 'cached', 0) || !get(target,'notifications',1)
          \ || a:options.suppress_visible && event.room ==# a:visible | continue | endif
    if !a:options.preview || event.origin ==# 'global' && !get(get(a:state, 'messageEvents', {}), 'preview', 0)
      let event.preview = '' | let event.sender = ''
    endif
    if !get(a:options, 'sender_names', 0) || !get(a:state, 'senderNames', 0)
          \ || event.origin ==# 'global' && !get(get(a:state, 'messageEvents', {}), 'senderNames', 0)
      let event.sender = ''
    endif
    if s:pending(a:state) | call add(keep, event) | else | call add(released, event) | endif
  endfor
  let a:tracker.held = keep
  return released
endfunction
function! wbx#notify_events#text(value, limit) abort
  let text = substitute(a:value, '[[:cntrl:]\x7f-\x9f]', ' ', 'g')
  let text = substitute(text, '[\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]', '', 'g')
  return strcharpart(substitute(text, '\s\+', ' ', 'g'), 0, a:limit)
endfunction
function! s:parse_time(value) abort
  " UTC civil arithmetic avoids locale, process TZ changes and optional %z support.
  if type(a:value) != v:t_string || a:value !~# '^\d\{4}-\d\d-\d\dT\d\d:\d\d:\d\d\(\.\d\{1,3}\)\?Z$' | return -1 | endif
  let y = str2nr(a:value[0:3]) | let m = str2nr(a:value[5:6]) | let d = str2nr(a:value[8:9])
  let h = str2nr(a:value[11:12]) | let minute = str2nr(a:value[14:15]) | let sec = str2nr(a:value[17:18])
  let months = [31, 28 + (y % 400 == 0 || y % 4 == 0 && y % 100 != 0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if y < 1970 || m < 1 || m > 12 || d < 1 || d > months[m - 1] || h > 23 || minute > 59 || sec > 59 | return -1 | endif
  let days = (y - 1970) * 365 + (y - 1) / 4 - (y - 1) / 100 + (y - 1) / 400 - 477 + d - 1
  if m > 1 | for length in months[:m - 2] | let days += length | endfor | endif
  let fraction = a:value[19] ==# '.' ? str2nr(strpart(a:value, 20, strlen(a:value) - 21) . repeat('0', 24 - strlen(a:value))) : 0
  return ((days * 24 + h) * 60 + minute) * 60000 + sec * 1000 + fraction
endfunction
function! wbx#notify_events#time(value) abort
  if type(a:value) != v:t_string | return -1 | endif
  " Oversized invalid input is still checked, but cannot enlarge retained keys.
  if strlen(a:value) > 128 | return s:parse_time(a:value) | endif
  if has_key(s:time_cache, a:value) | return s:time_cache[a:value] | endif
  let time = s:parse_time(a:value)
  if len(s:time_cache_keys) < s:time_cache_limit
    call add(s:time_cache_keys, a:value)
  else
    call remove(s:time_cache, s:time_cache_keys[s:time_cache_next])
    let s:time_cache_keys[s:time_cache_next] = a:value
    let s:time_cache_next = (s:time_cache_next + 1) % s:time_cache_limit
  endif
  let s:time_cache[a:value] = time " Cache invalid (-1) results too.
  return time
endfunction
function! wbx#notify_events#sent(tracker, room, id) abort
  if empty(a:id)
    if len(a:tracker.skip) >= 256 | call remove(a:tracker.skip, keys(a:tracker.skip)[0]) | endif
    let a:tracker.skip[a:room] = 1 " Older backend: conservatively baseline one post-send batch.
  else
    if len(a:tracker.sent) >= 256 | call remove(a:tracker.sent, keys(a:tracker.sent)[0]) | endif
    let a:tracker.sent[json_encode([a:room, a:id])] = 1
  endif
endfunction
function! wbx#notify_events#observe(tracker, state, now, options, visible) abort
  let t = a:tracker
  let room = type(get(a:state, 'room', 0)) == v:t_dict ? a:state.room : {}
  let id = get(room, 'id', '')
  let ready = get(a:state, 'ready', 0) && !empty(id)
  let continuous = t.ready && ready && t.room ==# id
  let messages = get(a:state, 'messages', [])
  let high = continuous ? t.watermark : -1
  let times = []
  let candidates = []
  let listed = {}
  for item in get(a:state, 'rooms', []) | let listed[item.id] = item | endfor
  if !empty(id) && !has_key(listed,id) | let listed[id] = room | endif
  " Both maps are display-only, bounded by the current loaded noncached rooms.
  call filter(t.globalActivity, 'has_key(listed, v:key) && !get(listed[v:key], "cached", 0)')
  call filter(t.fallbackActivity, 'has_key(listed, v:key) && !get(listed[v:key], "cached", 0)')
  let skip = has_key(t.skip, id)
  for message in messages
    let time = wbx#notify_events#time(message.created)
    call add(times, time)
    let high = max([high, time])
    if continuous && !skip && time >= 0 && (time > t.watermark || time == t.watermark && !t.saturated && !has_key(t.at_time, message.id))
          \ && !has_key(t.sent, json_encode([id, message.id])) && !has_key(t.uploadSeen, json_encode([id, message.id]))
      call add(candidates, message)
    endif
  endfor
  if skip && ready | call remove(t.skip, id) | endif
  if !continuous || high > t.watermark | let t.at_time = {} | let t.saturated = 0 | endif
  let position = 0
  for message in messages
    if times[position] == high && !has_key(t.at_time, message.id)
      if len(t.at_time) < 1000 | let t.at_time[message.id] = 1 | else | let t.saturated = 1 | endif
    endif
    let position += 1
  endfor
  let t.room = id | let t.ready = ready | let t.watermark = high
  " Modern creations carry self evidence; REST history alone cannot identify it.
  if has_key(a:state,'messageEvents') || !get(room,'notifications',1) | let candidates = [] | endif
  let events = []
  if s:pending(a:state)
    for message in candidates
      let created = wbx#notify_events#time(message.created)
      if a:options.messages && has_key(listed, id) && !get(listed[id], 'cached', 0)
            \ && a:now - created <= 30000 && created - a:now <= 5000
            \ && !(a:options.suppress_visible && a:visible ==# id)
        call s:hold(t, {'kind': 'message', 'room': id, 'label': wbx#notify_events#text(get(room, 'title', 'Webex space'), 100),
              \ 'count': 1, 'messageId': message.id, 'preview': a:options.preview ? wbx#notify_events#text(message.text, 160) : '',
              \ 'sender': get(a:options, 'sender_names', 0) && get(a:state, 'senderNames', 0) ? get(message, 'senderName', '') : '',
              \ 'created': message.created, 'at': a:now, 'held': 1, 'origin': 'history'})
      endif
    endfor
    let candidates = []
  endif
  if !empty(candidates) && a:options.messages && !(a:options.suppress_visible && a:visible ==# id)
    call add(events, {'kind': 'message', 'room': id, 'label': wbx#notify_events#text(get(room, 'title', 'Webex space'), 100),
           \ 'count': len(candidates), 'preview': a:options.preview ? wbx#notify_events#text(candidates[-1].text, 160) : '', 'at': a:now})
    if get(a:options, 'sender_names', 0)
      let events[-1].messageId = candidates[-1].id
      let events[-1].sender = get(a:state, 'senderNames', 0) ? get(candidates[-1], 'senderName', '') : ''
    endif
  endif
  if has_key(a:state, 'messageEvents')
    let source = a:state.messageEvents
    let t.globalState = source.state | let t.globalReceived = source.received
    let batches = {}
    for message in source.items
      let key = json_encode([message.roomId, message.id])
      if has_key(t.globalSeen, key) || has_key(t.uploadSeen, key) | continue | endif
      let t.globalSeen[key] = 1 | call add(t.globalOrder, key)
      if len(t.globalOrder) > 1000 | call remove(t.globalSeen, remove(t.globalOrder, 0)) | endif
      let created = wbx#notify_events#time(message.created)
      let target = get(listed, message.roomId, {})
      let eligible = index(['live', 'polling'], source.state) >= 0 && !empty(target) && !get(target, 'cached', 0)
            \ && created >= 0 && a:now - created <= 30000 && created - a:now <= 5000
            \ && message.observedAt - a:now <= 1000 && a:now - message.observedAt <= 30000
      if eligible
        " Consume even initial/disabled/exact plugin events: their later unread
        " metadata must not become a second, generic notification.
        let t.globalActivity[message.roomId] = max([created, get(t.globalActivity, message.roomId, -1)])
      endif
      " Consume initial/replayed/disabled/locally-sent/selected events without ever
      " treating them as read-state evidence. Selected history keeps its existing
      " content-aware observer, so SDK + REST cannot double-notify that space.
      if !t.globalReady || !eligible || message.self || !get(target,'notifications',1)
            \ || a:options.suppress_visible && message.roomId ==# a:visible || has_key(t.sent, key)
            \ || created <= get(t.fallbackActivity, message.roomId, -1) || !a:options.messages | continue | endif
      if !has_key(batches, message.roomId)
        let batches[message.roomId] = {'kind': 'message', 'room': message.roomId, 'label': wbx#notify_events#text(target.title, 100), 'count': 0, 'preview': '', 'at': a:now}
      endif
      let batches[message.roomId].count += 1 | let t.globalAlerts += 1
      if a:options.preview | let batches[message.roomId].preview = wbx#notify_events#text(get(message, 'preview', ''), 160) | endif
      if get(a:options, 'sender_names', 0)
        let batches[message.roomId].messageId = message.id
        let batches[message.roomId].sender = get(source, 'senderNames', 0) ? get(message, 'senderName', '') : ''
      endif
    endfor
    let t.globalReady = 1
    call extend(events, values(batches))
  endif
  let unread = {}
  let activities = {}
  if get(a:state, 'readStatus', 'off') ==# 'ready'
    for item in get(a:state, 'rooms', [])
      if !get(item, 'cached', 0) && !get(item, 'unreadStale', 0) && type(get(item, 'unread', 0)) == v:t_bool
        let unread[item.id] = item.unread
        let activity = wbx#notify_events#time(get(item, 'unreadActivity', ''))
        if activity >= 0 | let activities[item.id] = activity | endif
        let advanced = has_key(t.activity, item.id) && activity > t.activity[item.id]
        let transition = item.id !=# id && item.unread && has_key(t.unread, item.id) && (!t.unread[item.id] || advanced)
        let legacy = !has_key(a:state, 'messageEvents')
        let fallback = !legacy && a:state.messageEvents.state ==# 'polling' && transition && advanced
              \ && activity >= 0 && a:now - activity <= 30000 && activity - a:now <= 5000
              \ && activity > get(t.globalActivity, item.id, -1) && activity > get(t.fallbackActivity, item.id, -1)
        if fallback
          " One generic activity alert covers activity through this timestamp,
          " including a delayed creation from the same degraded interval. Muted
          " activity is consumed too, never replayed when delivery resumes.
          let t.fallbackActivity[item.id] = activity
        endif
        if transition && (legacy || fallback) && a:options.messages && get(item,'notifications',1)
          call add(events, {'kind': 'unread', 'room': item.id, 'activity': !!t.unread[item.id], 'label': wbx#notify_events#text(item.title, 100), 'count': 1, 'preview': '', 'at': a:now})
        endif
      endif
    endfor
  endif
  let t.unread = unread " Failure/cache/unknown removes continuity; recovery is a baseline.
  let t.activity = activities
  call extend(events, s:release(t, a:state, a:now, a:options, a:visible, listed))
  return events
endfunction
function! wbx#notify_events#meetings(tracker, agenda, now, options) abort
  for [key, expiry] in items(a:tracker.meetings)
    if expiry <= a:now | call remove(a:tracker.meetings, key) | endif
  endfor
  if get(a:agenda, 'state', '') !=# 'ready' || !has_key(a:agenda, 'observedAt')
        \ || a:now < a:agenda.observedAt || a:now - a:agenda.observedAt >= 60000 | return [] | endif
  let events = []
  for item in get(a:agenda, 'items', [])
    let start = wbx#notify_events#time(item.start) | let end = wbx#notify_events#time(item.end)
    if start < 0 || end <= a:now || start - a:now < -60000 | continue | endif
    let due = []
    for minute in a:options.meeting_minutes
      let key = json_encode([item.id, item.start, minute])
      if start - a:now <= minute * 60000 && !has_key(a:tracker.meetings, key)
        if len(a:tracker.meetings) >= 256 | continue | endif
        let a:tracker.meetings[key] = max([end, start + 60001])
        call add(due, minute)
      endif
    endfor
    if !empty(due) && a:options.meetings
      call add(events, {'kind': 'meeting', 'key': json_encode([item.id, item.start]), 'label': wbx#notify_events#text(item.title, 100),
            \ 'start': start, 'count': 1, 'preview': '', 'at': a:now})
    endif
  endfor
  return events
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
