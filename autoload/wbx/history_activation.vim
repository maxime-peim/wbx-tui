" Explicit history activation and endpoint receipt admission, not selection/transport.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#history_activation#new(workspace, ports) abort
  return {'workspace':a:workspace, 'ports':a:ports, 'pending':{}, 'attempts':{}, 'latest':{}}
endfunction
function! wbx#history_activation#lost(owner) abort
  " Only transport loss releases pending admission; endpoint evidence survives.
  let a:owner.pending = {}
endfunction
function! wbx#history_activation#observe(owner, state) abort
  let room = get(a:state, 'room', v:null)
  let messages = get(a:state, 'messages', [])
  if type(room) == v:t_dict && !empty(messages) && get(a:state, 'historyLatest', 1)
    if len(a:owner.latest) < 500 || has_key(a:owner.latest, room.id)
      let a:owner.latest[room.id] = messages[-1].id
    endif
  endif
  for room in get(a:state, 'rooms', [])
    if get(a:state, 'readStatus', 'off') ==# 'ready' && !get(room, 'unreadStale', 0)
          \ && get(room, 'unread', v:null) is v:false && has_key(a:owner.attempts, room.id)
      " A confirmed read completes that attempt. A later server-unread cycle
      " (including an explicit mark-unread elsewhere) may be acknowledged anew.
      call remove(a:owner.attempts, room.id)
    endif
  endfor
endfunction
function! wbx#history_activation#newest(owner) abort
  let state = call(a:owner.ports.State, [])
  let messages = get(state, 'messages', [])
  let room = get(state, 'room', v:null)
  let listed = type(room) == v:t_dict ? filter(copy(get(state, 'rooms', [])), 'v:val.id ==# room.id') : []
  return get(state, 'historyLatest', 1) && !empty(messages) && type(room) == v:t_dict
        \ && !get(room, 'unreadStale', 0)
        \ && (empty(listed) || !get(listed[0], 'unreadStale', 0))
        \ && get(a:owner.latest, room.id, messages[-1].id) ==# messages[-1].id
        \ && wbx#view#endpoint(messages[-1].id)
endfunction
function! wbx#history_activation#open(owner, request) abort
  let workspace = a:owner.workspace
  try
    if !wbx#view#owned(wbx#workspace#id(workspace,'history'), 'history')
      call wbx#workspace#ensure(workspace,'history')
      call call(a:owner.ports.Render, [])
    endif
    if wbx#view#edited(wbx#workspace#id(workspace,'history'))
      call call(a:owner.ports.Notify, ['Edited Webex history retained; focus unchanged. Save your copy before explicitly refreshing that view with :WebexRefresh!.'])
      return
    endif
    call wbx#workspace#show(wbx#workspace#id(workspace,'history'))
    call call(a:owner.ports.Setup, [])
    " Hooks can redirect/promote history. Only guarded explicit open positions
    " latest; polling/rendering preserve the reader's native cursor/viewport.
    if bufnr('%') == wbx#workspace#id(workspace,'history') && wbx#view#owned(wbx#workspace#id(workspace,'history'), 'history')
          \ && !wbx#view#edited(wbx#workspace#id(workspace,'history')) && get(b:, 'wbx_history_room', '') ==# a:request.id
      let state = call(a:owner.ports.State, [])
      let messages = get(state, 'messages', [])
      if !get(a:request, 'resume', 0) && (empty(messages) || !wbx#view#latest(messages[-1].id))
        normal! Gzb
      endif
      call wbx#paging#baseline()
      call wbx#unread#open(state)
      call call(a:owner.ports.Render, [])
      " Do not reuse the pre-render snapshot: hooks may replace application state.
      let state = call(a:owner.ports.State, [])
      let listed = filter(copy(get(state, 'rooms', [])), 'v:val.id ==# a:request.id')
      if get(a:request, 'allow_read', 1) && call(a:owner.ports.Options, []).mark_read_on_open && (get(a:request, 'unread', 0) || !empty(listed) && get(listed[0], 'unread', v:null) is v:true)
            \ && call(a:owner.ports.Options, []).read_status && get(state, 'readStatus', 'off') ==# 'ready'
            \ && get(get(state, 'room', {}), 'id', '') ==# a:request.id
            \ && get(state, 'ready', 0) && !get(state, 'loading', 0)
            \ && !empty(get(state, 'messages', [])) && get(b:, 'wbx_history_complete', 1)
            \ && wbx#history_activation#newest(a:owner)
            \ && !empty(listed) && get(listed[0], 'unread', v:null) isnot v:false
        call wbx#history_activation#read(a:owner, a:request.id, state.messages[-1].id, 1)
      endif
    endif
  catch /^Webex buffer name is occupied by other work/
    call call(a:owner.ports.Notify, [v:exception])
  endtry
endfunction
function! s:finished(owner, request, message) abort
  if a:owner.pending ==# a:request
    let a:owner.pending = {}
  endif
  " ACK changes neither authoritative unread nor failed-attempt admission.
endfunction
function! wbx#history_activation#read(owner, room, message, automatic) abort
  if !empty(a:owner.pending) || a:automatic && get(a:owner.attempts, a:room, '') ==# a:message
    return
  endif
  if len(a:owner.attempts) < 500 || has_key(a:owner.attempts, a:room)
    " Retain failed/unknown attempts; reopening must not automatically retry.
    let a:owner.attempts[a:room] = a:message
  elseif a:automatic
    return
  endif
  let request = {'roomId': a:room, 'messageId': a:message}
  let a:owner.pending = request
  if call(a:owner.ports.Request, ['rooms.read', request, function('s:finished', [a:owner, request])]) < 0
    let a:owner.pending = {}
  endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
