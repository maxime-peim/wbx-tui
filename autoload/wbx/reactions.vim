" Native reactions with explicit writes. No buffer replacement, toggle or replay.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:names = ['thumbsup', 'heart', 'celebrate', 'smiley', 'haha', 'confused', 'sad']
let s:labels = ['Thumbs up', 'Heart', 'Celebrate', 'Smile', 'Laugh', 'Confused', 'Sad']
let s:icons = {'thumbsup':'👍', 'heart':'♥️', 'celebrate':'🎉', 'smiley':'🙂', 'haha':'😂', 'confused':'😕', 'sad':'😢'}
function! wbx#reactions#icon(reaction) abort
  return get(s:icons, a:reaction, a:reaction)
endfunction
function! wbx#reactions#label(reaction) abort
  let index = index(s:names, a:reaction)
  let mode = get(get(g:, 'wbx_tui', {}), 'reaction_display', 'icons')
  if index < 0
    return type(mode) == v:t_string && mode ==# 'text'
          \ ? 'Emoji ' . join(map(str2list(a:reaction,1),'printf("U+%04X",v:val)'),' ') : a:reaction
  endif
  return (type(mode) == v:t_string && mode ==# 'text' ? '' : s:icons[a:reaction] . ' ') . s:labels[index]
endfunction
let s:serial = 0
let s:epoch = 0
let s:pending = {}
let s:unknown = {}
let s:command = 0
let s:activity = {}
let s:read_flight = {}
let s:read_serial = 0
let s:people_list = {}
function! s:close_people() abort
  let buffer = get(s:people_list, 'buffer', -1)
  let s:people_list = {}
  if wbx#lists#clean(buffer, 'reactions') | execute 'bwipeout ' . buffer | endif
endfunction
function! s:source() abort
  if !exists('*wbx#reaction_context') | return [] | endif
  let c = wbx#reaction_context()
  return [get(c,'sessionId',''),get(c,'roomId',''),get(c,'epoch',0),
        \ get(c,'sourceEpoch',0),get(c,'sourceRevision',0),get(c,'enabled',0),get(c,'available',0)]
endfunction
function! s:phase(origin, phase) abort
  if a:origin.command != s:command || a:origin.epoch != s:epoch | return | endif
  let next = {'origin':deepcopy(a:origin),'phase':a:phase}
  if next ==# s:activity | return | endif
  let s:activity = next
  redrawstatus
endfunction
function! wbx#reactions#status(...) abort
  " Hot redraw: fixed local data only, no state copies, target scans or I/O.
  if empty(s:activity) || empty(s:activity.phase) | return '' | endif
  let intent = s:activity.origin.intent
  return intent.buffer == (a:0 ? a:1 : bufnr('%')) && intent.window == (a:0 > 1 ? a:2 : win_getid())
        \ ? 'reactions: ' . s:activity.phase : ''
endfunction
function! wbx#reactions#busy() abort
  return !empty(s:activity) || !empty(s:read_flight) || !empty(s:pending)
endfunction
function! s:draining() abort
endfunction
function! s:cancel() abort
  let s:activity = {} | let s:command += 1
  redrawstatus
  if empty(s:read_flight)
    if empty(s:pending) | call wbx#reaction_history#resume() | endif
  else
    " Losing display intent never releases a physically admitted explicit read.
    call wbx#reaction_history#suspend(function('s:draining'))
  endif
endfunction
function! wbx#reactions#check() abort
  if !empty(s:people_list) && s:people_list.source !=# s:source()[:2]
    call s:close_people()
  endif
  if empty(s:activity) && empty(s:read_flight) | return | endif
  let source = s:source()
  if !empty(s:read_flight) && !empty(source) && s:read_flight.session !=# source[0]
    " A replaced backend session cannot settle its orphaned callback here.
    let s:read_flight = {}
    if empty(s:activity) | call wbx#reaction_history#resume() | endif
  endif
  if !empty(s:activity)
    let intent = s:activity.origin.intent
    let changed = !bufexists(intent.buffer) || getbufvar(intent.buffer,'changedtick',-1) != intent.tick
          \ || bufname(intent.buffer) !=# intent.name || getbufvar(intent.buffer,'&buftype') !=# intent.buftype
    " Background win_execute() work in another split is not a user leave.
    " Source/buffer loss is global; cursor/intent checks belong to the origin.
    if s:activity.origin.source !=# source || changed
          \ || !empty(s:activity.phase) && intent.window == win_getid() && intent.buffer == bufnr('%') && !s:valid(s:activity.origin,0)
      call s:cancel()
    endif
  endif
  if !empty(s:read_flight) && empty(s:activity)
    " A later not-ready/ready projection can reset passive presentation again.
    " Reassert the read reservation even after display intent was already lost.
    call wbx#reaction_history#suspend(function('s:draining'))
  endif
endfunction
function! wbx#reactions#leave() abort
  if !empty(s:activity) && !empty(s:activity.phase)
        \ && s:activity.origin.intent.window == win_getid() && s:activity.origin.intent.buffer == bufnr('%')
    call s:cancel()
  endif
endfunction
function! s:key(target) abort
  return json_encode([a:target.roomId, a:target.messageId])
endfunction
function! s:retained_row(lines, rows, state, room, message, request) abort
  " Exact IDs only: no titles, bodies, provider/own-activity or preparation handles.
  let block = [a:state . (a:state ==# 'PENDING' ? ' - awaiting admitted result; do not replay'
        \ : ' - outcome unconfirmed; do not replay'),
        \ '  Room ID: ' . a:room, '  Message ID: ' . a:message,
        \ '  Request ID: ' . a:request, '']
  call extend(a:lines,block)
  call extend(a:rows,repeat([json_encode([a:room,a:message,a:request])],len(block)))
endfunction
function! wbx#reactions#unresolved() abort
  " A view over existing locks, never a second uncertainty owner or a provider
  " operation. Closing, editing or forging this snapshot changes no retained ID.
  let lines = ['Retained reaction writes - read-only LOCAL snapshot',
        \ 'Scope: this running editor memory only; may predate the current backend/account.',
        \ 'This is not server/account verification. Editor restart does not preserve this list.',
        \ 'r / :WebexReactionUnresolved refresh local snapshot; q returns; / searches.',
        \ 'Enter/write do not inspect, unlock, submit or replay any operation.',
        \ 'Recovery is separate: inspect the EXACT room/message in Webex, then return to',
        \ 'its unchanged loaded history target and explicitly use :WebexReactionResolve.',
        \ 'Resolution still requires the original retained request ID; no row is authority.',
        \ 'Snapshot is not updated automatically when a pending result settles.', '']
  let rows = repeat([''],len(lines))
  for request in sort(keys(s:pending))
    let context = s:pending[request]
    call s:retained_row(lines,rows,'PENDING',context.roomId,context.messageId,request)
  endfor
  for key in sort(keys(s:unknown))
    let target = json_decode(key)
    call s:retained_row(lines,rows,'UNKNOWN',target[0],target[1],s:unknown[key])
  endfor
  if empty(s:pending) && empty(s:unknown)
    call add(lines,'No locally retained pending or unknown reaction writes; not a server absence claim.')
    call add(rows,'')
  endif
  call wbx#lists#show('reaction-unresolved',lines,rows)
endfunction
function! s:notice(text) abort
  echohl WbxWarning | echomsg '[wbx-tui] ' . a:text | echohl None
endfunction
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Yes, continue", 1) == 2
endfunction
function! wbx#reactions#reason() abort
  if !wbx#options#normalized().reactions | return 'Reactions are disabled explicitly (reactions=0); pinned internal SDK compatibility risk' | endif
  if !exists('*wbx#supports_reactions') || !wbx#supports_reactions() | return 'Pinned-internal reaction mode is not advertised by the connected backend' | endif
  let state = wbx#state()
  if get(state, 'state', '') !=# 'ready' || !get(state, 'ready', 0) || type(get(state, 'room', v:null)) != v:t_dict
        \ || !wbx#view#owned(bufnr('%'), 'history') || wbx#view#edited(bufnr('%'))
        \ || get(b:, 'wbx_history_room', '') !=# state.room.id || empty(wbx#view#message_at(bufnr('%'), line('.')))
    return 'Choose one unchanged, loaded native history message in the selected space'
  endif
  return ''
endfunction
function! s:origin() abort
  call wbx#reactions#check()
  if exists('*wbx#read_by#busy') && wbx#read_by#busy() | call s:notice('Read-by inspection is still pending. No reaction was queued.') | return {} | endif
  if !empty(s:pending) | call s:notice('Wait for the admitted reaction result; :WebexReactionUnresolved lists retained targets. No other reaction action was queued.') | return {} | endif
  if !empty(s:read_flight) | call s:notice('A reaction read is still draining; wait for its result. No competing request was queued.') | return {} | endif
  let reason = wbx#reactions#reason()
  if !empty(reason) | call s:notice(reason) | return {} | endif
  let s:command += 1
  let origin = {'roomId':wbx#state().room.id, 'messageId':wbx#view#message_at(bufnr('%'), line('.')),
        \ 'epoch':s:epoch, 'command':s:command, 'intent':wbx#view#intent(),'source':s:source()}
  call s:phase(origin,'')
  return origin
endfunction
function! s:valid(origin, picker) abort
  return a:origin.epoch == s:epoch && a:origin.command == s:command && empty(wbx#reactions#reason())
        \ && a:origin.source ==# s:source()
        \ && (a:picker ? wbx#view#picker_valid(a:origin.intent) : wbx#view#intent_valid(a:origin.intent))
        \ && a:origin.messageId ==# wbx#view#message_at(bufnr('%'), line('.'))
endfunction
function! s:target(origin) abort
  return {'roomId':a:origin.roomId, 'messageId':a:origin.messageId, 'internalConsent':v:true}
endfunction
function! s:finish(origin, ...) abort
  if a:origin.command == s:command
    let s:activity = {}
    redrawstatus
    if empty(s:read_flight) && empty(s:pending) | call wbx#reaction_history#resume() | endif
  endif
endfunction
function! s:read_done(flight, Callback, response) abort
  if get(s:read_flight,'id',-1) != a:flight.id | return | endif
  let s:read_flight = {}
  try
    call call(a:Callback,[a:response])
  finally
    if empty(s:read_flight) && empty(s:activity) && empty(s:pending)
      call wbx#reaction_history#resume()
    endif
  endtry
endfunction
function! s:read(origin, method, params, Callback) abort
  if !empty(s:read_flight) | return | endif
  if a:method ==# 'messages.reactions' && get(wbx#reaction_context(),'self_summary',0)
    let a:params.selfSummary = v:true
  endif
  let s:read_serial += 1
  let flight = {'id':s:read_serial,'session':a:origin.intent.session}
  let s:read_flight = flight
  call s:phase(a:origin,'reading')
  if wbx#rpc(a:method,a:params,function('s:read_done',[flight,a:Callback])) < 0
    call s:read_done(flight,a:Callback,{'error':{'code':-32000}})
  endif
endfunction
function! s:snapshot(origin, action, response) abort
  if has_key(a:response, 'error') || !s:valid(a:origin, 0) | call s:finish(a:origin) | return | endif
  let v = get(a:response, 'result', {})
  if !wbx#protocol#reactions(v) || v.roomId !=# a:origin.roomId || v.messageId !=# a:origin.messageId
    call s:finish(a:origin) | call wbx#_protocol_error() | return
  endif
  call s:phase(a:origin,'')
  call wbx#reaction_history#accept(v)
  if a:action ==# 'remove'
    let choices = filter(copy(v.groups), 'has_key(v:val, "own")')
    if empty(choices) | call s:notice('Remove unavailable: Webex supplied no freshly verified own reaction. Nothing was sent; counts or cached ownership cannot authorize removal.') | call s:finish(a:origin) | return | endif
    if len(choices) == 1
      call s:picked(a:origin,'remove',[choices[0].reaction],1)
      return
    endif
    call wbx#chooser#select(['Remove your verified reaction:'] + map(copy(choices), 'wbx#reactions#label(v:val.reaction)'),
          \ function('s:picked', [a:origin, 'remove', map(copy(choices), 'v:val.reaction')]))
    return
  endif
  let coverage = v.partial || v.unknown ? 'Partial / counts unknown; absence is not zero' : 'Complete local demo snapshot'
  let rows = map(copy(v.groups), 'wbx#reactions#label(v:val.reaction) . " — " . (has_key(v:val, "count") ? v:val.count : "?") . (has_key(v:val, "own") ? " (yours verified)" : "")')
  call wbx#chooser#select(['Reactions — ' . coverage] + (empty(rows) ? ['No known labels; no absence claim'] : rows), function('s:finish',[a:origin]))
endfunction
function! s:details(origin, response) abort
  if has_key(a:response,'error') || !s:valid(a:origin,0) | call s:finish(a:origin) | return | endif
  let v = get(a:response,'result',{})
  if !wbx#protocol#reaction_details(v) || v.snapshot.roomId !=# a:origin.roomId || v.snapshot.messageId !=# a:origin.messageId
    call s:finish(a:origin) | call wbx#_protocol_error() | return
  endif
  call wbx#reaction_history#accept(v.snapshot)
  let lines = []
  for group in v.snapshot.groups
    call add(lines,wbx#reactions#label(group.reaction) . ' — ' . get(group,'count','?'))
    let actors = filter(copy(v.actors),'v:val.reaction ==# group.reaction')
    for actor in actors
      call add(lines,'  ' . get(actor,'name','Name unavailable'))
    endfor
    if empty(actors) | call add(lines,'  People unavailable') | endif
    call add(lines,'')
  endfor
  if empty(v.snapshot.groups) | call add(lines,'No disclosed reactions') | endif
  call s:finish(a:origin)
  let buffer = wbx#lists#show('reactions',lines)
  if buffer > 0
    let s:people_list = {'buffer': buffer, 'source': a:origin.source[:2]}
    call wbx#reactions#check()
  endif
endfunction
function! wbx#reactions#show() abort
  let origin = s:origin()
  if !empty(origin)
    call s:phase(origin,'waiting')
    call wbx#reaction_history#suspend(function('s:begin',[origin,'show']))
  endif
endfunction
function! wbx#reactions#choose(action) abort
  let origin = s:origin()
  if empty(origin) | return | endif
  if !empty(s:pending) || has_key(s:unknown, s:key(origin)) || len(s:unknown) >= 256
    call s:notice('Reaction pending/unresolved. :WebexReactionUnresolved lists retained targets. Inspect Webex, then :WebexReactionResolve; no retry was queued.') | call s:finish(origin) | return
  endif
  if a:action ==# 'add'
    " Picking is local. Only preparation waits for an already-admitted read.
    call wbx#reaction_history#suspend(function('s:draining'))
    call s:begin(origin,'add')
    return
  endif
  call s:phase(origin,'waiting')
  call wbx#reaction_history#suspend(function('s:begin',[origin,a:action]))
endfunction
function! s:begin(origin, action) abort
  if !s:valid(a:origin,0) | call s:finish(a:origin) | return | endif
  let origin = a:origin
  if a:action ==# 'remove'
    call s:read(origin,'messages.reactions',s:target(origin),function('s:snapshot',[origin,'remove']))
  elseif a:action ==# 'show'
    if get(wbx#reaction_context(),'actor_details',0)
      call s:read(origin,'messages.reactions',extend(s:target(origin),{'details':v:true}),function('s:details',[origin]))
    else
      call s:read(origin,'messages.reactions',s:target(origin),function('s:snapshot',[origin,'show']))
    endif
  elseif a:action ==# 'add'
    call s:phase(origin,'')
    call wbx#chooser#select(['Add experimental reaction (choose to send; not a toggle):']
          \ + map(copy(s:names), 'wbx#reactions#label(v:val)') + ['Other emoji...'],
          \ function('s:add_picked', [origin]))
  endif
endfunction
function! s:add_picked(origin, choice) abort
  if a:choice != len(s:names)+1 | return s:picked(a:origin,'add',s:names,a:choice) | endif
  if !s:valid(a:origin,1) | call s:finish(a:origin) | return | endif
  let origin = copy(a:origin) | let origin.intent = wbx#view#intent()
  " Vim popup filters cannot safely open a nested input prompt.
  call timer_start(0,function('s:other',[origin]))
endfunction
function! s:other(origin, timer) abort
  if !s:valid(a:origin,0) | call s:finish(a:origin) | return | endif
  try
    let reaction = input('Reaction emoji (paste one; Enter sends, empty cancels): ')
  catch /^Vim:Interrupt$/
    let reaction = ''
  endtry
  if empty(reaction) | call s:finish(a:origin) | return | endif
  if !wbx#protocol#reaction_name(reaction)
    call s:notice('Paste one Unicode emoji, not a name or text. Nothing was sent.')
    call s:finish(a:origin) | return
  endif
  call s:picked(a:origin,'add',[reaction],1)
endfunction
function! s:picked(origin, action, choices, choice) abort
  if !empty(s:read_flight) | return | endif
  if a:choice < 1 || a:choice > len(a:choices) || !s:valid(a:origin, 1) | call s:finish(a:origin) | return | endif
  let origin = copy(a:origin)
  let origin.intent = wbx#view#intent()
  call s:phase(origin,'waiting')
  let origin.action = a:action | let origin.reaction = a:choices[a:choice - 1]
  call wbx#reaction_history#suspend(function('s:prepare',[origin]))
endfunction
function! s:prepare(origin) abort
  if !s:valid(a:origin,0) | call s:finish(a:origin) | return | endif
  let origin = a:origin
  call s:read(origin,'messages.reactionPrepare',extend(s:target(origin),{'action':origin.action,'reaction':origin.reaction}),function('s:prepared',[origin]))
endfunction
function! s:prepared(origin, response) abort
  call s:phase(a:origin,'')
  if has_key(a:response, 'error') | call s:finish(a:origin) | return | endif
  let v = get(a:response, 'result', {})
  if !wbx#protocol#reaction_context(v) || v.roomId !=# a:origin.roomId || v.messageId !=# a:origin.messageId
        \ || v.action !=# a:origin.action || v.reaction !=# a:origin.reaction
    call s:finish(a:origin) | call wbx#_protocol_error() | return
  endif
  if !s:valid(a:origin, 0) || v.expiresAt <= localtime() * 1000
    call wbx#rpc('messages.reactionDiscard', {'contextId':v.contextId}) | call s:finish(a:origin) | return
  endif
  let s:serial += 1
  let request = 'reaction-' . getpid() . '-' . s:serial
  let s:activity = {}
  let s:pending[request] = deepcopy(v)
  if wbx#rpc('messages.reactionSubmit', extend(s:target(v), {'contextId':v.contextId, 'requestId':request, 'confirmed':v:true}),
        \ function('s:result', [a:origin, v, request])) < 0
    call remove(s:pending, request)
    let s:unknown[s:key(v)] = request
    call s:finish(a:origin)
  endif
endfunction
function! s:result(origin, context, request, response) abort
  if !has_key(s:pending, a:request) | return | endif
  call remove(s:pending, a:request)
  let v = get(a:response, 'result', {})
  let valid = !has_key(a:response, 'error') && wbx#protocol#reaction_outcome(v)
        \ && v.contextId ==# a:context.contextId && v.requestId ==# a:request && v.action ==# a:context.action
        \ && v.roomId ==# a:context.roomId && v.messageId ==# a:context.messageId
  if !valid || v.status ==# 'unknown'
    let s:unknown[s:key(a:context)] = a:request
    call s:notice('Reaction UNKNOWN. Exact target retained; :WebexReactionUnresolved lists it. Inspect Webex then :WebexReactionResolve. Nothing was replayed.')
    if !valid && !has_key(a:response, 'error') | call wbx#_protocol_error() | endif
  else
    call s:notice(v.notice)
  endif
  if valid && v.status ==# 'changed' && a:origin.epoch == s:epoch && a:origin.source ==# s:source()
        \ && getbufvar(a:origin.intent.buffer,'changedtick',-1) == a:origin.intent.tick
    call wbx#reaction_history#applied(a:context)
  elseif !valid || v.status !=# 'changed'
    call wbx#reaction_history#refresh(a:context.roomId,a:context.messageId)
  endif
  call s:finish(a:origin)
endfunction
function! wbx#reactions#resolve() abort
  let origin = s:origin()
  if empty(origin) | return | endif
  call s:phase(origin,'waiting')
  call wbx#reaction_history#suspend(function('s:resolve',[origin]))
endfunction
function! s:resolve(origin) abort
  if !s:valid(a:origin,0) | call s:finish(a:origin) | return | endif
  call s:phase(a:origin,'')
  let origin = a:origin
  let request = get(s:unknown, s:key(origin), '')
  if !s:confirm('Have you inspected EXACT room ' . origin.roomId . ' / message ' . origin.messageId
        \ . ' in Webex? Unlock this target WITHOUT writing or retrying. A later explicit add may duplicate an uncertain write.')
        \ || !s:valid(origin, 0) | call s:finish(origin) | return | endif
  let params = extend(s:target(origin), {'checked':v:true})
  if !empty(request) | let params.requestId = request | endif
  call s:read(origin,'messages.reactionResolve',params,function('s:resolved',[origin,request]))
endfunction
function! s:resolved(origin, request, response) abort
  call s:finish(a:origin)
  if has_key(a:response, 'error') | return | endif
  if get(a:response, 'result', 0) isnot v:null | call wbx#_protocol_error() | return | endif
  if !s:valid(a:origin, 0) || get(s:unknown, s:key(a:origin), '') !=# a:request | return | endif
  if has_key(s:unknown, s:key(a:origin)) | call remove(s:unknown, s:key(a:origin)) | endif
  call s:notice('Reaction uncertainty cleared. No reaction was sent or retried.')
endfunction
function! wbx#reactions#invalidate() abort
  call s:close_people()
  let s:epoch += 1
  let s:activity = {} | let s:read_flight = {}
  redrawstatus
  call wbx#reaction_history#invalidate()
  for [request, context] in items(s:pending) | let s:unknown[s:key(context)] = request | endfor
  let s:pending = {}
endfunction
augroup wbx_reaction_lifecycle
  autocmd!
  autocmd User WbxDisconnected call wbx#reactions#invalidate()
  autocmd User WbxState call wbx#reactions#check()
  autocmd BufLeave,WinLeave * call wbx#reactions#leave()
  autocmd BufEnter,WinEnter,CursorMoved,CursorMovedI,TextChanged,TextChangedI,BufFilePost * call wbx#reactions#check()
  autocmd OptionSet buftype call wbx#reactions#check()
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
