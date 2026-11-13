" Read-through snapshot on opening or explicit inspection; no receipt or polling.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:owner = []
let s:revision = -1
let s:cache = {}
let s:serial = 0
let s:used = 0
let s:activity = {}
let s:flight = {}
let s:timer = -1
let s:opened = []
let s:opening_buffer = 0
let s:live = {}
let s:live_timer = -1
function! wbx#read_by#highlights() abort
  highlight default link WbxHistoryReadBy Comment
  highlight default link WbxHistoryReadByStale WarningMsg
endfunction
call wbx#read_by#highlights()
function! s:context() abort
  return exists('*wbx#read_by_context') ? wbx#read_by_context() : {}
endfunction
function! s:owner(context) abort
  return [get(a:context,'sessionId',''),get(a:context,'sourceEpoch',0)]
endfunction
function! s:key(room, message) abort
  return json_encode([a:room,a:message])
endfunction
function! s:block(buffer, message) abort
  for block in getbufvar(a:buffer,'wbx_message_blocks',[])
    if block.id ==# a:message | return block | endif
  endfor
  return {}
endfunction
function! s:content(block) abort
  return get(a:block,'reaction_key',get(a:block,'key',''))
endfunction
function! s:stale(entry) abort
  " localtime() has second precision; expire conservatively within the last second.
  return get(a:entry,'failed',0) || localtime()*1000+999-get(a:entry.value,'observedAt',0) >= 300000
        \ || get(a:entry.value,'observedAt',0) > localtime()*1000+5000
endfunction
function! s:title(entry, direct) abort
  if !has_key(a:entry,'value') | return 'Read receipts unavailable' | endif
  let n = len(a:entry.value.readers)
  if a:direct | return 'Read by ' . get(a:entry.value.readers[0],'name','Name unavailable') | endif
  return n ? 'Read by ' . n : 'No read receipts reported'
endfunction
function! s:latest(buffer, room) abort
  let latest = {}
  for entry in values(s:cache)
    if entry.roomId !=# a:room || entry.history != a:buffer | continue | endif
    if empty(latest) || entry.used > latest.used | let latest = entry | endif
  endfor
  return latest
endfunction
function! wbx#read_by#footer(buffer, width) abort
  let context = s:context()
  if !get(context,'enabled',0) || !get(context,'loaded',0) || s:owner !=# s:owner(context) | return {} | endif
  let latest = s:latest(a:buffer,context.roomId)
  if empty(latest) | return {} | endif
  let block = s:block(a:buffer,latest.messageId)
  if empty(block) || latest.key !=# s:content(block) | return {} | endif
  let stale = has_key(latest,'value') && (s:stale(latest) || !context.available || s:revision != context.sourceRevision)
  let group = stale ? 'WbxHistoryReadByStale' : 'WbxHistoryReadBy'
  let readers = get(get(latest,'value',{}),'readers',[])
  let direct = get(context,'roomType','') ==# 'direct' && len(readers) == 1
  let foldable = !direct && !empty(readers)
  let expanded = foldable && get(latest,'expanded',0)
  let text = [s:title(latest,direct) . (stale ? ' (stale)' : '') . (foldable ? (expanded ? ' [-]' : ' [+]') : '')]
  if expanded
    call extend(text,map(sort(copy(readers),function('s:compare')),'get(v:val,"name","Name unavailable")'))
    call add(text,(latest.value.partial ? 'Partial snapshot · ' : '') . 'Checked ' . strftime('%H:%M',latest.value.observedAt/1000))
  endif
  let lines = []
  for line in text
    call extend(lines,s:wrap(line,max([1,a:width-2])))
  endfor
  " shortcut: buffer-scoped padding centers for the narrowest split; use window-local drawing for independent centering.
  let chunks = map(copy(lines),'[[repeat(" ",max([0,(a:width-strdisplaywidth(v:val))/2])) . v:val,group]]')
  return {'row':len(getbufline(a:buffer,1,'$'))+1,'text':join(lines,' | '),'lines':lines,'chunks':chunks,
        \ 'group':group,'footer':1,'messageId':latest.messageId,'foldable':foldable,'expanded':expanded}
endfunction
function! wbx#read_by#toggle() abort
  let c = s:context()
  if !get(c,'enabled',0) || !get(c,'loaded',0) || s:owner !=# s:owner(c)
        \ || !wbx#view#owned(bufnr('%'),'history') || wbx#view#edited(bufnr('%'))
        \ || get(b:,'wbx_history_room','') !=# c.roomId | return 0 | endif
  let entry = s:latest(bufnr('%'),c.roomId)
  let block = empty(entry) ? {} : s:block(bufnr('%'),entry.messageId)
  let readers = get(get(entry,'value',{}),'readers',[])
  if empty(block) || get(entry,'key','') !=# s:content(block) || empty(readers)
        \ || get(c,'roomType','') ==# 'direct' && len(readers) == 1 | return 0 | endif
  let entry.expanded = !get(entry,'expanded',0)
  call s:repaint()
  return 1
