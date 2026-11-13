" Real coordinator/renderer/scheduler: A -> held B -> A, no SDK/network.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=55 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:return_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:return_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:return_starts += 1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:return_running=0','call wbx#_exit(0)','endfunction'],s:stub . '/autoload/wbx/transport.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:return_running=1 | let g:return_starts=0 | let g:return_requests=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,
      \ 'upcoming_meetings':0,'mark_read_on_open':0,'persist_drafts':0,'folds':0}
runtime plugin/wbx.vim
let s:checks=[] | let s:drawn=[] | let s:timings=[]
function! s:publish() abort
  let s:state.revision=wbx#state().revision+1
  if !wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':s:state}) | throw 'Invalid return fixture state' | endif
  let native=[win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat]
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
  if exists('s:history') && bufnr('%')!=s:history
    call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat],
          \ 'background return/health callbacks preserve native text/full undo/focus')
  endif
endfunction
function! s:space(id, ...) abort
  let s:state.room={'id':a:id,'type':'group','title':'Space '.a:id}
  let s:state.ready=v:false | let s:state.messages=[]
  call s:publish()
  let s:state.ready=v:true
  let s:state.messages=[{'id':'message-'.a:id,'author':'Author','created':'2026-11-17T12:00:00Z',
        \ 'text':a:0 ? a:1 : 'Unchanged exact content '.a:id}]
  call s:publish()
  call win_execute(s:history_window,'call cursor(b:wbx_message_blocks[0].body,1)')
  call win_execute(s:history_window,'normal! zt')
  redraw!
endfunction
function! s:wait(count) abort
  let start=reltime()
  while len(g:return_requests)<a:count && reltimefloat(reltime(start))<2 | sleep 10m | endwhile
  call assert_equal(a:count,len(g:return_requests),'bounded next passive read')
endfunction
function! s:answer(index, reaction) abort
  let request=g:return_requests[a:index]
  let items=map(copy(request.params.messageIds),
        \ '{"roomId":request.params.roomId,"messageId":v:val,"observedAt":100,"partial":v:true,"unknown":v:true,'
        \ . '"groups":empty(a:reaction) ? [] : [{"reaction":a:reaction,"label":a:reaction ==# "heart" ? "Heart" : "Celebrate"}]}')
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':{'roomId':request.params.roomId,'items':items}})
endfunction
function! s:badge() abort
  return get(get(getbufvar(s:history,'wbx_reaction_decorations',{}),'message-A',{}),'text','')
endfunction
function! s:group() abort
  return get(get(getbufvar(s:history,'wbx_reaction_decorations',{}),'message-A',{}),'group','')
