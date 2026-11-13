" Presentation-only recovery; held local callbacks, no transport, SDK or account.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=35 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload','p')
call writefile(['function! wbx#reaction_context() abort','return deepcopy(g:retention_context)','endfunction',
      \ 'function! wbx#rpc(method, params, Callback, ...) abort',
      \ 'call add(g:retention_requests,{"method":a:method,"params":deepcopy(a:params),"Callback":a:Callback,"policy":a:0 ? a:1 : ""})',
      \ 'return len(g:retention_requests)','endfunction',
      \ 'function! wbx#_protocol_error() abort','throw "Unexpected protocol error"','endfunction'],s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:retention_context = {'enabled':1,'available':1,'degraded':0,'sourceEpoch':1,'sourceRevision':0,'batch':1,'sending':1,
      \ 'sessionId':repeat('a',32),'roomId':'room','epoch':1}
let g:retention_requests = [] | let s:checks = []
call wbx#reaction_context()
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 3 | sleep 10m | endwhile
  call assert_true(eval(a:expression),a:expression)
endfunction
function! s:snapshot(reaction) abort
  return {'roomId':'room','messageId':'message','observedAt':100,'partial':v:true,'unknown':v:true,
        \ 'groups':[{'reaction':a:reaction,'label':a:reaction ==# 'heart' ? 'Heart' : 'Celebrate'}]}
endfunction
function! s:answer(index, reaction) abort
  call call(g:retention_requests[a:index].Callback,[{'result':{'roomId':'room','items':[s:snapshot(a:reaction)]}}])
endfunction
function! s:badge() abort
  return get(get(getbufvar(s:history,'wbx_reaction_decorations',{}),'message',{}),'text','')
endfunction
function! s:group() abort
  return get(get(getbufvar(s:history,'wbx_reaction_decorations',{}),'message',{}),'group','')
endfunction
function! s:idle() abort
endfunction
function! s:cycle() abort
  let g:retention_context.available = 0 | let g:retention_context.degraded = 1
  call wbx#reaction_history#schedule() | sleep 220m
  let g:retention_context.available = 1 | let g:retention_context.degraded = 0
  call wbx#reaction_history#schedule() | sleep 220m
endfunction
function! s:seed() abort
  let g:retention_context.sending = 1
  let g:retention_context.available = 1 | let g:retention_context.degraded = 0
  call wbx#reaction_history#schedule()
  call wbx#reaction_history#accept(s:snapshot('heart'))
  call assert_match('♥️',s:badge())
endfunction
try
  enew | file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  call setline(1,['Author','Exact message',''])
  setlocal nomodified nomodifiable
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = [{'id':'message','start':1,'body':2,'end':3,'key':'original'}]
  let s:history = bufnr('%') | let history_window = win_getid()
  call s:seed()
  vnew | file independent-retention-draft.txt
  call setline(1,'Independent native work')
  call feedkeys("i\<Esc>",'xt')
  let native = [win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat]
  let attempts = len(g:retention_requests)
  call wbx#reaction_history#suspend(function('s:idle'))
  let g:retention_context.available = 0 | let g:retention_context.degraded = 1
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal('♥️',s:badge(),'same valid source retains last-observed labels without a cached suffix')
  call assert_equal('WbxHistoryReactionsMuted',s:group())
  call assert_notmatch('unavailable',s:badge())
  for _ in range(3) | call wbx#reaction_history#schedule() | sleep 220m | endfor
  call assert_equal(attempts,len(g:retention_requests),'source degradation never starts a read')
  call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat],'health-only updates preserve foreground text/full undo/focus')
  call wbx#reaction_history#resume()
  let g:retention_context.sending = 0
  let g:retention_context.available = 1 | let g:retention_context.degraded = 0
  call wbx#reaction_history#schedule()
  call s:wait('len(g:retention_requests) == ' . (attempts+1))
  call assert_equal('WbxHistoryReactionsMuted',s:group(),'recovery does not freshen the previous observation before a result')
  call s:answer(attempts,'celebrate')
  call assert_match('🎉',s:badge())
  call assert_equal('WbxHistoryReactions',s:group())
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(attempts+1,len(g:retention_requests),'recovery admits one bounded refresh, not one per state notification')
  call add(s:checks,'ready-degraded-ready: cached labels, no degraded reads, one recovery read')

  " A callback crossing a failure/recovery cycle cannot become fresh afterward.
  call wbx#reaction_history#refresh('room','message')
  call wbx#reaction_history#schedule()
  call s:wait('len(g:retention_requests) == ' . (attempts+2))
  let held = attempts+1
  let g:retention_context.sending = 1
  call s:cycle()
  call s:answer(held,'heart')
  call assert_equal('🎉',s:badge(),'late pre-degradation callback cannot replace the retained observation')
  call assert_equal('WbxHistoryReactionsMuted',s:group())
  let g:retention_context.sending = 0
  call wbx#reaction_history#schedule()
  call s:wait('len(g:retention_requests) == ' . (attempts+3))
  call s:answer(attempts+2,'celebrate')
  call add(s:checks,'late completion fenced across fast failure/recovery')
  let before = len(g:retention_requests)
  let g:retention_context.sourceRevision += 1
  call wbx#reaction_history#schedule()
  call s:wait('len(g:retention_requests) == ' . (before+1))
  call assert_equal('WbxHistoryReactionsMuted',s:group(),'a coalesced failure/recovery still invalidates freshness')
  call s:answer(before,'celebrate')
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(before+1,len(g:retention_requests),'duplicate source revision does not repeat recovery')
  call add(s:checks,'coalesced health cycle: one bounded recovery refresh')

  " Content invalidation is destructive, even when the old content key returns.
  call s:seed()
  let g:retention_context.available = 0 | let g:retention_context.degraded = 1
  call wbx#reaction_history#schedule() | sleep 220m
  let blocks = getbufvar(s:history,'wbx_message_blocks')
  let blocks[0].key = 'changed'
  call setbufvar(s:history,'wbx_message_blocks',deepcopy(blocks))
  call wbx#reaction_history#schedule()
  call assert_notmatch('♥️',s:badge(),'changed content cannot reuse its old snapshot')
  let blocks[0].key = 'original'
  call setbufvar(s:history,'wbx_message_blocks',deepcopy(blocks))
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_notmatch('♥️',s:badge(),'returning to an old key cannot revive evicted presentation')
  call s:seed()
  let g:retention_context.available = 0 | let g:retention_context.degraded = 1
  call wbx#reaction_history#schedule() | sleep 220m
  call setbufvar(s:history,'wbx_message_blocks',[])
  call wbx#reaction_history#schedule() | sleep 220m
  call setbufvar(s:history,'wbx_message_blocks',deepcopy(blocks))
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_notmatch('♥️',s:badge(),'deleted/reintroduced message identity requires a new observation')
  call add(s:checks,'content change/deletion evicts rather than hiding reusable cache entries')

  " Prune/fence a held result immediately, not only after the debounce timer.
  call s:seed()
  call wbx#reaction_history#refresh('room','message')
  let g:retention_context.sending = 0
  let before = len(g:retention_requests)
  call wbx#reaction_history#schedule()
  call s:wait('len(g:retention_requests) == ' . (before+1))
  let blocks[0].key = 'changed'
  call setbufvar(s:history,'wbx_message_blocks',deepcopy(blocks))
  call wbx#reaction_history#schedule()
  let blocks[0].key = 'original'
  call setbufvar(s:history,'wbx_message_blocks',deepcopy(blocks))
  call wbx#reaction_history#schedule()
  let g:retention_context.sending = 1
  call s:answer(before,'heart')
  call assert_notmatch('♥️',s:badge(),'returning content cannot revive a response from before its invalidation')
  let incomplete = s:snapshot('heart') | let incomplete.groups = []
  call wbx#reaction_history#accept(incomplete)
  let g:retention_context.available = 0 | let g:retention_context.degraded = 1
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal('',s:badge(),'a cached partial empty observation stays quiet, never an authoritative zero')
  call add(s:checks,'partial empty observation remains quiet during degradation')

  for boundary in ['revocation','context','room','source','session','terminal','opt-out']
    call s:seed()
    let saved = deepcopy(g:retention_context)
    let g:retention_context.available = 0 | let g:retention_context.degraded = 1
    call wbx#reaction_history#schedule() | sleep 220m
    call assert_equal('WbxHistoryReactionsMuted',s:group())
    if boundary ==# 'revocation'
      let g:retention_context.epoch += 1 | let g:retention_context.enabled = 0
    elseif boundary ==# 'context'
      let g:retention_context.epoch += 1
    elseif boundary ==# 'room'
      let g:retention_context.roomId = 'other-room'
    elseif boundary ==# 'source'
      let g:retention_context.sourceEpoch += 1
    elseif boundary ==# 'session'
      let g:retention_context.sessionId = repeat('b',32)
    elseif boundary ==# 'terminal'
      let g:retention_context.degraded = 0
    else
      let g:retention_context.enabled = 0
    endif
    call wbx#reaction_history#schedule() | sleep 220m
    call assert_notmatch('♥️',s:badge(),boundary . ': invalidation still clears degraded presentation')
    let g:retention_context = saved
    call wbx#reaction_history#schedule() | sleep 220m
    call assert_notmatch('♥️',s:badge(),boundary . ': returning identity cannot revive old presentation')
    call add(s:checks,boundary . ': presentation invalidated')
  endfor
  for request in g:retention_requests
    call assert_equal('messages.reactionsBatch',request.method,'presentation never prepares/submits/inspects a write or sends a receipt')
    call assert_equal('passive-reactions',request.policy)
    call assert_equal(['message'],request.params.messageIds)
  endfor
  call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),&breakat])
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#reaction_history#invalidate()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'requests':len(g:retention_requests)})],$WBX_EDITOR_RESULT)
qa!