endfunction
function! s:wrap(text, width) abort
  let lines = [] | let line = ''
  for word in split(a:text,' ')
    if !empty(line) && strdisplaywidth(line . ' ' . word) > a:width
      call add(lines,line) | let line = ''
    endif
    if !empty(line) | let line .= ' ' | endif
    for char in split(word,'\zs')
      if !empty(line) && strdisplaywidth(line . char) > a:width
        call add(lines,line) | let line = ''
      endif
      let line .= char
    endfor
  endfor
  if !empty(line) | call add(lines,line) | endif
  return lines
endfunction
function! s:repaint() abort
  call wbx#reaction_history#repaint()
endfunction
function! s:expired(timer) abort
  if a:timer != s:timer | return | endif
  let s:timer = -1
  call s:repaint()
  call s:schedule()
endfunction
function! s:schedule() abort
  if s:timer >= 0 | call timer_stop(s:timer) | let s:timer = -1 | endif
  let delays = []
  for entry in values(s:cache)
    if has_key(entry,'value') && !s:stale(entry)
      call add(delays,max([1,entry.value.observedAt+300000-localtime()*1000-999]))
    endif
  endfor
  if !empty(delays) | let s:timer = timer_start(min(delays),function('s:expired')) | endif
endfunction
function! wbx#read_by#busy() abort
  return !empty(s:activity) || !empty(s:flight)
endfunction
function! wbx#read_by#status(buffer, window) abort
  return !empty(s:activity) && s:activity.intent.buffer == a:buffer && s:activity.intent.window == a:window
        \ ? 'read-by: ' . s:activity.phase : ''
endfunction
function! s:valid(origin) abort
  let c = s:context()
  let block = s:block(a:origin.history,a:origin.messageId)
  if !get(c,'available',0) || [s:owner(c),c.roomId,c.sourceRevision] !=# a:origin.source
        \ || !get(a:origin,'automatic',0) && !wbx#view#intent_valid(a:origin.intent)
        \ || !wbx#view#owned(a:origin.history,'history') || wbx#view#edited(a:origin.history)
        \ || getbufvar(a:origin.history,'wbx_history_room','') !=# a:origin.roomId
        \ || !get(a:origin,'automatic',0) && getbufvar(a:origin.history,'changedtick',-1) != a:origin.tick
        \ || empty(block) || empty(a:origin.key) || s:content(block) !=# a:origin.key | return 0 | endif
  return get(a:origin,'automatic',0) || wbx#view#message_at(bufnr('%'),line('.')) ==# a:origin.messageId
endfunction
function! s:finish() abort
  let s:activity = {}
  redrawstatus
  if empty(s:flight) && !wbx#reactions#busy() | call wbx#reaction_history#resume() | endif
endfunction
function! wbx#read_by#check() abort
  let c = s:context()
  if !empty(s:live) && !s:valid(s:live)
    let s:live = {}
    if s:live_timer >= 0 | call timer_stop(s:live_timer) | let s:live_timer = -1 | endif
  endif
  if empty(s:cache) && empty(s:activity) && empty(s:flight) | return | endif
  if !get(c,'enabled',0) || s:owner !=# s:owner(c)
    let s:cache = {} | let s:owner = s:owner(c)
    call s:finish()
  elseif s:revision != c.sourceRevision
    for entry in values(s:cache) | let entry.failed = 1 | endfor
  endif
  let s:revision = get(c,'sourceRevision',0)
  if !empty(s:flight) && get(c,'sessionId','') !=# s:flight.sessionId | let s:flight = {} | call s:finish() | endif
  let blocks = {}
  for entry in values(s:cache)
    " A loading placeholder is not evidence that a previously loaded target vanished.
    if !get(c,'loaded',0) || entry.roomId !=# get(c,'roomId','') | continue | endif
    if !has_key(blocks,string(entry.history))
      let blocks[string(entry.history)] = {}
      for block in getbufvar(entry.history,'wbx_message_blocks',[])
        let blocks[string(entry.history)][block.id] = s:content(block)
      endfor
    endif
    if !wbx#view#owned(entry.history,'history') || wbx#view#edited(entry.history)
          \ || get(blocks[string(entry.history)],entry.messageId,v:null) !=# entry.key
      call remove(s:cache,s:key(entry.roomId,entry.messageId))
    endif
  endfor
  if !empty(s:activity) && (!get(c,'available',0) || s:activity.source !=# [s:owner(c),get(c,'roomId',''),get(c,'sourceRevision',0)]
        \ || s:activity.intent.window == win_getid() && !s:valid(s:activity)) | call s:finish() | endif
  call s:schedule()
  call s:repaint()
  call wbx#read_by#resume()
