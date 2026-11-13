" Independent meeting observations, explicit actions and one pane request. No terminal/process or messaging-session ownership.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#meeting_action#new(ports) abort
  return {'ports':a:ports, 'meeting':{'active':v:false, 'ready':v:false, 'session':v:null, 'attach':[], 'display':'editor'},
        \ 'events':{}, 'epoch':0, 'detached':0, 'terminal_session':'', 'pending':0, 'serial':0}
endfunction
function! wbx#meeting_action#state(owner) abort
  return deepcopy(a:owner.meeting)
endfunction
function! wbx#meeting_action#events(owner) abort
  return deepcopy(a:owner.events)
endfunction
function! wbx#meeting_action#epoch(owner) abort
  return a:owner.epoch
endfunction
function! wbx#meeting_action#pending(owner) abort
  return a:owner.pending
endfunction
function! wbx#meeting_action#reset(owner) abort
  let a:owner.pending = 0
endfunction
function! wbx#meeting_action#observe(owner, meeting) abort
  if a:owner.meeting !=# a:meeting | let a:owner.epoch += 1 | endif
  if get(a:owner.meeting, 'session', v:null) !=# get(a:meeting, 'session', v:null)
        \ || get(a:owner.meeting, 'active', 0) != get(a:meeting, 'active', 0) || !get(a:meeting, 'active', 0)
    let a:owner.events = {}
    " Retired owner requests are never replayed or reported as replacement success.
    call wbx#meeting_action#reset(a:owner)
  endif
  let a:owner.meeting = a:meeting
endfunction
function! wbx#meeting_action#receive(owner, meeting) abort
  call wbx#meeting_action#observe(a:owner, a:meeting)
  if !get(a:meeting, 'active', 0) || get(a:meeting, 'display', '') !=# 'editor'
    call call(a:owner.ports.Detach, [])
    let a:owner.terminal_session = ''
  endif
  call call(a:owner.ports.Render, [])
  if !call(a:owner.ports.Closing, []) && !a:owner.detached && get(a:meeting, 'active', 0)
        \ && get(a:meeting, 'display', '') ==# 'editor' && !empty(get(a:meeting, 'attach', []))
    let a:owner.terminal_session = a:meeting.session
    call call(a:owner.ports.Terminal, [a:meeting.attach])
  endif
  call call(a:owner.ports.Event, ['WbxMeeting', deepcopy(a:meeting)])
endfunction
function! wbx#meeting_action#media(owner, params) abort
  let key = get(a:params, 'type', 'status')
  if key ==# 'send-state' | let key .= ':' . get(a:params, 'kind', '') | endif
  let a:owner.events[key] = a:params
  call call(a:owner.ports.Render, [])
  call call(a:owner.ports.Event, ['WbxMeetingEvent', deepcopy(a:params)])
endfunction
function! wbx#meeting_action#lost(owner) abort
  let a:owner.epoch += 1
  call wbx#meeting_action#reset(a:owner)
endfunction
function! wbx#meeting_action#unready(owner) abort
  let a:owner.meeting.ready = v:false
endfunction
function! wbx#meeting_action#supports(owner, capability, allow_unready) abort
  return call(a:owner.ports.Ready, []) && !call(a:owner.ports.Disconnected, []) && get(a:owner.meeting, 'active', 0)
        \ && (a:allow_unready || get(a:owner.meeting, 'ready', 0)) && index(call(a:owner.ports.Capabilities, []), a:capability) >= 0
endfunction
function! wbx#meeting_action#compact(owner) abort
  return wbx#meeting#compact(a:owner.meeting, a:owner.events, !call(a:owner.ports.Disconnected, []))
