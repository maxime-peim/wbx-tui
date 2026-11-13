" Local notification owner. No auth, provider fetches, editor navigation or RPC.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:tracker = wbx#notify_events#new()
let s:agenda = {}
let s:connected = 0
let s:sender_names = 0
let s:held_context = {'listed': {}, 'visible': ''}
let s:accept = 1
let s:focused = 1 " Missing focus reporting conservatively uses editor delivery.
let s:muted_until = 0
let s:queue = []
let s:flush_timer = -1
let s:meeting_timer = -1
let s:active = {}
let s:serial = 0
let s:window = 0
let s:admitted = 0
let s:counts = {'editor': 0, 'desktop': 0, 'dropped': 0}
let s:last_reason = 'idle'
let s:last_provider = 'none'

function! s:boolean(value) abort
  return type(a:value) == v:t_bool || type(a:value) == v:t_number && index([0, 1], a:value) >= 0
endfunction
function! s:options() abort
  let value = get(get(g:, 'wbx_tui', {}), 'notifications', {})
  let base = {'enabled': 1, 'mode': 'editor', 'messages': 1, 'meetings': 1, 'preview': 1, 'titles': 1, 'sender_names': 1,
        \ 'suppress_visible': 1, 'meeting_minutes': [5, 0], 'command': []}
  let safe = deepcopy(base)
  if s:boolean(value) | let base.enabled = !!value | return base | endif
  if type(value) != v:t_dict || !empty(filter(keys(value), 'index(keys(base), v:val) < 0')) | return extend(safe, {'enabled': 0, 'invalid': 1}) | endif
  call extend(base, value, 'force')
  for name in ['enabled', 'messages', 'meetings', 'preview', 'titles', 'sender_names', 'suppress_visible']
    if !s:boolean(base[name]) | return extend(safe, {'enabled': 0, 'invalid': 1}) | endif
  endfor
  if type(base.mode) != v:t_string || index(['editor', 'desktop', 'hybrid'], base.mode) < 0
        \ || type(base.meeting_minutes) != v:t_list || len(base.meeting_minutes) > 4
        \ || !empty(filter(copy(base.meeting_minutes), 'type(v:val) != v:t_number || v:val < 0 || v:val > 30'))
        \ || type(base.command) != v:t_list || len(base.command) > 32
        \ || !empty(filter(copy(base.command), 'type(v:val) != v:t_string || empty(v:val) || strlen(v:val) > 4096 || v:val =~# "[[:cntrl:]\x7f]"'))
    return extend(safe, {'enabled': 0, 'invalid': 1})
  endif
  let base.meeting_minutes = uniq(sort(copy(base.meeting_minutes), 'n'))
  return base
endfunction
function! s:now() abort
  return localtime() * 1000
endfunction
function! s:allowed(options) abort
  return a:options.enabled && s:now() >= s:muted_until
endfunction
function! s:notice(text) abort
  echohl WbxMuted | echo '[wbx-tui] ' . a:text | echohl None
endfunction
function! wbx#notifications#focus(focused) abort
  let s:focused = !!a:focused
endfunction
function! s:visible(state) abort
  if !s:focused || !wbx#view#owned(bufnr('%'), 'history') || wbx#view#edited(bufnr('%')) | return '' | endif
  let room = get(a:state, 'room', v:null)
  let messages = get(a:state, 'messages', [])
  if type(room) != v:t_dict || empty(messages) || get(b:, 'wbx_history_room', '') !=# room.id || !get(a:state, 'historyLatest', 1) | return '' | endif
  for block in get(b:, 'wbx_message_blocks', [])
    if block.id ==# messages[-1].id && wbx#view#range_visible(block.body, max([block.body, block.end - 1]))
      return room.id
    endif
  endfor
  return ''