endfunction
function! wbx#read_by#leave() abort
  if !empty(s:activity) && !get(s:activity,'automatic',0)
        \ && s:activity.intent.window == win_getid() && s:activity.intent.buffer == bufnr('%')
    call s:finish()
  endif
endfunction
function! wbx#read_by#cursor() abort
  if !empty(s:activity) && s:activity.intent.window == win_getid() && !s:valid(s:activity) | call s:finish() | endif
endfunction
function! wbx#read_by#reason() abort
  let c = s:context()
  if !get(c,'enabled',0) | return 'Read-by inspection needs enabled read status and a supporting connected backend' | endif
  if !get(c,'available',0) | return 'Read receipts unavailable; the existing SDK may be offline or rate-limited' | endif
  return wbx#view#owned(bufnr('%'),'history') && !wbx#view#edited(bufnr('%'))
        \ && get(b:,'wbx_history_room','') ==# c.roomId && !empty(wbx#view#message_at(bufnr('%'),line('.')))
        \ ? '' : 'Choose one unchanged loaded history message in the selected space'
endfunction
function! s:compare(left, right) abort
  let left = tolower(get(a:left,'name','Name unavailable')) | let right = tolower(get(a:right,'name','Name unavailable'))
  return left ==# right ? 0 : left ># right ? 1 : -1
endfunction
function! s:done(origin, serial, response) abort
  if get(s:flight,'serial',-1) != a:serial | return | endif
  let s:flight = {}
  let valid = !empty(s:activity) && s:valid(a:origin)
  call s:finish()
  if !valid
    call wbx#read_by#opened(s:opening_buffer)
    return
  endif
  let key = s:key(a:origin.roomId,a:origin.messageId)
  let entry = get(s:cache,key,extend(copy(a:origin),{'failed':1}))
  if !has_key(a:response,'error')
    let value = get(a:response,'result',{})
    if !wbx#protocol#readers(value) || value.roomId !=# a:origin.roomId || value.messageId !=# a:origin.messageId
      call wbx#_protocol_error() | return
    endif
    let entry = extend(copy(a:origin),{'value':deepcopy(value),'failed':0})
  else
    let entry.failed = 1
  endif
  let entry.expanded = get(get(s:cache,key,{}),'expanded',0)
  let s:used += 1 | let entry.used = s:used
  if !has_key(s:cache,key) && len(s:cache) >= 32
    let oldest = sort(keys(s:cache),{a,b -> s:cache[a].used-s:cache[b].used})[0]
    call remove(s:cache,oldest)
  endif
  let s:cache[key] = entry
  call s:schedule() | call s:repaint()
  call wbx#read_by#opened(s:opening_buffer)
endfunction
function! s:begin(origin) abort
  if empty(s:activity) || !s:valid(a:origin) | call s:finish() | return | endif
  if !empty(s:live) && s:live.messageId ==# a:origin.messageId && s:live.source ==# a:origin.source
    let s:live = {}
  endif
  let s:serial += 1
  let s:flight = {'serial':s:serial,'sessionId':a:origin.context.sessionId}
  let s:activity.phase = 'loading'
  redrawstatus
  let params = {'roomId':a:origin.roomId,'messageId':a:origin.messageId}
  if get(a:origin.context,'live',0) | let params.watch = v:true | endif
  if wbx#rpc('messages.readBy',params,function('s:done',[a:origin,s:serial])) < 0
    call s:done(a:origin,s:serial,{'error':{'code':-32000}})
  endif
endfunction
function! wbx#read_by#changed(value) abort
  let c = s:context()
  if !get(c,'live',0) || !get(c,'available',0)
        \ || [a:value.sessionId,a:value.roomId,a:value.sourceEpoch,a:value.sourceRevision]
        \ !=# [c.sessionId,c.roomId,c.sourceEpoch,c.sourceRevision] | return | endif
  let latest = empty(s:activity) ? s:latest(s:opening_buffer,c.roomId) : s:activity
  if empty(latest) | return | endif
  let origin = extend(copy(latest),{'automatic':1,'context':c,'source':[s:owner(c),c.roomId,c.sourceRevision],
        \ 'tick':getbufvar(latest.history,'changedtick',-1),'phase':'waiting'})
  if !s:valid(origin) | return | endif
  let s:live = origin
  let key = s:key(origin.roomId,origin.messageId)
  if has_key(s:cache,key) && !get(s:cache[key],'failed',0)
    let s:cache[key].failed = 1 | call s:repaint()
  endif
  call wbx#read_by#resume()
