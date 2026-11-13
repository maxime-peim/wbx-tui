let s:save_cpo = &cpoptions
set cpoptions&vim
let s:root = fnamemodify(expand('<sfile>:p'), ':h:h')
let s:state = {'revision': -1, 'state': 'idle', 'mode': 'demo', 'rooms': [], 'messages': [], 'room': v:null}
let s:context_epoch = 0
let s:room_counts = {'unread_stale': 0, 'cached': 0}
let s:last_error = ''
let s:closing = 0

function! s:options() abort
  return wbx#options#normalized()
endfunction
function! s:notify(message) abort
  let s:last_error = strcharpart(substitute(a:message, '[\x00-\x1f\x7f]', ' ', 'g'), 0, 300)
  echohl WbxWarning
  echomsg '[wbx-tui] ' . s:last_error
  echohl None
endfunction
function! s:event(name, data) abort
  let g:wbx_tui_event = a:data
  if exists('#User#' . a:name)
    execute 'doautocmd <nomodeline> User ' . a:name
  endif
endfunction
function! s:connection_backend() abort
  return s:options().backend
endfunction
function! s:connection_prepare() abort
  call wbx#render_request#cancel(s:render_request)
  let s:closing = 0
  let s:state.ready = v:false
  let s:state.rooms = []
  let s:room_counts = {'unread_stale': 0, 'cached': 0}
  let s:state.room = v:null
  let s:state.messages = []
  let s:state.revision = -1
  call wbx#image_request#reset(s:image_request)
  call wbx#attachment_open#prepare(s:attachment_open)
  call wbx#unread#reset()
  call wbx#notifications#stop()
  call wbx#paging#reset()
endfunction
function! s:hello(message) abort
  " Compatibility facade; transport negotiation has one connection owner.
  call wbx#connection#hello(s:connection,a:message)
endfunction
function! s:connection_accept(result) abort
  call wbx#meeting_action#observe(s:meeting_action, a:result.meeting)
  call s:apply(a:result.state)
  if s:owned_buffer(wbx#workspace#id(s:workspace,'meeting'), 'meeting')
    call s:render_meeting()
  endif
endfunction
let s:connection = wbx#connection#new(s:root,{'Backend':function('s:connection_backend'),
      \ 'Prepare':function('s:connection_prepare'), 'Started':function('wbx#notifications#start'),
      \ 'Accept':function('s:connection_accept'), 'Notify':function('s:notify'),
      \ 'Running':function('wbx#transport#running'), 'Start':function('wbx#transport#start'),
      \ 'Stop':function('wbx#transport#stop'), 'Write':function('wbx#transport#write')})
function! wbx#rpc(method, params, ...) abort
  return call('wbx#connection#request',[s:connection,a:method,a:params] + a:000)
endfunction
function! wbx#_receive(message) abort
  if !wbx#protocol#valid(a:message)
    call wbx#_protocol_error()
    return
  endif
  if has_key(a:message, 'id')
    call wbx#connection#response(s:connection,a:message)
    return
  endif
  let method = get(a:message, 'method', '')
  let params = get(a:message, 'params', {})
  if method ==# 'state'
    call s:apply(params)
  elseif method ==# 'messages.reactionProgress'
    call wbx#reaction_history#progress(params)
  elseif method ==# 'messages.readersChanged'
    call wbx#read_by#changed(params)
  elseif method ==# 'delivery'
    call wbx#delivery_ingress#receive(s:delivery_ingress, params)
  elseif method ==# 'upload.progress'
    call wbx#uploads#progress(params)
  elseif method ==# 'uploads.invalidated'
    call wbx#uploads#invalidate()
  elseif method ==# 'direct.delivery'
    call wbx#conversations#delivery(params)
  elseif method ==# 'room.revoked'
    let s:context_epoch += 1
    if has_key(s:state,'cachedReactions')
      call filter(s:state.cachedReactions,'v:val.roomId !=# params.roomId')
    endif
    if exists('*wbx#reaction_history#invalidate') | call wbx#reaction_history#invalidate() | endif
    if exists('*wbx#reactions#check') | call wbx#reactions#check() | endif
    call wbx#uploads#revoke_room(params.roomId)
    call wbx#drafts#revoke_room(params.roomId)
    call wbx#notifications#revoke_room(params.roomId)
  elseif method ==# 'meeting'
    call wbx#meeting_action#receive(s:meeting_action, params)
  elseif method ==# 'meeting.event'
    call wbx#meeting_action#media(s:meeting_action, params)
  elseif method ==# 'notice'
    call s:notify(get(params, 'message', 'Webex notice.'))
  endif
endfunction
function! wbx#_protocol_error() abort
  call wbx#connection#invalid(s:connection)
endfunction