endfunction
function! s:enqueue(events, options) abort
  for event in a:events
    if !s:allowed(a:options) | let s:counts.dropped += 1 | continue | endif
    let merged = 0
    if index(['message', 'unread'], event.kind) >= 0
      for queued in s:queue
        if queued.kind ==# event.kind && queued.room ==# event.room
          if event.kind ==# 'message'
            let queued.count += event.count | let queued.preview = event.preview
            let queued.messageId = get(event, 'messageId', '')
            let queued.sender = get(event, 'sender', '')
            if get(event, 'held', 0) || get(queued, 'held', 0)
              let queued.held = 1 | let queued.at = min([queued.at, event.at])
            endif
          else
            let queued.activity = get(event, 'activity', 0) || get(queued, 'activity', 0)
          endif
          let merged = 1 | break
        endif
      endfor
    endif
    if !merged
      if len(s:queue) >= 16 | let s:counts.dropped += 1 | else | call add(s:queue, event) | endif
    endif
  endfor
  if !empty(s:queue) && s:flush_timer < 0 && empty(s:active)
    let s:flush_timer = timer_start(250, function('s:flush'))
  endif
endfunction
function! s:meeting_check(timer) abort
  if !s:connected | return | endif
  let options = s:options()
  call s:enqueue(wbx#notify_events#meetings(s:tracker, s:agenda, s:now(), options), options)
  if (!options.enabled || !options.meetings || empty(options.meeting_minutes) || empty(get(s:agenda, 'items', []))) && s:meeting_timer >= 0
    call timer_stop(s:meeting_timer) | let s:meeting_timer = -1
  endif
endfunction
function! wbx#notifications#observe(state) abort
  if !s:accept | return | endif
  if get(a:state, 'state', '') !=# 'ready'
    call s:clear()
    return
  endif
  let s:connected = 1
  let s:sender_names = !!get(a:state, 'senderNames', 0)
  let options = s:options()
  let visible = s:visible(a:state)
  let s:held_context = {'listed': {}, 'visible': visible}
  for room in get(a:state, 'rooms', []) | let s:held_context.listed[room.id] = !get(room, 'cached', 0) && get(room,'notifications',1) | endfor
  let room = get(a:state,'room',v:null)
  if type(room) == v:t_dict && !has_key(s:held_context.listed,room.id)
    let s:held_context.listed[room.id] = !get(room,'cached',0) && get(room,'notifications',1)
  endif
  call filter(s:queue,'index(["message","unread"],v:val.kind) < 0 || get(s:held_context.listed,v:val.room,1)')
  if !empty(s:active) && index(['message','unread'],s:active.event.kind) >= 0
        \ && !get(s:held_context.listed,s:active.event.room,1)
    let s:active.cancelled = 1 | call s:kill(s:active.job)
  endif
  " Muted/disabled creations are consumed at observation, never retained for replay.
  if !s:allowed(options) | let options.messages = 0 | endif
  let events = wbx#notify_events#observe(s:tracker, a:state, s:now(), options, visible)
  let s:agenda = deepcopy(get(a:state, 'upcomingMeetings', {}))
  call s:enqueue(events, options)
  call s:refresh_senders(a:state, options)
  call s:meeting_check(-1)
  if options.enabled && options.meetings && !empty(options.meeting_minutes) && !empty(get(s:agenda, 'items', [])) && s:meeting_timer < 0
    let s:meeting_timer = timer_start(1000, function('s:meeting_check'), {'repeat': -1})
  elseif (!options.enabled || !options.meetings) && s:meeting_timer >= 0
    call timer_stop(s:meeting_timer) | let s:meeting_timer = -1
  endif
endfunction
function! s:refresh_senders(state, options) abort
  if empty(s:queue) && empty(s:tracker.held) | return | endif
  let pending = {}
  for event in s:queue + s:tracker.held
    if event.kind !=# 'message' | continue | endif
    if get(event, 'held', 0) && (!a:options.preview
          \ || event.origin ==# 'global' && !get(get(a:state, 'messageEvents', {}), 'preview', 0))
      let event.preview = '' | let event.sender = ''
    endif
    if !a:options.preview || !a:options.sender_names || !get(a:state, 'senderNames', 0)
      let event.sender = ''
    elseif !empty(get(event, 'messageId', '')) && !empty(event.preview)
      let pending[json_encode([event.room, event.messageId])] = event
    endif
  endfor
  if empty(pending) | return | endif
  let selected = get(a:state, 'room', v:null)
  let room = type(selected) == v:t_dict ? get(selected, 'id', '') : ''
  for message in get(a:state, 'messages', [])
    let key = json_encode([room, message.id])
    if has_key(pending, key) | let pending[key].sender = get(message, 'senderName', '') | endif
  endfor
  let source = get(a:state, 'messageEvents', {})
  for message in get(source, 'items', [])
    let key = json_encode([message.roomId, message.id])
    if has_key(pending, key) | let pending[key].sender = get(source, 'senderNames', 0) ? get(message, 'senderName', '') : '' | endif
  endfor
endfunction
function! wbx#notifications#sent(room, id) abort
  call wbx#notify_events#sent(s:tracker, a:room, a:id)
endfunction
function! wbx#notifications#revoke_room(room) abort
  call filter(s:queue, 'get(v:val, "room", "") !=# a:room')
  call filter(s:tracker.held, 'v:val.room !=# a:room')
  if has_key(s:held_context.listed, a:room) | call remove(s:held_context.listed, a:room) | endif
  if !empty(s:active) && get(s:active.event, 'room', '') ==# a:room
    let s:active.cancelled = 1 | call s:kill(s:active.job)
  endif
endfunction
function! s:payload(event, options) abort
  let title = 'Webex' . (a:options.titles && !empty(get(a:event, 'label', '')) ? ' · ' . a:event.label : '')
  if a:event.kind ==# 'meeting'
    let remaining = a:event.start - s:now()
    let body = remaining <= 0 ? 'Meeting starts now' : 'Meeting starts in ' . max([1, (remaining + 59999) / 60000]) . ' min'
  elseif a:event.kind ==# 'unread'
    let body = get(a:event, 'activity', 0) ? 'New unread activity (unread sync)' : 'Space became unread (unread sync)'
  elseif a:event.kind ==# 'test'
    let body = 'Notification test · no Webex request was made'
  else
    let body = a:event.count == 1 ? 'New message' : a:event.count . ' new messages'
    if a:options.preview && !empty(a:event.preview)
      let body = a:event.preview
      if s:sender_names && a:options.sender_names && !empty(get(a:event, 'sender', '')) | let body = a:event.sender . ': ' . body | endif
    endif
  endif
  return {'title': title, 'body': body}
endfunction
function! s:editor(payload) abort
  if has('nvim')
    try
      if luaeval("require('wbx-tui.notifications').show(_A)", a:payload)
        let s:counts.editor += 1 | let s:last_reason = 'editor-submitted' | let s:last_provider = 'vim.notify' | return
      endif
    catch
      " Optional integration failures fall back without provider/plugin errors.
    endtry
  endif
  echohl WbxTitle | echo a:payload.title . ': ' . a:payload.body | echohl None
  let s:counts.editor += 1 | let s:last_reason = 'native-message' | let s:last_provider = 'native-message'
endfunction
function! s:desktop(options, payload) abort
  if !empty(a:options.command)
    return executable(a:options.command[0]) ? {'argv': copy(a:options.command) + [a:payload.title, a:payload.body], 'provider': 'command'} : {}
  endif
  if executable('notify-send') && (!empty($DBUS_SESSION_BUS_ADDRESS) || !empty($DISPLAY) || !empty($WAYLAND_DISPLAY))
    " Desktop notification bodies may interpret markup; never send raw markup.
    let title = substitute(substitute(substitute(a:payload.title, '&', '\&amp;', 'g'), '<', '\&lt;', 'g'), '>', '\&gt;', 'g')
    let body = substitute(substitute(substitute(a:payload.body, '&', '\&amp;', 'g'), '<', '\&lt;', 'g'), '>', '\&gt;', 'g')
    return {'argv': ['notify-send', '-a', 'wbx-tui', '-t', '6000', '--', title, body], 'provider': 'notify-send'}
  endif
  if executable('terminal-notifier')
    return {'argv': ['terminal-notifier', '-title', a:payload.title, '-message', a:payload.body], 'provider': 'terminal-notifier'}
  endif
  return {}
endfunction
function! s:kill(job) abort
  if has('nvim')
    if type(a:job) == v:t_number && a:job > 0 | silent! call jobstop(a:job) | endif
  elseif type(a:job) == v:t_job && job_status(a:job) ==# 'run'
    silent! call job_stop(a:job, 'kill')
  endif
endfunction
function! s:finish(serial, code) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let active = s:active | let s:active = {}
  if get(active, 'timer', -1) >= 0 | call timer_stop(active.timer) | endif
  let options = s:options()
  if !get(active, 'cancelled', 0) && s:allowed(options)
    if a:code == 0
      let s:counts.desktop += 1 | let s:last_reason = 'desktop-submitted' | let s:last_provider = active.provider
    elseif !get(active, 'timed_out', 0) && s:current(active.event)
      call s:editor(s:payload(active.event, options))
      let s:last_reason = 'desktop-failed-editor-fallback'
    endif
  endif
  if !empty(s:queue) && s:flush_timer < 0 | let s:flush_timer = timer_start(1000, function('s:flush')) | endif
endfunction
function! s:nvim_exit(serial, job, code, event) abort
  call s:finish(a:serial, a:code)
endfunction
function! s:vim_exit(serial, job, code) abort
  call s:finish(a:serial, a:code)
endfunction
function! s:timeout(serial, timer) abort
  if get(s:active, 'serial', -1) != a:serial | return | endif
  let s:active.timed_out = 1
  if !get(s:active, 'cancelled', 0) && s:allowed(s:options()) && s:current(s:active.event)
    call s:editor(s:payload(s:active.event, s:options()))
    let s:last_reason = 'desktop-timeout-editor-fallback'
  endif
  " Hold native admission until on_exit; a slow/hung tool cannot overlap jobs.
  call s:kill(s:active.job)
endfunction
function! s:current(event) abort
  if s:now() < a:event.at || s:now() - a:event.at > (get(a:event, 'held', 0) ? 90000 : 30000) | return 0 | endif
  if index(['message','unread'],a:event.kind) >= 0 && has_key(s:held_context.listed,a:event.room)
        \ && !s:held_context.listed[a:event.room] | return 0 | endif
  if get(a:event, 'held', 0) && (!get(s:held_context.listed, a:event.room, 0)
        \ || s:options().suppress_visible && (s:held_context.visible ==# a:event.room
        \ || s:visible(wbx#state()) ==# a:event.room)) | return 0 | endif
  if a:event.kind ==# 'meeting'
    if get(s:agenda, 'state', '') !=# 'ready' || s:now() < get(s:agenda, 'observedAt', 0)
          \ || s:now() - get(s:agenda, 'observedAt', 0) >= 60000 || s:now() - a:event.start > 60000 | return 0 | endif
    for item in get(s:agenda, 'items', [])
      if json_encode([item.id, item.start]) ==# a:event.key | return 1 | endif
    endfor
    return 0
  endif
  return 1
endfunction
function! s:flush(timer) abort
  let s:flush_timer = -1
  if !empty(s:active) || empty(s:queue) | return | endif
  let options = s:options()
  let event = remove(s:queue, 0)
  let now = s:now()
  if now - s:window >= 60000 || now < s:window | let s:window = now | let s:admitted = 0 | endif
  if !s:allowed(options) || !s:current(event) || s:admitted >= 12
        \ || event.kind ==# 'meeting' && !options.meetings || index(['message', 'unread'], event.kind) >= 0 && !options.messages
    let s:counts.dropped += 1
  else
    let s:admitted += 1
    let payload = s:payload(event, options)
    let desktop = options.mode ==# 'desktop' || options.mode ==# 'hybrid' && !s:focused
    let target = desktop ? s:desktop(options, payload) : {}
    if empty(target)
      call s:editor(payload)
      if desktop | let s:last_reason = 'desktop-unavailable-editor-fallback' | endif
    else
      let s:serial += 1
      let serial = s:serial
      let s:active = {'serial': serial, 'event': event, 'provider': target.provider}
      let job = 0 | let failed = 1
      try
        if has('nvim')
          let job = jobstart(target.argv, {'stdin': 'null', 'on_exit': function('s:nvim_exit', [serial])})
          let failed = job <= 0
        else
          let job = job_start(target.argv, {'in_io': 'null', 'out_io': 'null', 'err_io': 'null', 'exit_cb': function('s:vim_exit', [serial]), 'stoponexit': 'term'})
          let failed = job_status(job) ==# 'fail'
        endif
      catch
        " Tool launch failure is optional delivery failure, never a state error.
      endtry
      let s:active.job = job
      if failed | call s:finish(serial, -1) | else | let s:active.timer = timer_start(2000, function('s:timeout', [serial])) | endif
    endif
  endif
  if !empty(s:queue) && s:flush_timer < 0 && empty(s:active) | let s:flush_timer = timer_start(1000, function('s:flush')) | endif
endfunction
function! s:clear() abort
  if s:flush_timer >= 0 | call timer_stop(s:flush_timer) | endif
  if s:meeting_timer >= 0 | call timer_stop(s:meeting_timer) | endif
  let s:flush_timer = -1 | let s:meeting_timer = -1 | let s:queue = []
  if !empty(s:active)
    " Cancellation revokes delivery, not native process ownership. A new session
    " or explicit notification test must wait for this exact job's on_exit.
    let s:active.cancelled = 1
    if get(s:active, 'timer', -1) >= 0 | call timer_stop(s:active.timer) | endif
    let s:active.timer = -1
    call s:kill(get(s:active, 'job', 0))
  endif
  let s:connected = 0 | let s:sender_names = 0 | let s:agenda = {} | let s:tracker = wbx#notify_events#new()
  let s:held_context = {'listed': {}, 'visible': ''}
endfunction
function! wbx#notifications#stop() abort
  let s:accept = 0
  call s:clear()
endfunction
function! wbx#notifications#start() abort
  let s:accept = 1
endfunction
function! s:pick(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! wbx#notifications#menu() abort
  call s:pick(['Local notification controls (NOT Webex account DND):',
        \ '1. Status', '2. Mute for 30 minutes', '3. Resume (never replay)', '4. Explicit test notification'],
        \ function('s:chosen', [wbx#view#intent()]))
endfunction
function! s:chosen(origin, choice) abort
  if !wbx#view#picker_valid(a:origin) | return | endif
  if a:choice == 1
    echomsg '[wbx-tui] ' . string(wbx#notifications#status())
  elseif a:choice == 2
    call wbx#notifications#mute('30')
  elseif a:choice == 3
    call wbx#notifications#resume()
  elseif a:choice == 4
    call wbx#notifications#test()
  endif
endfunction
function! wbx#notifications#mute(minutes) abort
  let minutes = empty(a:minutes) ? 30 : str2nr(a:minutes)
  if !empty(a:minutes) && a:minutes !~# '^\d\{1,4}$' || minutes < 1 || minutes > 1440
    call s:notice('Mute duration must be 1–1440 minutes.') | return
  endif
  let s:muted_until = s:now() + minutes * 60000
  let s:queue = []
  call wbx#notify_events#clear_held(s:tracker)
  if !empty(s:active)
    let s:active.cancelled = 1
    call s:kill(s:active.job)
  endif
  call s:notice('Notifications muted for ' . minutes . ' minutes; suppressed alerts will not replay.')
endfunction
function! wbx#notifications#resume() abort
  let s:muted_until = 0
  call s:notice('Notifications resumed; suppressed alerts are not replayed.')
endfunction
function! wbx#notifications#test() abort
  let options = s:options()
  if !s:allowed(options) | call s:notice('Notifications are disabled, invalid or muted. Check :WebexHealth.') | return | endif
  call s:enqueue([{'kind': 'test', 'label': '', 'count': 1, 'preview': '', 'at': s:now()}], options)
endfunction
function! wbx#notifications#status() abort
  let options = s:options()
  return {'mode': options.mode, 'enabled': !!options.enabled, 'invalid': get(options, 'invalid', 0),
        \ 'messages': !!options.messages, 'meetings': !!options.meetings, 'preview': !!options.preview, 'titles': !!options.titles, 'sender_names': !!options.sender_names,
        \ 'meeting_minutes': copy(options.meeting_minutes), 'suppress_visible': !!options.suppress_visible,
        \ 'focused': s:focused, 'muted': s:now() < s:muted_until, 'queued': len(s:queue), 'active': !empty(s:active),
        \ 'message_events': {'state': s:tracker.globalState, 'received': s:tracker.globalReceived, 'other_space': s:tracker.globalAlerts},
        \ 'reason': s:last_reason, 'provider': s:last_provider, 'submitted': copy(s:counts)}
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
