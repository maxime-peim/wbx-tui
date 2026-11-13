" Bounded read-only history presentation. Never message text, ownership or consent.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:owner = []
let s:cache_owner = []
let s:available = -1
let s:source_revision = 0
let s:epoch = 0
let s:cache = {}
let s:restore_blocked = {}
let s:used = 0
let s:flight = {}
let s:serial = 0
let s:timer = -1
let s:refresh = -1
let s:paused = 0
let s:Waiter = 0
let s:cooldown = 0
" Presentation snapshots are last-observed data, not write authority. Refresh
" quietly after five minutes, never expire/repaint the viewport every 30 seconds.
let s:cache_seconds = 300
let s:retry_limit = 3
function! s:now() abort
  return localtime()
endfunction
function! wbx#reaction_history#highlights() abort
  highlight default link WbxHistoryReactions Special
  highlight default link WbxHistoryReactionsMuted Comment
  highlight default link WbxHistoryReactionsOwn WbxHistoryReactions
endfunction
call wbx#reaction_history#highlights()
function! s:context() abort
  return exists('*wbx#reaction_context') ? wbx#reaction_context() : {}
endfunction
function! s:key(block) abort
  return get(a:block,'reaction_key',get(a:block,'key',''))
endfunction
function! s:enabled(context) abort
  return !empty(a:context) && get(a:context,'enabled',0)
endfunction
function! s:owner(context) abort
  " Only an explicitly recoverable failure shares presentation ownership with
  " ready. Terminal failures/legacy unclassified failures still discard it.
  let health = get(a:context,'available',0) || get(a:context,'degraded',0) ? 'retained'
        \ : get(a:context,'connecting',0) ? 'connecting' : 'unavailable'
  return [get(a:context,'sessionId',''), get(a:context,'roomId',''), get(a:context,'epoch',0),get(a:context,'sourceEpoch',0),health]
endfunction
function! s:stop_timers() abort
  if s:timer >= 0 | call timer_stop(s:timer) | let s:timer = -1 | endif
  if s:refresh >= 0 | call timer_stop(s:refresh) | let s:refresh = -1 | endif
endfunction
function! wbx#reaction_history#clear(buffer) abort
  if !bufexists(a:buffer) | return | endif
  if has('nvim')
    call nvim_buf_clear_namespace(a:buffer,nvim_create_namespace('wbx-history-reactions'),0,-1)
  elseif exists('*prop_remove')
    for name in ['WbxHistoryReactions','WbxHistoryReactionsMuted','WbxHistoryReactionsOwn','WbxHistoryReadBy','WbxHistoryReadByStale']
      if !empty(prop_type_get(name,{'bufnr':a:buffer}))
        call prop_remove({'bufnr':a:buffer,'type':name,'all':1},1,max([1,len(getbufline(a:buffer,1,'$'))]))
      endif
    endfor
  endif
  call setbufvar(a:buffer,'wbx_reaction_decorations',{})
  call setbufvar(a:buffer,'wbx_reaction_signature',[])
endfunction
function! s:buffers() abort
  return filter(getbufinfo({'bufloaded':1}),'getbufvar(v:val.bufnr,"wbx_kind","") ==# "history" || !empty(getbufvar(v:val.bufnr,"wbx_reaction_signature",[]))')
endfunction
function! s:evict(ids) abort
  if empty(a:ids) | return 0 | endif
  let oldest = a:ids[0]
  for id in a:ids
    if s:cache[id].used < s:cache[oldest].used | let oldest = id | endif
  endfor
  call remove(s:cache,oldest)
  return 1
endfunction
function! s:touch(entry) abort
  let s:used += 1 | let a:entry.used = s:used
endfunction
function! s:put(id, entry) abort
  " One cache and one total cap, including delayed replies and unavailable rows.
  " Reuse never changes observation time or promotes presentation into authority.
  if !has_key(s:cache,a:id) && len(s:cache) >= 64
    call s:evict(keys(s:cache))
  endif
  call s:touch(a:entry)
  let s:cache[a:id] = a:entry
endfunction
function! wbx#reaction_history#invalidate() abort
  call s:stop_timers()
  " View invalidation revokes presentation, not physical read admission. Keep an
  " old same-session read until its callback drains; its epoch cannot repaint.
  let s:epoch += 1 | let s:owner = [] | let s:cache_owner = [] | let s:available = -1 | let s:cache = {} | let s:used = 0
  let s:restore_blocked = {}
  let s:paused = 0 | let s:Waiter = 0 | let s:cooldown = 0
  for info in s:buffers() | call s:paint(info.bufnr,s:context()) | endfor