endfunction
function! wbx#read_by#resume() abort
  if !empty(s:live) && s:live_timer < 0 && !wbx#read_by#busy() && !wbx#reactions#busy()
    " One event-driven window, never a trailing debounce or retry/polling timer.
    let s:live_timer = timer_start(1000,function('s:live_refresh'))
  endif
endfunction
function! s:live_refresh(timer) abort
  if a:timer != s:live_timer | return | endif
  let s:live_timer = -1
  if wbx#read_by#busy() || wbx#reactions#busy() | return | endif
  let origin = s:live | let s:live = {}
  if empty(origin) || !s:valid(origin) | return | endif
  let latest = s:latest(origin.history,origin.roomId)
  if empty(latest) || latest.messageId !=# origin.messageId || latest.key !=# origin.key
        \ || empty(filter(getwininfo(),'v:val.bufnr == origin.history && v:val.tabnr == tabpagenr()')) | return | endif
  let s:activity = origin
  redrawstatus
  call wbx#reaction_history#suspend(function('s:begin',[origin]))
endfunction
function! wbx#read_by#show() abort
  call wbx#read_by#check()
  let reason = wbx#read_by#reason()
  if !empty(reason) | echomsg '[wbx-tui] ' . reason | return | endif
  if wbx#read_by#busy() || wbx#reactions#busy()
    echomsg '[wbx-tui] An inspection/reaction is still pending; no competing read was queued.' | return
  endif
  let c = s:context()
  let block = s:block(bufnr('%'),wbx#view#message_at(bufnr('%'),line('.')))
  let origin = {'roomId':c.roomId,'messageId':block.id,'history':bufnr('%'),'key':s:content(block),'tick':b:changedtick}
  let origin.intent = wbx#view#intent() | let origin.context = c
  let origin.source = [s:owner(c),c.roomId,c.sourceRevision] | let origin.phase = 'waiting'
  if !s:valid(origin) | return | endif
  let s:owner = s:owner(c) | let s:revision = c.sourceRevision | let s:activity = origin
  redrawstatus
  call wbx#reaction_history#suspend(function('s:begin',[origin]))
endfunction
function! wbx#read_by#opened(buffer) abort
  let s:opening_buffer = a:buffer
  let c = s:context()
  if !get(c,'enabled',0) || !get(c,'loaded',0)
    let s:opened = []
    return
  endif
  let opening = [c.sessionId,c.roomId]
  if s:opened ==# opening | return | endif
  call wbx#read_by#check()
  if !get(c,'available',0) || wbx#read_by#busy() || wbx#reactions#busy()
        \ || !wbx#view#owned(a:buffer,'history') || wbx#view#edited(a:buffer)
        \ || getbufvar(a:buffer,'wbx_history_room','') !=# c.roomId | return | endif
  let blocks = getbufvar(a:buffer,'wbx_message_blocks',[])
  if empty(blocks) | return | endif
  " Threaded display order is not chronological. Inspect the latest loaded ID only.
  let messages = get(wbx#state(),'messages',[])
  if empty(messages) | return | endif
  let latest = messages[0]
  for message in messages
    if message.created >=# latest.created | let latest = message | endif
  endfor
  let block = s:block(a:buffer,latest.id)
  if empty(block) | return | endif
  let s:opened = opening
  let origin = {'roomId':c.roomId,'messageId':block.id,'history':a:buffer,'key':s:content(block),
        \ 'tick':getbufvar(a:buffer,'changedtick',-1),'automatic':1,
        \ 'intent':wbx#view#intent(),'context':c,'source':[s:owner(c),c.roomId,c.sourceRevision],'phase':'waiting'}
  if !s:valid(origin) | return | endif
  let s:owner = s:owner(c) | let s:revision = c.sourceRevision | let s:activity = origin
  redrawstatus
  call wbx#reaction_history#suspend(function('s:begin',[origin]))
endfunction
augroup wbx_read_by
  autocmd!
  autocmd User WbxState,WbxDisconnected call wbx#read_by#check()
  autocmd CursorMoved * call wbx#read_by#cursor()
  autocmd BufEnter * call wbx#read_by#check()
  autocmd TextChanged,TextChangedI * if get(b:,'wbx_kind','') ==# 'history' | call wbx#read_by#check() | endif
  autocmd BufLeave,WinLeave,TabLeave * call wbx#read_by#leave()
  autocmd ColorScheme * call wbx#read_by#highlights()
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