endfunction
function! s:draw(case, expected) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  let origin=win_getid()
  call win_gotoid(s:history_window)
  let row=getbufvar(s:history,'wbx_message_blocks')[0].body
  call cursor(row,1)
  normal! zt
  redraw!
  let info=getwininfo(win_getid())[0]
  let top=screenpos(win_getid(),row,1).row
  let text=join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(top+1,v:val)'),'')
  call assert_match(a:expected,text,a:case.': actual reaction row is drawn before old read completion')
  call add(s:drawn,{'case':a:case,'text':trim(text)})
  call win_gotoid(origin)
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>'.sid.'_layout'),[])
  let s:state={'revision':1,'state':'ready','mode':'live','ready':v:true,'sending':v:false,
        \ 'room':{'id':'A','title':'Space A','type':'group'},
        \ 'rooms':[{'id':'A','title':'Space A','type':'group'},{'id':'B','title':'Space B','type':'group'}],
        \ 'messages':[{'id':'message-A','author':'Author','created':'2026-11-17T12:00:00Z','text':'Unchanged exact content A'}],
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},
        \ 'readStatus':'ready','reactionSource':{'epoch':1,'revision':0,'degraded':v:false}}
  call call(function('<SNR>'.sid.'_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','message-actions-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1','viewport-batch-v1','progressive-v1']}}])
  let s:history=wbx#buffers().history | let s:history_window=win_findbuf(s:history)[0]
  call win_gotoid(s:history_window)
  call cursor(b:wbx_message_blocks[0].body,1)
  normal! zt
  redraw!
  let g:return_clock=localtime()
  let reaction_sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/reaction_history.vim$"')[0].sid
  execute 'function! <SNR>'.reaction_sid."_now() abort\nreturn g:return_clock\nendfunction"
  call s:wait(1) | call s:answer(0,'heart')
  call assert_match('♥️',s:badge())
  let s:state.messages[0].author = 'Resolved display name'
  call s:publish()
  call assert_match('♥️',s:badge(),'name resolution cannot invalidate reactions on unchanged message content')
  botright 5new | file independent-return-work.txt
  call setline(1,'Independent unsent native work') | call feedkeys("i\<Esc>",'xt')
  call append(1,'Unsynced work during the first switch')
  call assert_equal(0,undotree().synced)
  for health in ['ready','degraded']
    call s:space('B')
    let held=len(g:return_requests)
    call s:wait(held+1)
    call assert_equal('B',g:return_requests[held].params.roomId)
    if health==# 'degraded'
      let s:state.readStatus='failed' | let s:state.reactionSource.degraded=v:true
      let s:state.reactionSource.revision+=1 | call s:publish()
    endif
    let started=reltime()
    call s:space('A')
    let elapsed=reltimefloat(reltime(started))*1000
    call assert_match('♥️',s:badge(),health.': return must restore known same-source data without waiting for B')
    if s:badge() !~# '♥️' | throw health.': previously loaded A snapshot was discarded while B is still physically pending' | endif
    call assert_notmatch('unavailable',s:badge())
    if health==# 'degraded' | call assert_equal('WbxHistoryReactionsMuted',s:group()) | endif
    call assert_notmatch('cached',s:badge())
    call assert_true(elapsed<1000,'same-source return is a local restore, not a 30-second recovery')
    call add(s:timings,{'case':health,'return_ms':elapsed,'B_still_held':1})
    call s:draw(health,'♥️')
    let before=len(g:return_requests)
    let g:return_clock+=30
    call wbx#reaction_history#schedule() | sleep 220m
    call assert_equal(before,len(g:return_requests),'display reuse never frees the outstanding B reservation')
    call assert_match('♥️',s:badge(),'30 seconds of logical read delay must not erase known presentation')
    if health==# 'degraded'
      let s:state.readStatus='ready' | let s:state.reactionSource.degraded=v:false | call s:publish()
    endif
    let request=g:return_requests[held]
    call assert_true(request.params.progressive)
    call wbx#_receive({'jsonrpc':'2.0','method':'messages.reactionProgress','params':{'requestId':request.id,
          \ 'snapshot':{'roomId':request.params.roomId,'messageId':request.params.messageIds[0],
          \ 'observedAt':g:return_clock*1000,'partial':v:true,'unknown':v:false,'groups':[{'reaction':'celebrate','label':'Celebrate'}]}}})
    call assert_match('♥️',s:badge(),'late progress for held B cannot replace the current A observation')
    call assert_notmatch('🎉',s:badge())
    call assert_equal(before,len(g:return_requests),'late progress does not release the pending physical request')
    call s:answer(held,'celebrate')
    call assert_match('♥️',s:badge(),'late B completion cannot replace A')
    call assert_notmatch('🎉',s:badge())
    if health==# 'degraded'
      call s:wait(before+1)
      call assert_equal('A',g:return_requests[-1].params.roomId)
      call assert_equal('WbxHistoryReactionsMuted',s:group(),'recovery cannot falsely freshen cached data')
      call s:answer(before,'heart')
    else
      call wbx#reaction_history#schedule() | sleep 220m
      call assert_equal(before,len(g:return_requests),'fresh A reuses its five-minute observation rather than making a cold read')
    endif
    call add(s:checks,health.': A -> held B -> A; immediate snapshot, serialized read, stale callback fenced')
  endfor
  let before=len(g:return_requests)
  call s:space('B') | call s:wait(before+1) | call s:answer(before,'celebrate')
  call s:space('A')
  call assert_match('♥️',s:badge(),'fully settled A/B navigation also reuses A immediately')
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(before+1,len(g:return_requests),'neither completed nor held B forces a cold A request')
  call add(s:checks,'A -> completed B -> A reuses the unchanged five-minute observation')

  " Changed content, revocation, new source/account and opt-out must still evict.
  let s:state.sending=v:true
  call s:space('B') | call s:space('A','Changed exact content A')
  call assert_notmatch('♥️',s:badge(),'a returning changed target cannot reuse its former snapshot')
  call s:space('A')
  call assert_notmatch('♥️',s:badge(),'returning old content cannot resurrect evicted presentation')
  call add(s:checks,'content invalidation is destructive, not a hidden reusable snapshot')
  for boundary in ['source','session','revoked','terminal','opt-out']
    call wbx#reaction_history#accept({'roomId':'A','messageId':'message-A','observedAt':100,'partial':v:true,'unknown':v:true,
          \ 'groups':[{'reaction':'heart','label':'Heart'}]})
    call assert_match('♥️',s:badge())
    call s:space('B')
    if boundary==# 'source'
      let s:state.reactionSource.epoch+=1
    elseif boundary==# 'session'
      let s:state.localContext.sessionId=repeat('b',32)
    elseif boundary==# 'revoked'
      call wbx#_receive({'jsonrpc':'2.0','method':'room.revoked','params':{'roomId':'A'}})
    elseif boundary==# 'terminal'
      let s:state.readStatus='failed' | let s:state.reactionSource.degraded=v:false
    else
      let g:wbx_tui.reactions=0
    endif
    call s:publish() | call s:space('A')
    call assert_notmatch('♥️',s:badge(),boundary.': cached data cannot cross an invalid lifetime')
    let s:state.readStatus='ready' | let g:wbx_tui.reactions=1 | call s:publish()
    call assert_notmatch('♥️',s:badge(),boundary.': returning lifetime does not resurrect evicted data')
    call add(s:checks,boundary.': no cached resurrection')
  endfor
  call wbx#reaction_history#accept({'roomId':'A','messageId':'message-A','observedAt':100,'partial':v:true,'unknown':v:true,
        \ 'groups':[{'reaction':'heart','label':'Heart'}]})
  call s:space('B')
  let s:state.messages=[{'id':'message-A','author':'Author','created':'2026-11-17T12:00:00Z','text':'Unchanged exact content A'}]
  call s:publish()
  call assert_notmatch('♥️',s:badge(),'equal message IDs/content in another room are not the same cache target')
  call add(s:checks,'exact room identity participates in reuse, not only message ID/content')
  for index in range(70)
    let room='bounded-'.index
    call s:space(room)
    call wbx#reaction_history#accept({'roomId':room,'messageId':'message-'.room,'observedAt':100,'partial':v:true,'unknown':v:true,
          \ 'groups':[{'reaction':'heart','label':'Heart'}]})
    call assert_true(wbx#reaction_history#diagnostics().cacheEntries<=64,'one global presentation cache remains bounded across rooms')
  endfor
  call add(s:checks,'70 room visits retain at most 64 presentation-cache entries')
  call s:space('A')
  call wbx#reaction_history#accept({'roomId':'A','messageId':'message-A','observedAt':100,'partial':v:true,'unknown':v:true,'groups':[]})
  call s:space('B')
  let s:state.readStatus='failed' | let s:state.reactionSource.degraded=v:true
  let s:state.reactionSource.revision+=1 | call s:publish()
  sleep 220m
  call assert_true(wbx#reaction_history#diagnostics().cacheEntries<=64,'unavailable rows also share the total cache cap')
  call s:space('A') | sleep 220m
  call assert_equal('',s:badge(),'retained incomplete empty data stays quiet, never zero or unavailable')
  call assert_true(wbx#reaction_history#diagnostics().cacheEntries<=64)
  call add(s:checks,'retained partial emptiness stays quiet and all unavailable rows share the 64-entry cap')
  let s:state.readStatus='ready' | let s:state.reactionSource.degraded=v:false
  call s:publish()
  let source=remove(s:state,'reactionSource')
  call s:publish()
  call assert_false(wbx#reaction_context().retain,'legacy source metadata cannot prove a reusable source lifetime')
  call wbx#reaction_history#accept({'roomId':'A','messageId':'message-A','observedAt':100,'partial':v:true,'unknown':v:true,
        \ 'groups':[{'reaction':'heart','label':'Heart'}]})
  call s:space('B') | call s:space('A')
  call assert_notmatch('♥️',s:badge(),'legacy backends remain view-scoped rather than assuming source continuity')
  let s:state.reactionSource=source | call s:publish()
  call assert_notmatch('♥️',s:badge(),'restoring source metadata cannot revive evicted legacy presentation')
  call add(s:checks,'missing source-lifetime proof takes the conservative legacy path')
  call assert_equal(0,g:return_starts)
  for request in g:return_requests
    call assert_equal('messages.reactionsBatch',request.method,'return handling issues no prepare/inspect/submit/receipt/history requests')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:return_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'timings':s:timings,
      \ 'requests':map(copy(g:return_requests),'{"method":v:val.method,"room":v:val.params.roomId}'),'backendStarts':g:return_starts})],$WBX_EDITOR_RESULT)
qa!