endfunction
function! s:prune(context) abort
  " Inspect loaded metadata only (<=500 messages), not the network/history.
  " Evict instead of merely hiding changed/deleted keys, including offscreen
  " entries. A later return to an old key must require a new observation.
  let current = {}
  for info in s:buffers()
    if !wbx#view#owned(info.bufnr,'history') || wbx#view#edited(info.bufnr)
          \ || getbufvar(info.bufnr,'wbx_history_room','') !=# a:context.roomId | continue | endif
    for block in getbufvar(info.bufnr,'wbx_message_blocks',[])
      let current[block.id] = s:key(block)
    endfor
  endfor
  let changed = 0
  for [id,entry] in items(s:cache)
    if entry.room !=# a:context.roomId | continue | endif
    if !has_key(current,id) || current[id] !=# entry.key
      call remove(s:cache,id) | let changed = 1
    endif
  endfor
  if !empty(s:flight)
    for target in s:flight.targets
      if !has_key(current,target.messageId) || current[target.messageId] !=# target.key
        let s:flight.invalid[target.messageId] = 1
      endif
    endfor
  endif
  return changed
endfunction
function! s:sync(context) abort
  " A dead/replaced backend cannot deliver the old session's callback.
  if !empty(s:flight) && get(s:flight,'sessionId','') !=# get(a:context,'sessionId','')
    let s:flight = {}
  endif
  let enabled = s:enabled(a:context)
  let retain = get(a:context,'retain',0)
  if !enabled && !retain
    if !empty(s:owner) || !empty(s:cache_owner) | call wbx#reaction_history#invalidate() | endif
    return 0
  endif
  " View identity fences callbacks; only authenticated source identity owns
  " reusable observations. Loading another room is not a source replacement.
  " Legacy selectors without that explicit retention proof remain view-scoped.
  let owner = s:owner(a:context)
  let cache_owner = retain ? [a:context.sessionId,get(a:context,'sourceEpoch',0)] : owner
  let view_changed = owner !=# s:owner
  let replaced = cache_owner !=# s:cache_owner
  let health_changed = s:available != get(a:context,'available',0)
        \ || s:source_revision != get(a:context,'sourceRevision',0)
  let repaint = view_changed || replaced
  if replaced
    let s:cache_owner = cache_owner | let s:cache = {} | let s:used = 0
    let s:restore_blocked = {}
  endif
  if view_changed || replaced || health_changed
    let s:epoch += 1 | let s:owner = owner | let s:cooldown = 0
    call s:stop_timers()
  endif
  if replaced
    let s:available = get(a:context,'available',0)
    let s:source_revision = get(a:context,'sourceRevision',0)
  elseif health_changed
    " Readiness is an independent callback fence, not presentation ownership.
    " Keep physical admission until it drains, even across rapid recovery.
    let s:available = get(a:context,'available',0)
    let s:source_revision = get(a:context,'sourceRevision',0)
    for entry in values(s:cache)
      if s:available | let entry.checked = 0 | endif
      if has_key(entry,'snapshot') | let entry.sourceStale = 1 | let repaint = 1 | endif
    endfor
  endif
  if !enabled
    " Keep observations, never old decorations or permission to read. Physical
    " admission stays with the outstanding callback, including while loading.
    for info in s:buffers() | call s:paint(info.bufnr,a:context) | endfor
    return 0
  endif
  if s:prune(a:context) || repaint
    " A paused picker suspends I/O, not truthful cached presentation.
    for info in s:buffers() | call s:paint(info.bufnr,a:context) | endfor
  endif
  return 1
endfunction
function! wbx#reaction_history#schedule() abort
  let context = s:context()
  if !s:sync(context) | return | endif
  call s:restore(context)
  if s:timer >= 0 || s:paused | return | endif
  let s:timer = timer_start(180,function('s:tick'))
