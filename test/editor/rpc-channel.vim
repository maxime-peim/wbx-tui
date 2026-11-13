" Standalone request-owner contract: no application, editor jobs or provider.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let g:channel_writes=[] | let g:channel_notices=[] | let g:channel_answers=[]
let g:channel_ready=0 | let g:channel_running=0 | let g:channel_ensures=0 | let g:channel_allow=1
let g:channel_reset_on_send=0
let s:checks=[]
function! s:status() abort
  return {'ready':g:channel_ready,'passiveReady':g:channel_ready && g:channel_running}
endfunction
function! s:send(wire) abort
  call add(g:channel_writes,json_decode(a:wire))
  if g:channel_reset_on_send
    let g:channel_reset_on_send=0
    call wbx#rpc_channel#reset(g:channel)
  endif
endfunction
function! s:notice(text) abort
  call add(g:channel_notices,a:text)
endfunction
function! s:hello(response) abort
  let g:channel_ready=1
  call wbx#rpc_channel#flush(g:channel)
endfunction
function! s:ensure() abort
  let g:channel_ensures+=1
  if !g:channel_allow | return 0 | endif
  if !g:channel_running
    let g:channel_running=1 | let g:channel_ready=0
    call wbx#rpc_channel#reset(g:channel)
    call wbx#rpc_channel#call(g:channel,'hello',{'version':1},function('s:hello'))
  endif
  return 1
endfunction
function! s:answer(tag, value) abort
  call add(g:channel_answers,[a:tag,a:value])
