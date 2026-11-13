" Actual accepted-state/context/revocation bridge; no process, SDK or live service.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=45 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'backend':['/bin/false'],'images':0,'notifications':0,'mark_read_on_open':0,
      \ 'people_status':0,'upcoming_meetings':0,'persist_drafts':0,'folds':0}
runtime plugin/wbx.vim
function! s:publish() abort
  let s:state.revision += 1
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
endfunction
function! s:badge() abort
  return get(get(getbufvar(wbx#buffers().history,'wbx_reaction_decorations',{}),'message',{}),'text','')
endfunction
function! s:group() abort
  return get(get(getbufvar(wbx#buffers().history,'wbx_reaction_decorations',{}),'message',{}),'group','')
endfunction
function! s:seed() abort
  call wbx#reaction_history#accept({'roomId':'room','messageId':'message','observedAt':100,'partial':v:true,
        \ 'unknown':v:true,'groups':[{'reaction':'heart','label':'Heart'}]})
  call assert_match('♥️',s:badge())
endfunction
try
  call wbx#buffers()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'),[])
  let s:state = {'revision':0,'state':'ready','mode':'live','ready':v:true,'sending':v:true,
        \ 'room':{'id':'room','title':'Synthetic','type':'group'},'rooms':[{'id':'room','title':'Synthetic','type':'group'}],
        \ 'messages':[{'id':'message','author':'Author','created':'2026-11-17T12:00:00Z','text':'Original'}],
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},
        \ 'readStatus':'ready','reactionSource':{'epoch':1,'revision':0,'degraded':v:false}}
  call call(function('<SNR>' . sid . '_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','message-actions-v1','local-context-v1'],
        \ 'messageReactions':['pinned-internal-v1','viewport-batch-v1']}}])
  call win_gotoid(win_findbuf(wbx#buffers().history)[0])
  call s:seed()
  let s:state.readStatus = 'failed' | let s:state.reactionSource.degraded = v:true
  let s:state.reactionSource.revision += 1
  call s:publish() | sleep 220m
  call assert_true(wbx#reaction_context().degraded)
  call assert_false(wbx#reaction_context().available)
  call assert_equal('♥️',s:badge(),'actual state marker retains presentation without a cached suffix')
  call assert_equal('WbxHistoryReactionsMuted',s:group())
  let s:state.readStatus = 'ready' | let s:state.reactionSource.degraded = v:false
  call s:publish() | sleep 220m
  call assert_equal('WbxHistoryReactionsMuted',s:group(),'ready state does not pretend to have reread the observation')
  call s:seed()
  let s:state.readStatus = 'failed' | let s:state.reactionSource.degraded = v:true
  let s:state.reactionSource.revision += 1
  call s:publish() | sleep 220m
  let s:state.messages[0].text = 'Changed'
  call s:publish() | sleep 220m
  let s:state.messages[0].text = 'Original'
  call s:publish() | sleep 220m
  call assert_notmatch('♥️',s:badge(),'real content projection evicts snapshots even when the original text returns')
  let s:state.readStatus = 'ready' | let s:state.reactionSource.degraded = v:false
  call s:publish()
  call s:seed()
  let s:state.readStatus = 'failed' | let s:state.reactionSource.degraded = v:true
  let s:state.reactionSource.revision += 1
  call s:publish() | sleep 220m
  call assert_equal('WbxHistoryReactionsMuted',s:group())
  call wbx#_receive({'jsonrpc':'2.0','method':'room.revoked','params':{'roomId':'room'}})
  call assert_equal('',s:badge(),'revocation removes cached labels synchronously, before a later state packet')
  let s:state.room = v:null | let s:state.messages = [] | let s:state.ready = v:false
  call s:publish()
  let s:state.room = {'id':'room','title':'Synthetic','type':'group'}
  let s:state.messages = [{'id':'message','author':'Author','created':'2026-11-17T12:00:00Z','text':'Original'}]
  let s:state.ready = v:true
  let s:state.readStatus = 'ready' | let s:state.reactionSource.degraded = v:false
  call s:publish() | sleep 220m
  call assert_notmatch('♥️',s:badge())
  call s:seed()
  let s:state.readStatus = 'failed' | let s:state.reactionSource.degraded = v:true
  let s:state.reactionSource.revision += 1
  call s:publish() | sleep 220m
  let s:state.localContext.sessionId = repeat('b',32)
  call s:publish() | sleep 220m
  call assert_notmatch('♥️',s:badge(),'account/session replacement cannot reuse exact-looking message IDs')
  let s:state.readStatus = 'ready' | let s:state.reactionSource.degraded = v:false
  call s:publish()
  call s:seed()
  let s:state.readStatus = 'failed'
  let s:state.reactionSource = {'epoch':2,'revision':0,'degraded':v:false}
  call s:publish() | sleep 220m
  call assert_notmatch('♥️',s:badge(),'terminal worker loss has no retention marker')
  let s:state.localContext.sessionId = repeat('c',32)
  let s:state.ready = v:false | let s:state.loading = v:true | let s:state.historyLatest = v:false
  let s:state.historyCached = v:true
  let s:state.reactionSource = {'epoch':3,'revision':1,'degraded':v:true}
  let s:state.cachedReactions = [{'roomId':'room','messageId':'message','observedAt':localtime()*1000,
        \ 'partial':v:true,'unknown':v:false,'groups':[{'reaction':'heart','label':'Heart','count':3,'mine':v:true}]}]
  call s:publish() | sleep 220m
  call assert_true(get(wbx#state(),'historyCached',0),'restored messages are accepted only as not-ready display')
  call assert_match('Saved history.*stale display only',join(getline(1,'$'),"\n"))
  call assert_equal('♥️ 3 (you)',s:badge(),'disk observations paint while startup reads are throttled')
  call assert_equal('WbxHistoryReactionsMuted',s:group())
  call assert_false(wbx#reaction_context().available,'cached text cannot admit a passive or explicit target read')
  let native = [getline(1,'$'),undotree(),&breakat,win_getid()]
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_equal(native,[getline(1,'$'),undotree(),&breakat,win_getid()],'restored reactions preserve text/full undo/focus/breakat')
  let forged = deepcopy(s:state)
  let forged.cachedReactions[0].groups[0].own = repeat('a',32)
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':forged}),'persistent display never carries own removal handles')
  let forged = deepcopy(s:state) | let forged.ready = v:true
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':forged}),'cached data cannot masquerade as ready history')
  call wbx#reaction_history#refresh('room','message') | sleep 220m
  call assert_notmatch('♥️',s:badge(),'explicit invalidation cannot immediately restore an older disk observation')
  call remove(s:state,'historyCached') | let s:state.ready = v:true | let s:state.loading = v:false
  let s:state.reactionSource.readable = v:true
  call s:publish() | sleep 220m
  call assert_true(wbx#reaction_context().available,'reaction transport readiness is independent of unread discovery failure')
  call assert_equal('failed',wbx#state().readStatus,'reaction availability never freshens unread status')
  call wbx#reaction_history#invalidate() | call wbx#reaction_history#schedule()
  call assert_match('♥️',s:badge())
  call wbx#_receive({'jsonrpc':'2.0','method':'room.revoked','params':{'roomId':'room'}})
  call wbx#reaction_history#schedule() | sleep 220m
  call assert_notmatch('♥️',s:badge(),'revocation also removes pending restore DTOs before a later state packet')
  call assert_false(wbx#transport#running(),'all acceptance-state tests are process/network free')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