endfunction
function! s:restore(context) abort
  if !exists('*wbx#cached_reactions') | return | endif
  let snapshots = wbx#cached_reactions()
  let current = {}
  for snapshot in snapshots | let current[snapshot.messageId] = snapshot.observedAt | endfor
  let changed = 0
  for [id,entry] in items(s:cache)
    if get(entry,'restored',0) && get(current,id,-1) != entry.snapshot.observedAt
      call remove(s:cache,id) | let changed = 1
    endif
  endfor
  let blocks = {}
  for info in s:buffers()
    if !wbx#view#owned(info.bufnr,'history') || wbx#view#edited(info.bufnr)
          \ || getbufvar(info.bufnr,'wbx_history_room','') !=# a:context.roomId | continue | endif
    for block in getbufvar(info.bufnr,'wbx_message_blocks',[]) | let blocks[block.id] = block | endfor
  endfor
  for snapshot in snapshots
    if snapshot.roomId !=# a:context.roomId || !has_key(blocks,snapshot.messageId) | continue | endif
    if snapshot.observedAt <= get(s:restore_blocked,snapshot.messageId,-1) | continue | endif
    let previous = get(s:cache,snapshot.messageId,{})
    if !empty(previous) && get(previous,'key','') ==# s:key(blocks[snapshot.messageId]) | continue | endif
    call s:put(snapshot.messageId,{'room':snapshot.roomId,'snapshot':snapshot,'key':s:key(blocks[snapshot.messageId]),
          \ 'checked':snapshot.observedAt/1000,'sourceStale':1,'restored':1})
    let changed = 1
  endfor
  if changed | for info in s:buffers() | call s:paint(info.bufnr,a:context) | endfor | endif
endfunction
function! s:later(timer) abort
  if a:timer != s:refresh | return | endif
  let s:refresh = -1
  call wbx#reaction_history#schedule()
endfunction
function! s:refresh_after(milliseconds) abort
  if s:refresh >= 0 | call timer_stop(s:refresh) | endif
  let s:refresh = timer_start(a:milliseconds,function('s:later'))
endfunction
function! wbx#reaction_history#visible() abort
  let visible = []
  if wbx#view#owned(bufnr('%'),'history') && !wbx#view#edited(bufnr('%'))
    " Ex-mode Vim can leave w$ behind w0 until a screen is attached. The known
    " top row remains a conservative viewport, never the rest of loaded history.
    let top = line('w0') | let bottom = max([top,line('w$')])
    for block in get(b:,'wbx_message_blocks',[])
      if block.start > bottom || block.end < top | continue | endif
      let row = max([block.start,top])
      if foldclosed(row) >= 0 && foldclosed(row) != block.start | continue | endif
      call add(visible,block)
    endfor
  endif
  " Eight messages near this split's cursor, not a loaded-history/account scan.
  let hovered = 0
  for index in range(len(visible))
    if visible[index].start <= line('.') | let hovered = index | endif
  endfor
  let start = max([0,min([hovered - 3,len(visible)-8])])
  let w:wbx_reaction_visible = visible[start:start+7]
endfunction
function! s:visible(context) abort
  let values = {} | let buffers = []
  for info in getwininfo()
    if info.tabnr != tabpagenr() || !wbx#view#owned(info.bufnr,'history') || wbx#view#edited(info.bufnr)
          \ || getbufvar(info.bufnr,'wbx_history_room','') !=# a:context.roomId | continue | endif
    call win_execute(info.winid,'call wbx#reaction_history#visible()')
    for block in getwinvar(info.winid,'wbx_reaction_visible',[])
      if len(values) < 64 | let values[block.id] = block | endif
    endfor
    if index(buffers,info.bufnr) < 0 | call add(buffers,info.bufnr) | endif
  endfor
  return [values,buffers]
endfunction
function! s:text_mode() abort
  let mode = get(get(g:,'wbx_tui',{}),'reaction_display','icons')
  return type(mode) == v:t_string && mode ==# 'text'
endfunction
function! s:text_width(buffer) abort
  " Decorations belong to the buffer; fit every visible current-tab split.
  " Do not activate windows or change wrap/breakat/gutter/user width options.
  let widths = map(filter(getwininfo(),'v:val.bufnr == a:buffer && v:val.tabnr == tabpagenr()'),
        \ 'max([1,v:val.width-get(v:val,"textoff",0)-2])')
  return empty(widths) ? 78 : min(widths)
endfunction
function! s:wrap_ascii(text, width) abort
  let lines = [] | let line = ''
  for word in split(a:text,' ')
    if !empty(line) && strlen(line)+strlen(word)+1 > a:width
      call add(lines,line) | let line = ''
    endif
    " Labels/codepoints and formatted counts are ASCII. Never silently lose
    " a long known count at a virtual-line edge, even in a very narrow split.
    while strlen(word) > a:width
      call add(lines,strpart(word,0,a:width)) | let word = strpart(word,a:width)
    endwhile
    let line .= (empty(line) ? '' : ' ') . word
  endfor
  if !empty(line) | call add(lines,line) | endif
  return lines