function! wbx#_exit(code) abort
  call wbx#render_request#cancel(s:render_request)
  call wbx#meeting_action#lost(s:meeting_action)
  call wbx#unread#reset()
  call wbx#notifications#stop()
  call wbx#uploads#invalidate()
  call wbx#conversations#invalidate()
  call wbx#image_external#stop()
  call wbx#attachment_open#lost(s:attachment_open)
  call wbx#paging#reset()
  call wbx#image_request#reset(s:image_request)
  call wbx#selection#cancel(s:selection)
  call wbx#history_activation#lost(s:activation)
  call wbx#connection#lost(s:connection)
  call wbx#meeting_action#unready(s:meeting_action)
  let s:state.state = 'idle'
  let s:state.ready = v:false
  let s:state.loading = v:false
  let s:state.loadingRooms = v:false
  let s:state.sending = v:false
  if wbx#drafts#disconnect()
    call s:notify('Backend disconnected with pending delivery. Drafts retained; check Webex before retrying.')
  elseif !s:closing && a:code != 0
    call s:notify('Backend exited. Use :WebexHealth; provider output was not copied into editor history.')
  endif
  call s:render()
  if s:owned_buffer(wbx#workspace#id(s:workspace,'meeting'), 'meeting')
    call s:render_meeting()
  endif
  call s:event('WbxDisconnected', {'meeting_active': get(wbx#meeting_state(), 'active', 0)})
endfunction

function! s:compose_name(room, parent) abort
  return wbx#view#compose_name(a:room, a:parent)
endfunction
function! s:owned_buffer(buffer, kind) abort
  return wbx#view#owned(a:buffer, a:kind)
endfunction
function! s:edited_view(buffer) abort
  return wbx#view#edited(a:buffer)
endfunction
function! s:buffer(name, kind, ...) abort
  return call('wbx#workspace#buffer',[a:name,a:kind] + a:000)
endfunction
function! wbx#_rename_pre() abort
  call wbx#workspace#rename_pre(s:workspace)
endfunction
function! wbx#_rename_post() abort
  call wbx#workspace#rename_post(s:workspace)
endfunction
function! s:write(buffer, lines, ...) abort
  return call('wbx#view#write', [a:buffer, a:lines, function('s:notify')] + a:000)
endfunction
function! s:compose_buffer(room) abort
  return wbx#drafts#compose(a:room, get(s:state, 'messages', []), function('s:buffer'))
endfunction
function! s:local_setup() abort
  call wbx#buffer_setup#apply(s:buffer_setup_effects)
endfunction
function! wbx#_window_leave() abort
  call wbx#workspace#window_leave()
endfunction
function! wbx#_window_enter() abort
  call wbx#workspace#window_enter(s:workspace)
endfunction
function! s:workspace_geometry() abort
  let options = s:options()
  return {'rooms':options.rooms_width, 'compose':options.compose_height}
endfunction
function! s:workspace_statusline() abort
  return s:options().statusline
endfunction
function! s:workspace_draft(blank) abort
  let room = !a:blank && type(get(s:state,'room',v:null)) == v:t_dict ? s:state.room : {'id':'_none','title':'Select a space'}
  return s:compose_buffer(room)
endfunction
function! s:layout() abort
  call wbx#commands#setup()
  call wbx#workspace#open(s:workspace)
endfunction
function! wbx#layout_reset() abort
  call wbx#workspace#reset_geometry(s:workspace)
endfunction
function! wbx#open(...) abort
  call wbx#notifications#start()
  call s:layout()
  let options = s:options()
  let mode = (a:0 ? a:1 : options.demo) ? 'demo' : 'live'
  let params = {'mode': mode}
  let notifications = wbx#notifications#status()
  if notifications.enabled && notifications.messages && notifications.preview && notifications.sender_names && !notifications.invalid
    let params.senderNames = v:true
  endif
  if options.read_status
    let params.readStatus = v:true
    let notifications = wbx#notifications#status()
    if notifications.enabled && notifications.messages && notifications.preview && !notifications.invalid
      let params.notificationPreview = v:true
    endif
  endif
  if options.people_status
    let params.peopleStatus = v:true
  endif
  if options.upcoming_meetings
    let params.upcomingMeetings = v:true
  endif
  if options.spaces_cache | let params.spacesCache = v:true | endif
  if !empty(options.config)
    let params.config = expand(options.config)
  endif
  call wbx#rpc('session.start', params)
endfunction
function! s:apply(state) abort
  if get(a:state, 'revision', -1) <= get(s:state, 'revision', -1)
    return
  endif
  if get(a:state, 'state', '') !=# get(s:state, 'state', '')
        \ || get(get(a:state, 'localContext', {}), 'sessionId', '') !=# get(get(s:state, 'localContext', {}), 'sessionId', '')
    " Only transport replacement discards handshake assertions. Per-session
    " authority still belongs to supports()/recovery and the independent meeting.
    call wbx#render_request#cancel(s:render_request)
    call wbx#attachment_open#stop(s:attachment_open)
    call wbx#image_request#reset(s:image_request)
    call wbx#connection#session(s:connection)
  endif
  call wbx#delivery_ingress#observe(s:state, a:state)
  if index(['idle', 'failed'], get(a:state, 'state', '')) >= 0 && get(a:state, 'state', '') !=# get(s:state, 'state', '')
    call wbx#uploads#invalidate()
    call wbx#conversations#invalidate()
    if exists('*wbx#message_actions#invalidate') | call wbx#message_actions#invalidate() | endif
    if exists('*wbx#reactions#invalidate') | call wbx#reactions#invalidate() | endif
  endif
  let before_room = get(s:state, 'room', v:null)
  let after_room = get(a:state, 'room', v:null)
  if [get(s:state, 'state', ''), type(before_room) == v:t_dict ? before_room.id : '', get(s:state, 'ready', 0)]
        \ !=# [get(a:state, 'state', ''), type(after_room) == v:t_dict ? after_room.id : '', get(a:state, 'ready', 0)]
    let s:context_epoch += 1
  endif
  let s:state = a:state
  call wbx#draft_persistence#sync(s:state)
  if exists('*wbx#productivity#observe') | call wbx#productivity#observe(s:state) | endif
  call wbx#unread#observe(s:state)
  call wbx#paging#sync(s:state)
  let room = get(s:state, 'room', v:null)
  let messages = get(s:state, 'messages', [])
  call wbx#image_request#observe(s:image_request, room)
  call wbx#history_activation#observe(s:activation, s:state)
  " Scalar display/health counts only; raw per-room flags still decide receipts.
  " Reuse the existing accepted-state loop, never scan rooms during status redraw.
  let s:room_counts = {'unread_stale': 0, 'cached': 0}
  for room in get(s:state, 'rooms', [])
    let s:room_counts.unread_stale += !!get(room, 'unreadStale', 0)
    let s:room_counts.cached += !!get(room, 'cached', 0)
  endfor
  call s:render()
  call wbx#notifications#observe(s:state)
  call s:event('WbxState', deepcopy(s:state))
endfunction
function! s:delivery_uncertain(room) abort
  let selected = get(s:state, 'room', v:null)
  return !empty(a:room) && (wbx#drafts#uncertain(a:room)
        \ || type(selected) == v:t_dict && selected.id ==# a:room && get(s:state, 'uncertain', 0))
endfunction
function! s:delivery_pending(room) abort
  return wbx#drafts#pending(a:room)
endfunction
function! s:connection_hint() abort
  if wbx#connection#disconnected(s:connection)
    return '[Disconnected · drafts retained]'
  elseif get(s:state, 'state', 'idle') ==# 'idle'
    return '[Not connected]'
  elseif s:state.state ==# 'connecting'
    return get(s:state, 'auth', '') ==# 'authorizing'
          \ ? '[Complete sign-in in your browser]' : '[Connecting…]'
  elseif s:state.state ==# 'failed'
    return '[Connection failed]'
  endif
  return ''
endfunction
function! s:render_compose(room) abort
  try
    return s:compose_buffer(a:room)
  catch /^Webex buffer name is occupied by other work/
    if s:last_error !=# v:exception
      call s:notify(v:exception)
    endif
    return 0
  endtry
endfunction
function! s:render() abort
  call wbx#render_request#render(s:render_request)
endfunction
function! s:render_context() abort
  return [get(get(s:state, 'localContext', {}), 'sessionId', ''), get(s:state, 'state', ''),
        \ wbx#connection#disconnected(s:connection)]
endfunction
function! s:render_now() abort
  if !wbx#render#apply(s:renderer, s:state, wbx#workspace#buffers(s:workspace),
        \ {'disconnected':wbx#connection#disconnected(s:connection), 'hint':s:connection_hint()})
    return
  endif
  " People details are ordinary selected-conversation UI, not command-only discovery.
  call wbx#people#sync(s:state)
  call wbx#read_by#opened(wbx#workspace#id(s:workspace,'history'))
  call wbx#reaction_history#schedule()
endfunction
function! wbx#_images_visible() abort
  call wbx#image_request#visible(s:image_request)
endfunction
function! s:message_at_cursor() abort
  if !s:owned_buffer(bufnr('%'), 'history') || s:edited_view(bufnr('%'))
        \ || wbx#connection#disconnected(s:connection) || !wbx#connection#ready(s:connection) || !get(s:state, 'ready', 0)
        \ || get(b:, 'wbx_history_room', '') !=# get(get(s:state, 'room', {}), 'id', '') | return {} | endif
  for block in get(b:, 'wbx_message_blocks', [])
    if line('.') >= block.start && line('.') <= block.end
      for message in s:state.messages
        if message.id ==# block.id | return message | endif
      endfor
    endif
  endfor
  return {}
endfunction
function! wbx#image_open(mode, index) abort
  call wbx#image_request#open(s:image_request, a:mode, a:index)
endfunction
function! wbx#attachment_context(context) abort
  return wbx#attachment_open#context(s:attachment_open, a:context)
endfunction
function! wbx#attachment_valid(context) abort
  return wbx#attachment_open#valid(s:attachment_open, a:context)
endfunction
function! wbx#attachment_handoff(context) abort
  call wbx#attachment_open#handoff(s:attachment_open, a:context)
endfunction
function! wbx#_attachment_check(leaving) abort
  call wbx#attachment_open#check(s:attachment_open, a:leaving)
endfunction
function! wbx#_attachment_stream_ready(context, params) abort
  call wbx#attachment_open#stream_ready(s:attachment_open, a:context, a:params)
endfunction
function! wbx#_attachment_stream_failed(context, text) abort
  call wbx#attachment_open#stream_failed(s:attachment_open, a:context, a:text)
endfunction
function! wbx#_attachment_stream_result(context, value, key) abort
  call wbx#attachment_open#stream_result(s:attachment_open, a:context, a:value, a:key)
endfunction
function! wbx#attachment_image(context) abort
  call wbx#attachment_open#image(s:attachment_open, a:context)
endfunction
function! wbx#attachment_open(action, index) abort
  call wbx#attachment_open#open(s:attachment_open, a:action, a:index)
endfunction
function! s:attachment_state() abort
  return s:state
endfunction
function! s:attachment_can_cancel() abort
  return wbx#connection#ready(s:connection) && !wbx#connection#disconnected(s:connection) && wbx#transport#running()
endfunction
function! s:attachment_image_busy() abort
  return wbx#image_request#busy(s:image_request)
endfunction
function! s:attachment_set_image_busy(value, ...) abort
  return call('wbx#image_request#set_busy', [s:image_request, a:value] + a:000)
endfunction
function! wbx#_setup_buffer() abort
  call s:local_setup()
  if get(b:,'wbx_kind','') ==# 'history' | call wbx#reaction_history#schedule() | endif
endfunction
function! wbx#_draft_setup() abort
  call wbx#buffer_setup#draft()
endfunction
function! wbx#select_current() abort
  if !s:owned_buffer(bufnr('%'), 'rooms') || s:edited_view(bufnr('%'))
    call s:notify('Select from an unchanged Webex spaces view, or use :WebexPickSpace.')
    return
  endif
  if wbx#sections#enter() | return | endif
  let selected = get(get(b:, 'wbx_meeting_rows', {}), line('.'), {})
  if !empty(selected)
    call wbx#meeting_action#join_upcoming(s:meeting_action, selected)
    return
  endif
  let ids = get(b:, 'wbx_room_ids', [])
  let id = get(ids, line('.') - 1, '')
  if !empty(id) && !empty(filter(copy(get(s:state, 'rooms', [])), 'v:val.id ==# id'))
    call wbx#select(id, 1)
  endif
endfunction
function! wbx#supports(capability) abort
  return wbx#connection#ready(s:connection) && !wbx#connection#disconnected(s:connection) && get(s:state, 'state', '') ==# 'ready'
        \ && wbx#transport#running() && index(wbx#connection#feature(s:connection,'capabilities'), a:capability) >= 0
endfunction
function! wbx#supports_reactions() abort
  return !wbx#connection#disconnected(s:connection) && wbx#connection#ready(s:connection) && index(wbx#connection#feature(s:connection,'messageReactions'), 'pinned-internal-v1') >= 0
endfunction
function! wbx#supports_upload(format) abort
  return a:format ==# 'markdown-single-file-v1' && index(wbx#connection#feature(s:connection,'uploadFormats'), a:format) >= 0
        \ && wbx#supports('uploads-v1') && wbx#supports('markdown-send-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_direct(format) abort
  return index(['markdown-v1', 'single-file-v1', 'markdown-single-file-v1'], a:format) >= 0
        \ && index(wbx#connection#feature(s:connection,'directFormats'), a:format) >= 0 && wbx#supports('conversations-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_space(action) abort
  return a:action ==# 'rename-v1' && index(wbx#connection#feature(s:connection,'spaceActions'), a:action) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('room-members-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_description(format) abort
  return a:format ==# 'replace-v1' && index(wbx#connection#feature(s:connection,'spaceDescriptions'), a:format) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('room-members-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_lock(format) abort
  return a:format ==# 'lock-unlock-v1' && index(wbx#connection#feature(s:connection,'spaceLocks'), a:format) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('room-members-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_announcement(format) abort
  return a:format ==# 'enable-disable-v1' && index(wbx#connection#feature(s:connection,'spaceAnnouncements'), a:format) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('room-members-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_description_clear(format) abort
  return a:format ==# 'single-space-v1' && index(wbx#connection#feature(s:connection,'spaceDescriptionClears'), a:format) >= 0
        \ && wbx#supports_description('replace-v1')
endfunction
function! wbx#supports_member_visibility(format) abort
  return a:format ==# 'own-direct-v1' && index(wbx#connection#feature(s:connection,'membershipVisibility'), a:format) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('room-members-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_team(action) abort
  return a:action ==# 'rename-v1' && index(wbx#connection#feature(s:connection,'teamActions'), a:action) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('joined-teams-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_team_description(format) abort
  return a:format ==# 'replace-v1' && index(wbx#connection#feature(s:connection,'teamDescriptions'), a:format) >= 0
        \ && wbx#supports('conversations-v1') && wbx#supports('joined-teams-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_people_spaces() abort
  return wbx#connection#feature(s:connection,'peopleSpaces') ==# ['visible-v1'] && wbx#supports('people-status')
        \ && wbx#supports('local-context-v1') && wbx#protocol#local_context(get(s:state, 'localContext', {}))
endfunction
function! wbx#supports_local_drafts() abort
  return wbx#connection#feature(s:connection,'localDrafts') ==# ['disk-v1'] && wbx#supports('local-context-v1')
endfunction
function! wbx#supports_people_viewport() abort
  return wbx#connection#feature(s:connection,'peopleViewport') ==# ['paged-v1'] && wbx#supports_people_spaces()
endfunction
function! wbx#redraw() abort
  call s:render()
endfunction
function! wbx#redraw_status() abort
  if wbx#render#drafts_changed(s:renderer) | call s:render() | return | endif
  call wbx#render#status(s:renderer)
endfunction
function! wbx#_cancel_selection_focus() abort
  call wbx#selection#leaving(s:selection)
endfunction
function! s:selection_open(request) abort
  call wbx#history_activation#open(s:activation, a:request)
endfunction
function! s:activation_state() abort
  return s:state
endfunction
function! wbx#select(id, ...) abort
  return wbx#selection#select(s:selection, a:id, {'focus': a:0 >= 1 && a:1, 'allow_read': a:0 < 2 || a:2, 'reload': a:0 >= 3 && a:3})
endfunction
function! s:selection_context() abort
  let room = get(s:state, 'room', v:null)
  return {'selected':type(room) == v:t_dict ? room.id : v:null, 'rooms':get(s:state, 'rooms', []),
        \ 'session':get(get(s:state, 'localContext', {}), 'sessionId', ''),
        \ 'ready':get(s:state, 'ready', 0), 'loading':get(s:state, 'loading', 0),
        \ 'disconnected':wbx#connection#disconnected(s:connection),
        \ 'reload':index(wbx#connection#feature(s:connection,'capabilities'), 'same-space-resume') >= 0}
endfunction
function! s:selection_attachments(changed) abort
  call wbx#attachment_open#selected(s:attachment_open, a:changed)
endfunction
function! s:selection_request(params, ...) abort
  return call('wbx#rpc', ['rooms.select', a:params] + a:000)
endfunction
function! wbx#room_unread_context() abort
  " Detached local presentation selector only. Never open/select/verify a space.
  if bufnr('%') != wbx#workspace#id(s:workspace,'rooms') || !s:owned_buffer(wbx#workspace#id(s:workspace,'rooms'),'rooms') || s:edited_view(wbx#workspace#id(s:workspace,'rooms')) | return {} | endif
  let ids = get(b:,'wbx_room_ids',[])
  let rows = get(b:,'wbx_row_ids',[])
  if type(ids) != v:t_list || type(rows) != v:t_list | return {} | endif
  let id = get(ids,line('.')-1,'')
  if type(id) != v:t_string || empty(id) || get(rows,line('.')-1,'') !=# json_encode(['room',id]) | return {} | endif
  for room in get(s:state,'rooms',[])
    if room.id !=# id | continue | endif
    let projected = {'id':id,'title':room.title,'cached':!!get(room,'cached',0),'unreadStale':!!get(room,'unreadStale',0)}
    if type(get(room,'unread',v:null)) == v:t_bool | let projected.unread = room.unread | endif
    return {'room':projected,'readStatus':get(s:state,'readStatus','off'),'mode':get(s:state,'mode','demo'),
          \ 'revision':get(s:state,'revision',0),'connected':!wbx#connection#disconnected(s:connection) && wbx#connection#ready(s:connection)
          \   && get(s:state,'state','') ==# 'ready' && wbx#transport#running()}
  endfor
  return {}
endfunction
function! wbx#rooms() abort
  try
    if !s:owned_buffer(wbx#workspace#id(s:workspace,'rooms'), 'rooms')
      call wbx#workspace#ensure(s:workspace,'rooms')
      call s:render()
    endif
    call wbx#workspace#show(wbx#workspace#id(s:workspace,'rooms'))
    call s:local_setup()
    " Explicit return restores the open conversation, never passive updates or
    " edited/promoted views. The cursor remains independent while browsing.
    if bufnr('%') == wbx#workspace#id(s:workspace,'rooms') && s:owned_buffer(wbx#workspace#id(s:workspace,'rooms'), 'rooms') && !s:edited_view(wbx#workspace#id(s:workspace,'rooms'))
      let room = get(s:state, 'room', v:null)
      if type(room) == v:t_dict
        let row = index(get(b:, 'wbx_room_ids', []), room.id) + 1
        if row > 0
          call cursor(row, 1)
        endif
      endif
    endif
    call wbx#paging#baseline()
  catch /^Webex buffer name is occupied by other work/
    call s:notify(v:exception)
  endtry
endfunction
function! wbx#compose(...) abort
  let room = get(s:state, 'room', v:null)
  if type(room) != v:t_dict
    call s:notify('Open a space first.')
    return
  endif
  let buffer = s:compose_buffer(room)
  if empty(win_findbuf(buffer))
    let composer = wbx#workspace#composer_window()
    if composer > 0
      " A new thread is a new draft, not another composer split. Reuse only
      " an owned composer, retaining its old buffer/undo and unrelated work.
      call win_execute(composer, 'buffer ' . buffer . ' | call wbx#_setup_buffer()')
    endif
  endif
  call wbx#workspace#show(buffer)
  call s:local_setup()
  if bufnr('%') != buffer || !s:owned_buffer(buffer, 'compose')
    return
  endif
  call wbx#history#draft_enter()
  if a:0 && a:1
    startinsert
  endif
endfunction
function! wbx#local_action_reason(action) abort
  " Local observation only; shared by discovery and authoritative command guards.
  if a:action ==# 'mark-read' && get(s:state, 'readStatus', 'off') !=# 'ready'
    let status = get(s:state, 'readStatus', 'off')
    return status ==# 'off' ? 'Read status is off; receipts disabled.'
          \ : status ==# 'connecting' ? 'Read status is initializing; no receipt was sent.'
          \ : 'Read status failed/unavailable; inspect health before explicitly retrying.'
  endif
  let room = get(s:state, 'room', v:null)
  if wbx#connection#disconnected(s:connection) || get(s:state, 'state', '') !=# 'ready' || !get(s:state, 'ready', 0) || type(room) != v:t_dict
    return 'Choose a ready selected conversation; no request was made.'
  endif
  if a:action ==# 'cancel-reply'
    return s:owned_buffer(bufnr('%'), 'history') && get(b:, 'wbx_history_room', '') ==# room.id
          \ || s:owned_buffer(bufnr('%'), 'compose') && get(b:, 'wbx_room', '') ==# room.id
          \ ? '' : 'Cancel reply only from the selected space history or its draft.'
  endif
  if !s:owned_buffer(bufnr('%'), 'history') || s:edited_view(bufnr('%')) || get(b:, 'wbx_history_room', '') !=# room.id
    return 'Choose the selected, unchanged Webex history.'
  endif
  if a:action ==# 'mark-read'
    if empty(get(s:state, 'messages', [])) | return 'Mark read needs a complete, loaded Webex history.' | endif
    if !get(b:, 'wbx_history_complete', 1)
      return 'History display was clipped. Acknowledge only after viewing the complete messages in Webex.'
    endif
    if !wbx#history_activation#newest(s:activation)
      return 'Display the complete newest endpoint (:WebexLatest; unfold its thread/body), then explicitly mark read.'
    endif
  endif
  return ''
endfunction
function! wbx#latest() abort
  let reason = wbx#local_action_reason('latest')
  if !empty(reason) | call s:notify(reason) | return | endif
  let room = s:state.room
  if !get(s:state, 'historyLatest', 1)
    " Refetching is an explicit navigation action, not receipt consent.
    return wbx#select(room.id, 1, 0, 1)
  endif
  let messages = get(s:state, 'messages', [])
  if !empty(messages)
    call wbx#view#latest(messages[-1].id)
    call wbx#paging#baseline()
  endif
endfunction
function! wbx#upcoming() abort
  call wbx#meeting_action#upcoming(s:meeting_action)
endfunction
function! wbx#cache_clear() abort
  if index(wbx#connection#feature(s:connection,'capabilities'), 'spaces-cache') < 0
    call s:notify('No cache-capable backend is connected.')
    return
  endif
  call wbx#rpc('spaces.cacheClear', {})
endfunction
function! wbx#reply() abort
  if index(['remote-thread', 'mentions', 'query-message'], get(b:, 'wbx_list_kind', '')) >= 0
    " Queried results retain their own expiry/selection/edit guards. Never
    " reinterpret a stale query as authority from the loaded main history.
    return wbx#queries#reply()
  endif
  let room = get(s:state, 'room', v:null)
  if !s:owned_buffer(bufnr('%'), 'history') || s:edited_view(bufnr('%')) || type(room) != v:t_dict
        \ || get(b:, 'wbx_history_room', '') !=# room.id || wbx#connection#disconnected(s:connection) || !get(s:state, 'ready', 0)
    call s:notify('Reply only from an unchanged, loaded Webex history.')
    return
  endif
  if index(wbx#connection#feature(s:connection,'capabilities'), 'message-replies') < 0
    call s:notify('This backend does not support replies. Build/update it and reconnect explicitly; no unthreaded message was sent.')
    return
  endif
  let selected = filter(copy(get(b:, 'wbx_message_blocks', [])), 'v:val.start <= line(".") && line(".") <= v:val.end')
  let message = empty(selected) ? [] : filter(copy(get(s:state, 'messages', [])), 'v:val.id ==# selected[0].id')
  if empty(message)
    call s:notify('Place the cursor inside the message you want to answer.')
    return
  endif
  " Webex threads have one root. Replying to an answer targets that same root,
  " never invents a nested parent or infers threading from quoted Markdown.
  call wbx#drafts#reply(room.id, get(message[0], 'parentId', message[0].id))
  call wbx#compose(1)
endfunction
function! wbx#cancel_reply() abort
  let reason = wbx#local_action_reason('cancel-reply')
  if !empty(reason) | call s:notify(reason) | return | endif
  let room = s:state.room
  call wbx#drafts#reply(room.id, '')
  " The reply buffer (including edits, undo and pending delivery) is retained.
  call wbx#compose()
endfunction
function! wbx#mark_read() abort
  let reason = wbx#local_action_reason('mark-read')
  if !empty(reason) | call s:notify(reason) | return | endif
  let room = s:state.room
  let endpoint = s:state.messages[-1].id
  call wbx#unread#open(s:state)
  call s:render()
  call wbx#history_activation#read(s:activation, room.id, endpoint, 0)
endfunction
function! s:paged(token, message) abort
  if wbx#paging#finish(a:token, a:message, s:state)
    call s:render()
  endif
endfunction
function! wbx#page(kind, ...) abort
  let automatic = a:0 && a:1
  if index(['rooms', 'history'], a:kind) < 0 || wbx#connection#disconnected(s:connection) || !wbx#connection#ready(s:connection) || get(s:state, 'state', '') !=# 'ready'
    return
  endif
  if a:kind ==# 'history' && (!get(s:state, 'ready', 0) || get(s:state, 'loading', 0))
    return
  endif
  let token = wbx#paging#begin(a:kind, s:state, automatic)
  if empty(token) | return | endif
  let method = a:kind ==# 'rooms' ? 'rooms.list' : 'messages.list'
  let params = a:kind ==# 'rooms' ? {'more': v:true} : {'older': v:true}
  if wbx#rpc(method, params, function('s:paged', [token])) < 0
    call wbx#paging#finish(token, {'error': {}}, s:state)
  endif
  call s:render()
endfunction
function! wbx#_navigation() abort
  let kind = get(b:, 'wbx_kind', '')
  if kind ==# 'history' | call wbx#reaction_history#schedule() | endif
  if kind ==# 'compose' && s:owned_buffer(bufnr('%'), kind)
    call wbx#_draft_setup()
    return
  endif
  if index(['rooms', 'history'], kind) < 0 || !s:owned_buffer(bufnr('%'), kind) || s:edited_view(bufnr('%'))
    return
  endif
  if wbx#paging#navigation(kind, wbx#connection#ready(s:connection) && !wbx#connection#disconnected(s:connection))
    call wbx#page(kind, 1)
  endif
endfunction
function! wbx#_scrolled(window) abort
  let windows = get(v:event, 'windows', [])
  if empty(windows)
    let windows = [str2nr(a:window)]
  endif
  for window in windows
    let info = getwininfo(window)
    if !empty(info) && index(['rooms', 'history'], getbufvar(info[0].bufnr, 'wbx_kind', '')) >= 0
      call win_execute(window, 'call wbx#_navigation()')
    endif
  endfor
endfunction
function! wbx#send() abort
  call wbx#send_action#send(s:send_action)
endfunction
function! s:send_state() abort
  return s:state
endfunction
function! s:delivery_clear_state() abort
  return s:state
endfunction
function! wbx#resolve_delivery() abort
  call wbx#delivery_recovery#resolve(s:delivery_recovery)
endfunction
function! s:delivery_recovery_state() abort
  return s:state
endfunction
function! wbx#refresh(...) abort
  let kind = get(b:, 'wbx_kind', '')
  if a:0 && a:1 && kind !=# 'compose' && s:owned_buffer(bufnr('%'), kind)
    setlocal nomodified
    let b:wbx_render_tick = b:changedtick
    if kind ==# 'meeting'
      call s:render_meeting()
    else
      call s:render()
    endif
  endif
  if kind ==# 'meeting' && s:owned_buffer(bufnr('%'), kind)
    call s:render_meeting()
    return
  endif
  call wbx#rpc(kind ==# 'rooms' ? 'rooms.list' : 'messages.list', {})
endfunction
function! wbx#picker_context() abort
  return wbx#space_picker#context(s:space_picker)
endfunction
function! wbx#pick_select(context, id) abort
  call wbx#space_picker#select(s:space_picker, a:context, a:id)
endfunction
function! wbx#picker_cancel(context) abort
  call wbx#space_picker#cancel(s:space_picker, a:context)
endfunction
function! wbx#pick() abort
  call wbx#space_picker#open(s:space_picker)
endfunction

function! wbx#meeting(url, ...) abort
  call wbx#meeting_action#start(s:meeting_action, a:url, a:0 && a:1)
endfunction
function! wbx#present(display) abort
  call wbx#meeting_action#present(s:meeting_action, a:display)
endfunction
function! wbx#detach() abort
  call wbx#meeting_action#detach(s:meeting_action)
endfunction
function! wbx#_meeting_view_closed() abort
  call wbx#meeting_action#view(s:meeting_action, 1)
endfunction
function! wbx#_meeting_view_opened() abort
  call wbx#meeting_action#view(s:meeting_action, 0)
endfunction
function! wbx#meeting_status() abort
  if !s:owned_buffer(wbx#workspace#id(s:workspace,'meeting'), 'meeting')
    call wbx#workspace#ensure(s:workspace,'meeting')
  endif
  call s:render_meeting()
  call wbx#workspace#show(wbx#workspace#id(s:workspace,'meeting'))
  call s:local_setup()
endfunction
function! wbx#control(action) abort
  call wbx#meeting_action#control(s:meeting_action, a:action)
endfunction
function! wbx#meeting_supports(capability, ...) abort
  return wbx#meeting_action#supports(s:meeting_action, a:capability, a:0 && a:1)
endfunction
function! wbx#meeting_events() abort
  return wbx#meeting_action#events(s:meeting_action)
endfunction
function! wbx#meeting_epoch() abort
  return wbx#meeting_action#epoch(s:meeting_action)
endfunction
function! wbx#_meeting_pending() abort
  return wbx#meeting_action#pending(s:meeting_action)
endfunction
function! wbx#_meeting_reset() abort
  call wbx#meeting_action#reset(s:meeting_action)
endfunction
function! wbx#_meeting_pane(origin, epoch, meeting, intents, choice) abort
  call wbx#meeting_action#pane(s:meeting_action, a:origin, a:epoch, a:meeting, a:intents, a:choice)
endfunction
function! wbx#_meeting_reconnect() abort
  call wbx#meeting_action#reconnect(s:meeting_action)
endfunction
function! wbx#_meeting_auth() abort
  call wbx#meeting_action#auth(s:meeting_action)
endfunction
function! s:meeting_closing() abort
  return s:closing
endfunction
function! s:render_meeting() abort
  if !s:owned_buffer(wbx#workspace#id(s:workspace,'meeting'), 'meeting')
    try
      call wbx#workspace#ensure(s:workspace,'meeting')
    catch /^Webex buffer name is occupied by other work/
      if s:last_error !=# v:exception
        call s:notify(v:exception)
      endif
      return
    endtry
  endif
  let lines = wbx#meeting_status#lines(wbx#meeting_state(), wbx#meeting_events(), !wbx#connection#disconnected(s:connection))
  call s:write(wbx#workspace#id(s:workspace,'meeting'), lines)
  redrawstatus
endfunction
function! wbx#status() abort
  let read = get(s:state, 'readStatus', 'off')
  let cached = s:room_counts.unread_stale
  let unread = read ==# 'failed' || wbx#connection#disconnected(s:connection) && read !=# 'off' ? ' · unread ' . (cached ? 'cached' : 'unknown')
        \ : read ==# 'connecting' ? ' · unread syncing' : cached ? ' · unread partly cached'
        \ : read ==# 'ready' && !empty(get(s:state, 'readStatusNotice', '')) ? ' · unread degraded' : ''
  let spaces = get(get(s:state, 'spacesCache', {}), 'state', '') ==# 'stale' ? ' · spaces cached/stale' : ''
  let local = wbx#unread#status()
  let local_status = local.read ? ' · locally read ' . local.read : ''
  if local.unread | let local_status .= ' · new activity ' . local.unread | endif
  return 'Webex ' . (wbx#connection#disconnected(s:connection) ? 'disconnected' : get(s:state, 'state', 'idle')) . (get(s:state, 'mode', '') ==# 'demo' ? ' [DEMO]' : '') . spaces . unread . local_status
        \ . wbx#meeting_action#compact(s:meeting_action)
endfunction
function! wbx#destination(...) abort
  let buffer = a:0 && a:1 > 0 ? a:1 : bufnr('%')
  if !s:owned_buffer(buffer, 'compose') || getbufvar(buffer, 'wbx_room', '_none') ==# '_none'
    return {}
  endif
  let id = getbufvar(buffer, 'wbx_room')
  let room = get(s:state, 'room', v:null)
  let selected = type(room) == v:t_dict && room.id ==# id
  let destination = {'id': id, 'title': getbufvar(buffer, 'wbx_title'), 'selected': selected ? v:true : v:false,
        \ 'ready': selected && !wbx#connection#disconnected(s:connection) && get(s:state, 'ready', 0) ? v:true : v:false,
        \ 'uncertain': s:delivery_uncertain(id) ? v:true : v:false, 'pending': s:delivery_pending(id) ? v:true : v:false}
  let parent = getbufvar(buffer, 'wbx_parent', '')
  if !empty(parent)
    let destination.parentId = parent
    let destination.reply = getbufvar(buffer, 'wbx_reply_label', 'parent not loaded')
  endif
  return destination
endfunction
function! wbx#buffer_status(...) abort
  let buffer = a:0 && a:1 > 0 ? a:1 : bufnr('%')
  let status = wbx#status()
  let reaction = exists('*wbx#reactions#status') ? wbx#reactions#status(buffer,a:0 > 1 ? a:2 : win_getid()) : ''
  if !empty(reaction) | let status = '[' . reaction . '] ' . status | endif
  let readers = exists('*wbx#read_by#status') ? wbx#read_by#status(buffer,a:0 > 1 ? a:2 : win_getid()) : ''
  if !empty(readers) | let status = '[' . readers . '] ' . status | endif
  let destination = wbx#destination(buffer)
  if !empty(destination)
    let status .= ' → ' . destination.title
    let status .= ' [' . wbx#drafts#summary(buffer) . ']'
    let file = wbx#uploads#label(buffer)
    if !empty(file) | let status .= ' [' . file . ']' | endif
    if has_key(destination, 'parentId')
      let status .= ' [Replying to ' . destination.reply . ']'
    endif
    if destination.uncertain
      let status .= ' [DELIVERY UNCERTAIN · check Webex before :WebexResolveDelivery]'
    elseif destination.pending
      let status .= ' [SENDING · no retry]'
    elseif !destination.selected
      let status .= ' [NOT SELECTED · select this space before sending]'
    elseif !destination.ready
      let status .= ' [NOT READY]'
    endif
  elseif s:owned_buffer(buffer, getbufvar(buffer, 'wbx_kind', '')) && getbufvar(buffer, 'wbx_kind') !=# 'compose' && s:edited_view(buffer)
    let status .= ' [EDITED VIEW · refresh paused]'
  endif
  return status
endfunction
function! wbx#show_destination() abort
  let destination = wbx#destination()
  if empty(destination)
    call s:notify('No destination-bound Webex draft in this buffer. Use :WebexCompose.')
  else
    echomsg '[wbx-tui] ' . substitute(wbx#buffer_status() . ' · Destination ID: ' . destination.id, '[\x00-\x1f\x7f]', ' ', 'g')
  endif
  return destination
endfunction
function! wbx#statusline() abort
  let windows = getwininfo(get(g:, 'statusline_winid', win_getid()))
  let buffer = empty(windows) ? bufnr('%') : windows[0].bufnr
  return substitute(wbx#buffer_status(buffer,empty(windows) ? win_getid() : windows[0].winid), '%', '%%', 'g')
endfunction
function! wbx#state() abort
  return deepcopy(s:state)
endfunction
function! wbx#reaction_context() abort
  " Constant-size display selector, never a copy of message/image/account state.
  let room = get(s:state,'room',v:null)
  let session = get(get(s:state,'localContext',{}),'sessionId','')
  let enabled = wbx#supports_reactions() && s:options().reactions && get(s:state,'state','') ==# 'ready'
  let available = get(s:state,'mode','') ==# 'demo' || get(s:state,'readStatus','off') ==# 'ready'
        \ || get(get(s:state,'reactionSource',{}),'readable',0)
  let cached = get(s:state,'historyCached',0)
  let degraded = get(s:state,'readStatus','off') ==# 'failed' && get(get(s:state,'reactionSource',{}),'degraded',0)
  return {'sessionId':session,
        \ 'roomId':type(room) == v:t_dict ? room.id : '', 'epoch':s:context_epoch,
        \ 'sourceEpoch':get(get(s:state,'reactionSource',{}),'epoch',0),
        \ 'sourceRevision':get(get(s:state,'reactionSource',{}),'revision',0),
        \ 'degraded':degraded,
        \ 'enabled':enabled && (get(s:state,'ready',0) || cached) && type(room) == v:t_dict,
        \ 'retain':enabled && !empty(session) && has_key(s:state,'reactionSource') && (available || degraded),
          \ 'available':available && !cached,
         \ 'connecting':get(s:state,'readStatus','off') ==# 'connecting',
          \ 'batch':index(wbx#connection#feature(s:connection,'messageReactions'),'viewport-batch-v1') >= 0,
           \ 'self_summary':index(wbx#connection#feature(s:connection,'messageReactions'),'self-summary-v1') >= 0,
           \ 'actor_details':index(wbx#connection#feature(s:connection,'messageReactions'),'actor-details-v1') >= 0,
           \ 'progressive':index(wbx#connection#feature(s:connection,'messageReactions'),'progressive-v1') >= 0,
        \ 'sending':get(s:state,'sending',0)}
endfunction
function! wbx#read_by_context() abort
  " Constant-size selector; no message/history copies or read/receipt operation.
  let room = get(s:state, 'room', v:null)
  let source = get(s:state, 'reactionSource', {})
  let enabled = wbx#options#normalized().read_status && !wbx#connection#disconnected(s:connection)
        \ && wbx#connection#ready(s:connection) && get(s:state, 'state', '') ==# 'ready'
        \ && index(wbx#connection#feature(s:connection, 'messageReaders'), 'watermark-v1') >= 0
  let loaded = get(s:state, 'ready', 0) && !get(s:state, 'historyCached', 0)
  return {'enabled': enabled, 'sessionId': get(get(s:state, 'localContext', {}), 'sessionId', ''),
        \ 'live': index(wbx#connection#feature(s:connection, 'messageReaders'), 'seen-events-v1') >= 0,
        \ 'roomId': type(room) == v:t_dict ? room.id : '',
        \ 'roomType': type(room) == v:t_dict ? get(room,'type','') : '',
        \ 'sourceEpoch': get(source, 'epoch', 0), 'sourceRevision': get(source, 'revision', 0),
        \ 'loaded': loaded, 'available': enabled && loaded
        \ && (get(s:state, 'mode', '') ==# 'demo' || get(s:state, 'readStatus', '') ==# 'ready' || get(source, 'readable', 0))}
endfunction
function! wbx#cached_reactions() abort
  return deepcopy(get(s:state,'cachedReactions',[]))
endfunction
function! wbx#people_viewport_context() abort
  " Narrow detached selector: no message/image history or other state copies.
  let direct = {}
  if get(s:state, 'state', '') ==# 'ready'
    for room in get(s:state, 'rooms', [])
      if get(room, 'type', '') ==# 'direct' && !get(room, 'cached', 0) | let direct[room.id] = 1 | endif
    endfor
  endif
  return {'state': get(s:state, 'state', ''), 'sessionId': get(get(s:state, 'localContext', {}), 'sessionId', ''), 'direct': direct}
endfunction
function! wbx#context_epoch() abort
  return s:context_epoch
endfunction
function! wbx#meeting_state() abort
  return wbx#meeting_action#state(s:meeting_action)
endfunction
function! wbx#buffers() abort
  return extend(wbx#workspace#buffers(s:workspace), {'drafts':wbx#drafts#buffers()})
endfunction
function! wbx#health() abort
  let health = {'editor': has('nvim') ? 'neovim' : 'vim', 'jobs': has('nvim') || has('job') && has('channel'),
        \ 'terminal': has('nvim') || has('terminal'), 'node': executable('node'), 'backend_built': filereadable(s:root . '/dist/editor-main.js'),
        \ 'tmux': executable('tmux'), 'kitty': executable('kitty'), 'graphical_display': !empty($DISPLAY) || !empty($WAYLAND_DISPLAY),
        \ 'backend_running': wbx#transport#running(), 'protocol_ready': wbx#connection#ready(s:connection), 'last_notice': s:last_error,
        \ 'rpc_requests': wbx#connection#requests(s:connection),
        \ 'read_status': wbx#connection#disconnected(s:connection) ? 'unavailable' : get(s:state, 'readStatus', 'off'),
        \ 'read_status_notice': get(s:state, 'readStatusNotice', ''),
        \ 'reaction_reads': wbx#reaction_history#diagnostics(),
        \ 'read_status_cached_rooms': s:room_counts.unread_stale,
        \ 'spaces_cache': get(s:state, 'spacesCache', {'state': 'off'}),
        \ 'spaces_cache_rows': s:room_counts.cached,
        \ 'upcoming_meetings': get(get(s:state, 'upcomingMeetings', {}), 'state', 'off'),
        \ 'upcoming_meetings_reason': get(get(s:state, 'upcomingMeetings', {}), 'reason', ''),
        \ 'upcoming_meetings_scope': get(get(s:state, 'upcomingMeetings', {}), 'requiredScope', 'meeting:schedules_read'),
        \ 'mark_read_on_open': s:options().mark_read_on_open ? v:true : v:false,
        \ 'images': wbx#images#status(wbx#workspace#id(s:workspace,'history')),
        \ 'notifications': wbx#notifications#status(),
        \ 'local_unread': wbx#unread#status(),
        \ 'mapping_conflicts': wbx#commands#conflicts(), 'bindings': wbx#commands#bindings()}
  " Full maparg dictionaries remain available to callers, but echoing all of
  " them can block a normal TUI on a More prompt as the catalogue grows.
  let report = copy(health)
  let report.bindings = map(copy(health.bindings), '{"lhs": v:val.lhs, "command": v:val.command}')
  echo report
  return health
endfunction
function! wbx#disconnect() abort
  call wbx#render_request#cancel(s:render_request)
  call wbx#draft_persistence#flush()
  call wbx#selection#cancel(s:selection)
  call wbx#sections#reset()
  call wbx#uploads#invalidate()
  call wbx#conversations#invalidate()
  if exists('*wbx#message_actions#invalidate') | call wbx#message_actions#invalidate() | endif
  if exists('*wbx#reactions#invalidate') | call wbx#reactions#invalidate() | endif
  call wbx#drafts#disconnect()
  call wbx#unread#reset()
  call wbx#notifications#stop()
  call wbx#image_external#stop()
  call wbx#attachment_open#stop(s:attachment_open)
  call wbx#image_request#reset(s:image_request)
  call wbx#rpc('session.stop', {})
endfunction
function! wbx#shutdown() abort
  call wbx#render_request#cancel(s:render_request)
  call wbx#draft_persistence#flush()
  call wbx#selection#cancel(s:selection)
  call wbx#uploads#invalidate()
  call wbx#conversations#invalidate()
  if exists('*wbx#message_actions#invalidate') | call wbx#message_actions#invalidate() | endif
  if exists('*wbx#reactions#invalidate') | call wbx#reactions#invalidate() | endif
  call wbx#unread#reset()
  call wbx#notifications#stop()
  call wbx#image_external#stop()
  call wbx#attachment_open#stop(s:attachment_open)
  call wbx#image_request#reset(s:image_request)
  if !wbx#transport#running()
    return
  endif
  let s:closing = 1
  call wbx#transport#detach()
  let leave = get(s:options().meeting, 'leave_on_exit', 0)
  if get(wbx#meeting_state(), 'active', 0)
    echomsg leave ? '[wbx-tui] Requesting explicit meeting leave on exit.' : '[wbx-tui] Meeting remains owned by tmux unless explicitly left.'
  endif
  call wbx#rpc('shutdown', {'leaveMeeting': leave ? v:true : v:false})
  let start = reltime()
  while wbx#transport#running() && reltimefloat(reltime(start)) < (leave ? 5.0 : 1.0)
    sleep 10m
  endwhile
  call wbx#connection#stop(s:connection)
endfunction

let s:buffer_setup_effects = {'Render':function('s:render'), 'EnterWindow':function('wbx#_window_enter'),
      \ 'LeaveWindow':function('wbx#_window_leave'), 'Draft':function('wbx#_draft_setup'), 'Event':function('s:event')}
let s:selection = wbx#selection#new({'Context':function('s:selection_context'), 'Request':function('s:selection_request'),
      \ 'Attachments':function('s:selection_attachments'), 'Open':function('s:selection_open'), 'Notify':function('s:notify')})
let s:space_picker = wbx#space_picker#new({'State':function('s:activation_state'), 'Options':function('s:options'),
      \ 'Disconnected':function('wbx#connection#disconnected', [s:connection]), 'Select':function('wbx#select'), 'Notify':function('s:notify')})
let s:meeting_action = wbx#meeting_action#new({'Options':function('s:options'), 'Input':function('input'),
      \ 'Ready':function('wbx#connection#ready', [s:connection]), 'Disconnected':function('wbx#connection#disconnected', [s:connection]),
      \ 'Capabilities':function('wbx#connection#feature', [s:connection, 'capabilities']), 'Closing':function('s:meeting_closing'),
      \ 'Request':function('wbx#rpc'), 'Notify':function('s:notify'), 'ProtocolError':function('wbx#_protocol_error'),
      \ 'Render':function('s:render_meeting'), 'Event':function('s:event'), 'CancelSelection':function('wbx#selection#cancel', [s:selection]),
      \ 'Focus':function('wbx#transport#focus'), 'Detach':function('wbx#transport#detach'), 'Terminal':function('wbx#transport#terminal')})
let s:renderer = wbx#render#new({'Status':function('wbx#status'), 'Destination':function('wbx#destination'),
      \ 'Compose':function('s:render_compose'), 'Notify':function('s:notify'),
      \ 'Uncertain':function('s:delivery_uncertain'), 'Pending':function('s:delivery_pending')})
let s:render_request = wbx#render_request#new({'Render':function('s:render_now'), 'Context':function('s:render_context'),
      \ 'Interrupted':function('wbx#render#interrupted', [s:renderer]), 'Notify':function('s:notify')})
let s:workspace = wbx#workspace#new({'Setup':function('s:local_setup'), 'Render':function('s:render'),
      \ 'Geometry':function('s:workspace_geometry'), 'Statusline':function('s:workspace_statusline'), 'Draft':function('s:workspace_draft')})
let s:activation = wbx#history_activation#new(s:workspace, {'State':function('s:activation_state'), 'Options':function('s:options'),
      \ 'Setup':function('s:local_setup'), 'Render':function('s:render'), 'Notify':function('s:notify'), 'Request':function('wbx#rpc')})
let s:send_action = wbx#send_action#new({'State':function('s:send_state'), 'Destination':function('wbx#destination'),
      \ 'Supports':function('wbx#supports'), 'SupportsUpload':function('wbx#supports_upload'), 'Consent':function('wbx#rich#consent'),
      \ 'Capabilities':function('wbx#connection#feature', [s:connection, 'capabilities']), 'NextId':function('wbx#connection#next_id', [s:connection]),
      \ 'Request':function('wbx#rpc'), 'Notify':function('s:notify'), 'Render':function('s:render')})
let s:delivery_clear = wbx#delivery_clear#new({'State':function('s:delivery_clear_state'), 'Write':function('s:write'),
      \ 'Render':function('s:render'), 'Notify':function('s:notify')})
let s:delivery_ingress = wbx#delivery_ingress#new({'State':function('s:delivery_clear_state'),
      \ 'Clear':function('wbx#delivery_clear#clear', [s:delivery_clear]), 'ProtocolError':function('wbx#_protocol_error'),
      \ 'Notify':function('s:notify'), 'Render':function('s:render'), 'Event':function('s:event')})
let s:delivery_recovery = wbx#delivery_recovery#new({'State':function('s:delivery_recovery_state'), 'Supports':function('wbx#supports'),
      \ 'Request':function('wbx#rpc'), 'ProtocolError':function('wbx#_protocol_error'), 'Render':function('s:render'), 'Notify':function('s:notify')})
let s:attachment_open = wbx#attachment_open#new({'State':function('s:attachment_state'), 'Message':function('s:message_at_cursor'),
      \ 'Options':function('s:options'), 'Capabilities':function('wbx#connection#feature', [s:connection, 'capabilities']),
      \ 'Disconnected':function('wbx#connection#disconnected', [s:connection]), 'CanCancel':function('s:attachment_can_cancel'),
      \ 'ImageBusy':function('s:attachment_image_busy'), 'SetImageBusy':function('s:attachment_set_image_busy'), 'ImageOpen':function('wbx#image_open'),
      \ 'Request':function('wbx#rpc'), 'ProtocolError':function('wbx#_protocol_error'), 'Notify':function('s:notify')})
let s:image_request = wbx#image_request#new({'State':function('s:attachment_state'), 'Message':function('s:message_at_cursor'),
      \ 'Options':function('s:options'), 'Capabilities':function('wbx#connection#feature', [s:connection, 'capabilities']),
      \ 'Metadata':function('wbx#connection#feature', [s:connection, 'attachmentMetadata']),
      \ 'Ready':function('wbx#connection#ready', [s:connection]), 'Disconnected':function('wbx#connection#disconnected', [s:connection]),
      \ 'Blocked':function('wbx#attachment_open#blocks_previews', [s:attachment_open]),
      \ 'Generation':function('wbx#attachment_open#generation', [s:attachment_open]),
      \ 'Request':function('wbx#rpc'), 'ProtocolError':function('wbx#_protocol_error'), 'Notify':function('s:notify')})

augroup wbx_attachment_intent
  autocmd!
  autocmd CursorMoved,CursorMovedI,TextChanged,TextChangedI * call wbx#_attachment_check(0)
  autocmd BufLeave,WinLeave * call wbx#_attachment_check(1)
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