endfunction
function! s:follow(response) abort
  call assert_equal(0,wbx#rpc_channel#diagnostics(g:channel).pending,'retire correlation before a reentrant callback')
  let g:channel_follow=wbx#rpc_channel#call(g:channel,'test.follow',{},function('s:answer',['follow']))
endfunction
function! s:receive(id, ...) abort
  let value=a:0 ? {'jsonrpc':'2.0','id':a:id,'error':a:1} : {'jsonrpc':'2.0','id':a:id,'result':v:null}
  call assert_true(wbx#protocol#valid(value))
  call wbx#rpc_channel#response(g:channel,value)
endfunction
try
  let ports={'Ensure':function('s:ensure'),'Status':function('s:status'),'Send':function('s:send'),'Notify':function('s:notice')}
  let g:channel=wbx#rpc_channel#new(ports)
  let other=wbx#rpc_channel#new(ports)
  call assert_equal({'pending':0,'queued':0,'lastRequest':0},wbx#rpc_channel#diagnostics(g:channel))
  call assert_equal(-1,wbx#rpc_channel#call(g:channel,'messages.reactions',{},function('s:answer',['cold']),'passive-reactions'))
  call assert_equal(0,g:channel_ensures) | call assert_equal([],g:channel_writes)
  call add(s:checks,'cold passive request neither starts nor queues')

  let first=wbx#rpc_channel#call(g:channel,'test.first',{'literal':'100% | no expression'},function('s:answer',['first']))
  let second=wbx#rpc_channel#call(g:channel,'test.second',{},function('s:answer',['second']))
  call assert_equal(2,first,'reentrant hello allocates before the original request')
  call assert_equal(3,second)
  call assert_equal(['hello'],map(copy(g:channel_writes),'v:val.method'))
  call assert_equal({'pending':3,'queued':2,'lastRequest':3},wbx#rpc_channel#diagnostics(g:channel))
  call s:receive(1)
  call assert_equal(['hello','test.first','test.second'],map(copy(g:channel_writes),'v:val.method'))
  call assert_equal('100% | no expression',g:channel_writes[1].params.literal)
  call assert_equal(['id','jsonrpc','method','params'],sort(keys(g:channel_writes[1])))
  call add(s:checks,'one startup hello drains FIFO after the handshake')

  call s:receive(second) | call s:receive(first) | call s:receive(second)
  call s:receive(999)
  call assert_equal(['second','first'],map(copy(g:channel_answers),'v:val[0]'),'out-of-order exactly-once correlation')
  call assert_equal(0,wbx#rpc_channel#diagnostics(g:channel).pending)
  call assert_equal({'pending':0,'queued':0,'lastRequest':0},wbx#rpc_channel#diagnostics(other),'owners are independent, not a module-global registry')
  call add(s:checks,'responses correlate once; unknown/duplicate responses are inert')

  let ensures=g:channel_ensures
  let passive=wbx#rpc_channel#call(g:channel,'messages.reactionsBatch',{},function('s:answer',['passive']),'passive-reactions')
  call s:receive(passive,{'code':-32034,'message':'Reaction summary unavailable (worker:busy). PRIVATE provider body'})
  call assert_equal([],g:channel_notices)
  call assert_equal('passive',g:channel_answers[-1][0])
  call assert_equal(ensures,g:channel_ensures,'admitted passive reads never invoke startup')
  let explicit=wbx#rpc_channel#call(g:channel,'messages.reactions',{},function('s:answer',['explicit']))
  call s:receive(explicit,{'code':-32034,'message':'Reaction summary unavailable (worker:busy). PRIVATE provider body'})
  call assert_match('worker:busy',g:channel_notices[-1])
  call assert_notmatch('PRIVATE',g:channel_notices[-1])
  let ordinary=wbx#rpc_channel#call(g:channel,'rooms.select',{},function('s:answer',['ordinary']),'passive-reactions')
  call s:receive(ordinary,{'code':-32000,'message':'Ordinary explicit failure remains visible'})
  call assert_equal('Ordinary explicit failure remains visible',g:channel_notices[-1])
  call add(s:checks,'passive error policy is per-request and finite; explicit errors remain visible')

  let old=wbx#rpc_channel#call(g:channel,'test.old',{},function('s:answer',['old']))
  let answer_count=len(g:channel_answers)
  call wbx#rpc_channel#reset(g:channel)
  let fresh=wbx#rpc_channel#call(g:channel,'test.fresh',{},function('s:answer',['fresh']))
  call assert_true(fresh>old,'reset never reuses correlation IDs')
  call s:receive(old) | call assert_equal(answer_count,len(g:channel_answers))
  call s:receive(fresh) | call assert_equal('fresh',g:channel_answers[-1][0])
  call add(s:checks,'transport reset drops callbacks without replay or ID reuse')

  let parent=wbx#rpc_channel#call(g:channel,'test.parent',{},function('s:follow'))
  call s:receive(parent)
  call assert_true(g:channel_follow>parent)
  call assert_equal(1,wbx#rpc_channel#diagnostics(g:channel).pending)
  call s:receive(parent)
  call assert_equal(1,wbx#rpc_channel#diagnostics(g:channel).pending,'duplicate parent cannot retire its child')
  call s:receive(g:channel_follow)
  call assert_equal('follow',g:channel_answers[-1][0])
  call add(s:checks,'reentrant callbacks have distinct correlation and cannot be retired by an old duplicate')

  let g:channel_ready=0
  for index in range(32)
    call assert_true(wbx#rpc_channel#call(g:channel,'test.queued',{'index':index},function('s:answer',['queued']))>0)
  endfor
  let before=wbx#rpc_channel#diagnostics(g:channel)
  call assert_equal(32,before.queued)
  call assert_equal(-1,wbx#rpc_channel#call(g:channel,'test.overflow',{},function('s:answer',['overflow'])))
  call assert_equal(32,wbx#rpc_channel#diagnostics(g:channel).pending)
  call assert_match('startup queue is full',g:channel_notices[-1])
  call assert_equal(before.lastRequest+2,wbx#rpc_channel#next_id(g:channel))
  call add(s:checks,'startup queue remains bounded at 32; refusal retains no callback')

  let sent=len(g:channel_writes)
  let g:channel_ready=1 | let g:channel_reset_on_send=1
  call wbx#rpc_channel#flush(g:channel)
  call assert_equal(sent+1,len(g:channel_writes),'reset during a flush fences the remaining old queue')
  call assert_equal(0,wbx#rpc_channel#diagnostics(g:channel).pending)
  call assert_equal(0,wbx#rpc_channel#diagnostics(g:channel).queued)
  call add(s:checks,'a reentrant transport reset cannot replay the detached startup queue')

  let before=wbx#rpc_channel#diagnostics(g:channel)
  let other_id=wbx#rpc_channel#call(other,'test.other',{},function('s:answer',['other']))
  call assert_equal(1,other_id)
  call wbx#rpc_channel#response(other,{'jsonrpc':'2.0','id':other_id,'result':v:null})
  call assert_equal('other',g:channel_answers[-1][0])
  call assert_equal(before,wbx#rpc_channel#diagnostics(g:channel),'another owner does not share IDs or pending state')
  call add(s:checks,'separate channel instances use independent state and correlation')

  let g:channel_allow=0 | let before=wbx#rpc_channel#diagnostics(g:channel)
  call assert_equal(-1,wbx#rpc_channel#call(g:channel,'test.denied',{},function('s:answer',['denied'])))
  call assert_equal(before,wbx#rpc_channel#diagnostics(g:channel),'failed startup does not allocate a request')
  call add(s:checks,'failed startup leaves no queued or pending request')
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'scope':'standalone inert channel; no jobs/provider/application'})],$WBX_EDITOR_RESULT)
qa!