endfunction
function! s:label(entry, text_mode, width) abort
  if get(a:entry,'pending',0) && !has_key(a:entry,'snapshot') | return [[],'WbxHistoryReactionsMuted'] | endif
  if get(a:entry,'unavailable',0)
    " Passive failures belong in :WebexHealth, never a footer on every message.
    return [[],'WbxHistoryReactionsMuted']
  endif
  let value = a:entry.snapshot | let groups = [] | let rows = []
  let base = get(a:entry,'failed',0) || get(a:entry,'sourceStale',0) ? 'WbxHistoryReactionsMuted' : 'WbxHistoryReactions'
  for group in value.groups
    let mine = get(group,'mine',0) || has_key(group,'own')
    " Without a total, 1 (you) discloses only your known contribution.
    let text = (a:text_mode ? wbx#reactions#label(group.reaction) : wbx#reactions#icon(group.reaction))
          \ . (has_key(group,'count') ? ' ' . group.count : mine ? ' 1' : '')
          \ . (mine ? ' (you)' : '')
    let highlight = mine ? 'WbxHistoryReactionsOwn' : base
    if a:text_mode
      call extend(rows,map(s:wrap_ascii(text,a:width), '[[v:val,highlight]]'))
    else
      call add(groups,[text,highlight])
    endif
  endfor
  " Empty/incomplete observations say nothing about absence. Keep their cache
  " and DTO flags, but do not add a warning/footer to every unreacted message.
  " Coverage/count limitations remain explicit in :WebexReactions.
  if !empty(groups)
    if has('nvim')
      let chunks = []
      for group in groups
        if !empty(chunks) | call add(chunks,[' | ',base]) | endif
        call add(chunks,group)
      endfor
      call add(rows,chunks)
    else
      " Vim styles one virtual-text property per row; keep own chips separate.
      for highlight in ['WbxHistoryReactionsOwn',base]
        let chips = filter(copy(groups),'v:val[1] ==# highlight')
        if !empty(chips) | call add(rows,[[join(map(chips,'v:val[0]'),' | '),highlight]]) | endif
      endfor
    endif
  endif
  return [rows,base]
endfunction
function! wbx#reaction_history#_anchor() abort
  let row = get(screenpos(win_getid(),line('.'),col('.')),'row',0)
  if !row | return {} | endif
  return {'buffer':bufnr('%'),'tick':b:changedtick,'room':get(b:,'wbx_history_room',''),'cursor':getcurpos(),'view':winsaveview(),
        \ 'row':row,'height':winheight(0),'width':winwidth(0)}
endfunction
function! s:anchors(buffer) abort
  let windows = filter(getwininfo(),'v:val.bufnr == a:buffer && v:val.tabnr == tabpagenr()')
  let anchors = {}
  if empty(windows) || !exists('*screenpos') | return anchors | endif
  " Geometry, not an old request-time cursor or buffer-line offset. Redraw only
  " when decoration height changes; no window is entered and no text is written.
  redraw
  for window in windows
    let info = getwininfo(window.winid)
    if empty(info) || info[0].bufnr != a:buffer || info[0].tabnr != tabpagenr() | continue | endif
    let anchors[string(window.winid)] = json_decode(trim(win_execute(window.winid,
          \ 'echo json_encode(wbx#reaction_history#_anchor())')))
  endfor
  return anchors
endfunction
function! wbx#reaction_history#_restore_anchor(saved) abort
  if empty(a:saved) || bufnr('%') != a:saved.buffer || b:changedtick != a:saved.tick
        \ || !wbx#view#owned(bufnr('%'),'history') || wbx#view#edited(bufnr('%')) || get(b:,'wbx_history_room','') !=# a:saved.room
        \ || getcurpos() !=# a:saved.cursor || winheight(0) != a:saved.height || winwidth(0) != a:saved.width | return | endif
  let row = get(screenpos(win_getid(),line('.'),col('.')),'row',0)
  if !row | return | endif
  if row == a:saved.row
    if winsaveview() !=# a:saved.view | call wbx#paging#baseline() | endif
    return
  endif
  let best = winsaveview() | let distance = abs(row-a:saved.row)
  let options = [&l:scrolloff,&l:scrollbind,&l:cursorbind]
  let down = row > a:saved.row
  try
    " Native scroll commands handle virtual filler, wraps and closed folds.
    " Never synchronize other scroll/cursor-bound windows or move the reader.
    setlocal scrolloff=0 noscrollbind nocursorbind
    for step in range(64)
      let previous = winsaveview()
      if down | execute "silent keepjumps normal! \<C-e>"
      else | execute "silent keepjumps normal! \<C-y>" | endif
      if getcurpos() !=# a:saved.cursor | break | endif
      let row = get(screenpos(win_getid(),line('.'),col('.')),'row',0)
      if !row | break | endif
      let current = winsaveview()
      if abs(row-a:saved.row) < distance
        let best = current | let distance = abs(row-a:saved.row)
      endif
      " With smoothscroll off a wrapped top line is indivisible. Keep the
      " closest native viewport instead of changing the user's option, adding
      " fake padding or oscillating across an unrepresentable screen position.
      if !distance || down != (row > a:saved.row) || current ==# previous | break | endif
    endfor
  finally
    call winrestview(best)
    let [&l:scrolloff,&l:scrollbind,&l:cursorbind] = options
    call wbx#paging#baseline()
  endtry
endfunction
function! s:paint(buffer, context) abort
  if !has_key(a:context,'roomId') || !wbx#view#owned(a:buffer,'history') || wbx#view#edited(a:buffer)
        \ || getbufvar(a:buffer,'wbx_history_room','') !=# a:context.roomId
    call wbx#reaction_history#clear(a:buffer) | return
  endif
  let rows = {} | let text_mode = s:text_mode()
  let width = text_mode ? s:text_width(a:buffer) : 0
  for block in getbufvar(a:buffer,'wbx_message_blocks',[])
    let entry = get(s:cache,block.id,{})
    let chunks = [] | let group = 'WbxHistoryReactionsMuted'
    if s:enabled(a:context) && !empty(entry) && entry.room ==# a:context.roomId && get(entry,'key','') ==# s:key(block)
      call s:touch(entry)
      let [chunks,group] = s:label(entry,text_mode,width)
    endif
    if empty(chunks) | continue | endif
    let lines = map(copy(chunks),'join(map(copy(v:val),"v:val[0]"),"")')
    let rows[block.id] = {'row':block.end,'text':join(lines,' | '),'lines':lines,'group':group,'chunks':chunks}
  endfor
  let footer = exists('*wbx#read_by#footer') ? wbx#read_by#footer(a:buffer,s:text_width(a:buffer)+2) : {}
  if !empty(footer) | let rows["\nread-by"] = footer | endif
  let signature = [getbufvar(a:buffer,'changedtick'),rows]
  if getbufvar(a:buffer,'wbx_reaction_signature',[]) ==# signature | return | endif
  let layout = sort(map(values(copy(rows)),'[v:val.row,len(v:val.lines)]'),{left,right -> left[0]-right[0]})
  let previous = sort(map(values(getbufvar(a:buffer,'wbx_reaction_decorations',{})),
        \ '[v:val.row,len(get(v:val,"lines",[v:val.text]))]'),{left,right -> left[0]-right[0]})
  let anchors = layout ==# previous ? {} : s:anchors(a:buffer)
  call wbx#reaction_history#clear(a:buffer)
  for badge in values(rows)
    if badge.row < 1 || badge.row > len(getbufline(a:buffer,1,'$'))+get(badge,'footer',0) | continue | endif
    " The block's last buffer row is its blank separator. Add a virtual line
    " below the preceding body row, rather than filling that only blank gap.
    let anchor = max([1,badge.row-1])
    if has('nvim')
      let virtual = deepcopy(badge.chunks)
      if !get(badge,'footer',0)
        for row in virtual | let row[0][0] = '  ' . row[0][0] | endfor
      endif
      call nvim_buf_set_extmark(a:buffer,nvim_create_namespace('wbx-history-reactions'),anchor-1,0,
            \ {'virt_lines':virtual,
             \ 'virt_lines_above':v:false,'right_gravity':v:true,'priority':260})
    elseif exists('*prop_add')
      for chunks in badge.chunks
        let type = chunks[0][1]
        if empty(prop_type_get(type,{'bufnr':a:buffer}))
          call prop_type_add(type,{'bufnr':a:buffer,'highlight':type,'priority':260})
        endif
        call prop_add(anchor,0,{'bufnr':a:buffer,'type':type,'text':(get(badge,'footer',0) ? '' : '  ') . join(map(copy(chunks),'v:val[0]'),''),'text_align':'below','text_wrap':'truncate'})
      endfor
    endif
  endfor
  call setbufvar(a:buffer,'wbx_reaction_decorations',rows)
  call setbufvar(a:buffer,'wbx_reaction_signature',signature)
  if !empty(anchors)
    for [window,saved] in items(anchors)
      let info = getwininfo(str2nr(window))
      if !empty(info) && info[0].bufnr == a:buffer
        call win_execute(str2nr(window),'noautocmd call wbx#reaction_history#_restore_anchor(' . string(saved) . ')')
      endif
    endfor
  endif
endfunction
function! wbx#reaction_history#repaint() abort
  " Local shared-footer repaint only; never schedules a provider read.
  let context = s:context()
  for info in s:buffers() | call s:paint(info.bufnr,context) | endfor
endfunction
function! s:tick(timer) abort
  if a:timer != s:timer | return | endif
  let s:timer = -1 | let context = s:context()
  if !s:sync(context) | return | endif
  let [visible,buffers] = s:visible(context)
  if !context.available && !get(context,'connecting',0)
    for [id,block] in items(visible)
      let previous = get(s:cache,id,{})
      if get(previous,'room','') ==# context.roomId && has_key(previous,'snapshot') | continue | endif
      call s:put(id,{'room':context.roomId,'unavailable':1,'key':s:key(block),'checked':s:now()})
    endfor
  endif
  for info in s:buffers() | call s:paint(info.bufnr,context) | endfor
  if empty(buffers) || s:paused | return | endif
  if s:refresh < 0 | let s:refresh = timer_start(s:cache_seconds*1000,function('s:later')) | endif
  if !empty(s:flight) || !context.available || context.sending || s:now() < s:cooldown | return | endif
  let targets = [] | let reserved = 0
  for block in sort(values(visible),{left,right -> left.start-right.start})
    let id = block.id
    let entry = get(s:cache,id,{})
    if get(entry,'room','') !=# context.roomId | let entry = {} | endif
    if !empty(entry) && entry.key ==# s:key(block) && s:now()-entry.checked < get(entry,'ttl',s:cache_seconds) | continue | endif
    if len(s:cache)+reserved >= 64 && !has_key(s:cache,id)
      let evict = filter(keys(s:cache),'s:cache[v:val].room !=# context.roomId || !has_key(visible,v:val)')
      if !s:evict(evict) | return | endif
    endif
    if !has_key(s:cache,id) | let reserved += 1 | endif
    call add(targets,{'roomId':context.roomId,'messageId':id,'key':s:key(block)})
    if len(targets) >= (get(context,'batch',0) ? 8 : 1) | break | endif
  endfor
  if empty(targets) | return | endif
  let s:serial += 1
  let flight = {'id':s:serial,'epoch':s:epoch,'sessionId':get(context,'sessionId',''),'roomId':context.roomId,'targets':targets,'batch':get(context,'batch',0),'invalid':{},'observed':{}}
  let s:flight = flight
  let params = {'roomId':context.roomId,'internalConsent':v:true}
  if get(context,'self_summary',0) | let params.selfSummary = v:true | endif
  if flight.batch
    let params.messageIds = map(copy(targets),'v:val.messageId')
    if get(context,'progressive',0) | let params.progressive = v:true | endif
  else
    let params.messageId = targets[0].messageId
  endif
  let flight.progressive = get(params,'progressive',0)
  let flight.requestId = wbx#rpc(flight.batch ? 'messages.reactionsBatch' : 'messages.reactions',params,function('s:received',[flight]),'passive-reactions')
  if flight.requestId < 0
    call s:received(flight,{'error':{'code':-32000,'message':'Reaction summary unavailable (worker:unavailable).'}})
  endif
endfunction
function! wbx#reaction_history#progress(value) abort
  if empty(s:flight) || !get(s:flight,'progressive',0) || get(s:flight,'requestId',-1) != a:value.requestId | return | endif
  let context = s:context()
  call s:sync(context)
  if empty(s:flight) || s:flight.epoch != s:epoch || !s:enabled(context) || !context.available
        \ || s:owner(context) !=# s:owner | return | endif
  let snapshot = a:value.snapshot
  let targets = filter(copy(s:flight.targets),'v:val.messageId ==# snapshot.messageId && v:val.roomId ==# snapshot.roomId')
  if empty(targets) | call wbx#_protocol_error() | return | endif
  if has_key(s:flight.invalid,snapshot.messageId) || has_key(s:flight.observed,snapshot.messageId) | return | endif
  let s:flight.observed[snapshot.messageId] = 1
  call s:store(targets[0],snapshot)
  for info in s:buffers() | call s:paint(info.bufnr,context) | endfor
endfunction
function! s:store(target, value) abort
  if !has_key(a:value,'reason')
    call s:put(a:target.messageId,{'room':a:target.roomId,'snapshot':deepcopy(a:value),'key':a:target.key,'checked':s:now()})
    return
  endif
  let previous = get(s:cache,a:target.messageId,{})
  if get(previous,'room','') !=# a:target.roomId | let previous = {} | endif
  let retries = get(previous,'key','') ==# a:target.key ? get(previous,'retries',0) : 0
  if index(['worker:busy','context:unverified','admission:busy'],a:value.reason) >= 0 && retries < s:retry_limit
    let pending = has_key(previous,'snapshot') && previous.key ==# a:target.key ? previous : {'room':a:target.roomId,'key':a:target.key}
    call extend(pending,{'pending':1,'reason':a:value.reason,'retries':retries+1,'checked':s:now(),'ttl':1})
    call s:put(a:target.messageId,pending)
    call s:refresh_after(1000)
    return
  endif
  if has_key(previous,'snapshot') && previous.key ==# a:target.key
    " A failed refresh is not evidence that previously verified labels vanished.
    let previous.failed = 1 | let previous.pending = 0 | let previous.reason = a:value.reason | let previous.checked = s:now() | let previous.ttl = 60
  else
    call s:put(a:target.messageId,{'room':a:target.roomId,'unavailable':1,'reason':a:value.reason,'key':a:target.key,'checked':s:now(),'ttl':60,'retries':retries})
  endif
  let s:cooldown = s:now()+60
  call s:refresh_after(60000)
endfunction
function! s:received(flight, response) abort
  if get(s:flight,'id',-1) != a:flight.id | return | endif
  let context = s:context()
  call s:sync(context)
  if get(s:flight,'id',-1) != a:flight.id | return | endif
  let invalid = s:flight.invalid | let observed = s:flight.observed | let s:flight = {}
  if a:flight.epoch == s:epoch && s:enabled(context) && context.available && s:owner(context) ==# s:owner
    let value = get(a:response,'result',{})
    let ids = map(copy(a:flight.targets),'v:val.messageId')
    let valid = !has_key(a:response,'error') && (a:flight.batch
          \ ? wbx#protocol#reaction_batch(value) && value.roomId ==# a:flight.roomId && map(copy(value.items),'v:val.messageId') ==# ids
          \ : wbx#protocol#reactions(value) && value.roomId ==# a:flight.roomId && value.messageId ==# ids[0])
    if valid
      let items = a:flight.batch ? value.items : [value]
      for index in range(len(items))
        if !has_key(invalid,ids[index]) && !has_key(observed,ids[index]) | call s:store(a:flight.targets[index],items[index]) | endif
      endfor
    else
      let reason = wbx#protocol#reaction_read_error(a:response)
      for target in a:flight.targets
        if !has_key(invalid,target.messageId) | call s:store(target,{'reason':reason}) | endif
      endfor
      if !has_key(a:response,'error') | call wbx#_protocol_error() | endif
    endif
    for info in s:buffers() | call s:paint(info.bufnr,context) | endfor
  endif
  if type(s:Waiter) == v:t_func
    let Callback = s:Waiter | let s:Waiter = 0
    call call(Callback,[])
  else
    call wbx#reaction_history#schedule()
  endif
endfunction
function! wbx#reaction_history#diagnostics() abort
  " Explicit local health inspection only; aggregate the bounded loaded cache.
  " No message identities/content, provider payloads, I/O or write authority.
  let out = {'failedTargets':0,'pendingTargets':0,'cacheEntries':len(s:cache),'reasons':[]}
  for entry in values(s:cache)
    let out.failedTargets += !!(get(entry,'unavailable',0) || get(entry,'failed',0))
    let out.pendingTargets += !!get(entry,'pending',0)
    if wbx#protocol#reaction_failure(get(entry,'reason',''))
      call add(out.reasons,entry.reason)
    endif
  endfor
  let out.reasons = uniq(sort(out.reasons))
  return out
endfunction
function! wbx#reaction_history#suspend(Callback) abort
  let s:paused = 1 | let s:Waiter = a:Callback
  call s:stop_timers()
  if empty(s:flight)
    let Callback = s:Waiter | let s:Waiter = 0
    call call(Callback,[])
  endif
endfunction
function! wbx#reaction_history#resume() abort
  let s:paused = 0 | let s:Waiter = 0
  if exists('*wbx#read_by#resume') | call wbx#read_by#resume() | endif
  call wbx#reaction_history#schedule()
endfunction
function! wbx#reaction_history#accept(value) abort
  let context = s:context()
  if !s:enabled(context) || !get(context,'available',0) || !wbx#protocol#reactions(a:value) || a:value.roomId !=# context.roomId | return | endif
  if !s:sync(context) | return | endif
  for info in s:buffers()
    if !wbx#view#owned(info.bufnr,'history') || getbufvar(info.bufnr,'wbx_history_room','') !=# context.roomId | continue | endif
    for block in getbufvar(info.bufnr,'wbx_message_blocks',[])
      if block.id ==# a:value.messageId
        call s:put(block.id,{'room':a:value.roomId,'snapshot':deepcopy(a:value),'key':s:key(block),'checked':s:now()})
      endif
    endfor
    call s:paint(info.bufnr,context)
  endfor
endfunction
function! wbx#reaction_history#applied(value) abort
  let context = s:context()
  if !s:enabled(context) || !get(context,'available',0) || !wbx#protocol#reaction_context(a:value)
        \ || a:value.roomId !=# get(context,'roomId','') | return | endif
  if !s:sync(context) | return | endif
  let entry = get(s:cache,a:value.messageId,{})
  let snapshot = get(entry,'room','') ==# a:value.roomId && has_key(entry,'snapshot')
        \ ? deepcopy(entry.snapshot) : {'roomId':a:value.roomId,'messageId':a:value.messageId,
        \ 'observedAt':s:now()*1000,'partial':v:true,'unknown':v:true,'groups':[]}
  let previous = filter(copy(snapshot.groups),'v:val.reaction ==# a:value.reaction')
  call filter(snapshot.groups,'v:val.reaction !=# a:value.reaction')
  let group = {'reaction':a:value.reaction,'label':a:value.label}
  if a:value.action ==# 'add'
    let group.mine = v:true
    if !empty(previous) && has_key(previous[0],'count')
      let total = previous[0].count
      let increment = !get(previous[0],'mine',0) && !has_key(previous[0],'own')
      if !increment || total < 9007199254740991 | let group.count = total+increment | endif
    endif
    call add(snapshot.groups,group)
  elseif !empty(previous) && get(previous[0],'count',0) > 1
    call add(snapshot.groups,group)
  endif
  " The adjusted last-known count is display evidence, never a removal handle.
  let snapshot.partial = v:true | let snapshot.unknown = v:true
  call wbx#reaction_history#accept(snapshot)
endfunction
function! wbx#reaction_history#refresh(room, message) abort
  if exists('*wbx#cached_reactions')
    for snapshot in wbx#cached_reactions()
      if snapshot.roomId ==# a:room && snapshot.messageId ==# a:message
        if len(s:restore_blocked) >= 64 && !has_key(s:restore_blocked,a:message)
          call remove(s:restore_blocked,keys(s:restore_blocked)[0])
        endif
        let s:restore_blocked[a:message] = snapshot.observedAt
      endif
    endfor
  endif
  if has_key(s:cache,a:message) && s:cache[a:message].room ==# a:room
    if get(s:cache[a:message],'restored',0)
      call remove(s:cache,a:message)
      for info in s:buffers() | call s:paint(info.bufnr,s:context()) | endfor
    else
      let s:cache[a:message].checked = 0
    endif
  endif
endfunction
function! wbx#reaction_history#check() abort
  if !wbx#view#owned(bufnr('%'),'history') || wbx#view#edited(bufnr('%'))
    call wbx#reaction_history#clear(bufnr('%'))
  endif
endfunction
augroup wbx_inline_reactions
  autocmd!
  autocmd TextChanged,TextChangedI,BufFilePost * if !empty(get(b:,'wbx_reaction_signature',[])) | call wbx#reaction_history#check() | endif
  autocmd ColorScheme * call wbx#reaction_history#highlights()
  autocmd TabEnter * call wbx#reaction_history#schedule()
  autocmd VimResized * call wbx#reaction_history#schedule()
  if exists('##WinResized')
    autocmd WinResized * call wbx#reaction_history#schedule()
  endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