endfunction
function! wbx#meeting_action#start(owner, url, demo) abort
  let options = call(a:owner.ports.Options, [])
  let meeting = extend({'display':'auto', 'fallback':'editor', 'headless_demo':0}, options.meeting, 'force')
  let mode = a:demo || options.demo && empty(a:url) ? 'demo' : 'live'
  let a:owner.detached = 0
  let url = a:url
  if mode ==# 'live' && empty(url)
    let url = call(a:owner.ports.Input, ['Webex HTTPS meeting link: '])
    if empty(url) | return | endif
  endif
  let params = {'mode':mode, 'display':meeting.display, 'fallback':meeting.fallback, 'headless':mode ==# 'demo' && meeting.headless_demo ? v:true : v:false}
  if mode ==# 'live' | let params.meeting = url | endif
  if !empty(options.config) | let params.config = expand(options.config) | endif
  if has_key(meeting, 'call_id') | let params.callId = meeting.call_id | endif
  call call(a:owner.ports.Request, ['meeting.start', params])
endfunction
function! wbx#meeting_action#present(owner, display) abort
  if a:display ==# 'editor' | call call(a:owner.ports.Focus, []) | endif
  let a:owner.detached = 0
  call call(a:owner.ports.Request, ['meeting.present', {'display':a:display, 'fallback':get(call(a:owner.ports.Options, []).meeting, 'fallback', 'editor')}])
endfunction
function! wbx#meeting_action#detach(owner) abort
  let a:owner.detached = 1
  call call(a:owner.ports.Detach, [])
endfunction
function! wbx#meeting_action#view(owner, detached) abort
  let a:owner.detached = a:detached
endfunction
function! wbx#meeting_action#control(owner, action) abort
  call call(a:owner.ports.Request, ['meeting.control', {'action':a:action}])
endfunction
function! wbx#meeting_action#upcoming(owner) abort
  if !call(a:owner.ports.Ready, []) || call(a:owner.ports.Disconnected, []) || index(call(a:owner.ports.Capabilities, []), 'upcoming-meetings') < 0
    call call(a:owner.ports.Notify, ['Upcoming discovery needs a connected, updated backend. No connection or lookup was started.'])
    return
  endif
  call call(a:owner.ports.Request, ['meetings.upcoming', {}])
endfunction
function! wbx#meeting_action#join_upcoming(owner, selected) abort
  if !a:selected.joinable || call(a:owner.ports.Disconnected, []) || index(call(a:owner.ports.Capabilities, []), 'upcoming-meetings') < 0
    call call(a:owner.ports.Notify, ['Meeting is not freshly joinable. Use :WebexUpcoming to refresh; nothing was joined.'])
    return
  endif
  call call(a:owner.ports.CancelSelection, [])
  let a:owner.detached = 0
  let options = call(a:owner.ports.Options, []).meeting
  call call(a:owner.ports.Request, ['meeting.joinUpcoming', {'meetingId':a:selected.id, 'revision':a:selected.revision,
        \ 'display':get(options, 'display', 'auto'), 'fallback':get(options, 'fallback', 'editor')}])
endfunction
function! wbx#meeting_action#reconnect(owner) abort
  let meeting = a:owner.meeting
  if !get(meeting, 'active', 0) || type(get(meeting, 'session', 0)) != v:t_string
        \ || !wbx#meeting_action#supports(a:owner, 'meeting-tmux', 1)
    call call(a:owner.ports.Notify, ['Original meeting owner unavailable. Nothing joined or replayed.']) | return
  endif
  call call(a:owner.ports.Request, ['meeting.reconnect', {'session':meeting.session}])
endfunction
function! wbx#meeting_action#auth(owner) abort
  if !wbx#meeting_action#supports(a:owner, 'meeting-tmux', 0)
    call call(a:owner.ports.Notify, ['Meeting auth controls unavailable; no reconnect/rejoin was attempted.']) | return
  endif
  call wbx#meeting_action#control(a:owner, 'auth.refresh')
endfunction
function! s:valid(owner, origin, meeting) abort
  let current = a:owner.meeting
  return wbx#view#picker_valid(a:origin) && wbx#meeting_action#supports(a:owner, 'meeting-panes-v1', 0)
        \ && get(current, 'session', '') ==# get(a:meeting, 'session', '') && get(current, 'panes', {}) ==# get(a:meeting, 'panes', {})
endfunction
function! wbx#meeting_action#pane(owner, origin, epoch, meeting, intents, choice) abort
  if a:choice < 1 || a:choice > len(a:intents) || a:owner.pending || a:epoch != a:owner.epoch || !s:valid(a:owner, a:origin, a:meeting) | return | endif
  let intent = copy(a:intents[a:choice - 1])
  if has_key(intent, 'available')
    if !remove(intent, 'available') | call call(a:owner.ports.Notify, ['Source slot unavailable; nothing requested.']) | return | endif
  endif
  let intent.revision = a:meeting.panes.revision
  let a:owner.serial += 1 | let a:owner.pending = a:owner.serial
  let serial = a:owner.serial
  if call(a:owner.ports.Request, ['meeting.pane', {'session':a:meeting.session, 'intent':intent}, function('s:result', [a:owner, serial, a:meeting, intent])]) < 0
    if a:owner.pending == serial | let a:owner.pending = 0 | endif
  endif
endfunction
function! s:result(owner, serial, meeting, intent, response) abort
  if a:owner.pending != a:serial | return | endif
  let a:owner.pending = 0
  if has_key(a:response, 'error')
    call call(a:owner.ports.Notify, ['Pane result unavailable/unconfirmed. Inspect the original tmux owner; nothing will replay.']) | return
  endif
  let value = get(a:response, 'result', {})
  if type(value) != v:t_dict || get(value, 'session', '') !=# a:meeting.session
        \ || type(get(value, 'revision', v:null)) != v:t_number || value.revision != a:intent.revision || get(value, 'action', '') !=# a:intent.action
        \ || index(['applied', 'refused', 'unknown'], get(value, 'status', '')) < 0
        \ || !empty(filter(keys(value), 'index(["session", "revision", "action", "status"], v:val) < 0'))
    call call(a:owner.ports.ProtocolError, []) | return
  endif
  call call(a:owner.ports.Notify, ['Pane operation ' . value.status . ' by original owner. '
        \ . (value.status ==# 'applied' ? 'Presentation only; transmission unchanged.' : 'Inspect it before another explicit attempt; no replay.')])
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
