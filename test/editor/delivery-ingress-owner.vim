" Actual draft matching/uncertainty, controlled downstream effects; no transport/service.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#unread#sent(room, id) abort',
      \ 'call add(g:ingress_effects,["unread",a:room,a:id])','endfunction'],s:stub.'/autoload/wbx/unread.vim')
call writefile(['function! wbx#notifications#sent(room, id) abort',
      \ 'call add(g:ingress_effects,["notification",a:room,a:id])','endfunction'],s:stub.'/autoload/wbx/notifications.vim')
call writefile(['function! wbx#uploads#delivered(pending, result) abort',
      \ 'call add(g:ingress_effects,["upload",deepcopy(a:pending),deepcopy(a:result)])','endfunction'],s:stub.'/autoload/wbx/uploads.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:ingress_effects=[] | let g:wbx_tui={'persist_drafts':0}
let s:checks=[] | let s:drawn=[] | let s:invalid=0 | let s:reads=0 | let s:serial=0
let s:state={'state':'ready','localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
function! s:state() abort
  let s:reads+=1
  return s:state
endfunction
function! s:clear(pending, session, retries) abort
  call assert_false(wbx#drafts#pending(),'draft evidence settles before any local side effect')
  call add(g:ingress_effects,['clear',deepcopy(a:pending),a:session,a:retries])
endfunction
function! s:notice(message) abort
  call assert_true(wbx#drafts#rooms([{'id':'A'}])[0].localDraft,'badge observation occurs before notice/render/event')
  call add(g:ingress_effects,['notice',a:message])
endfunction
function! s:render() abort
  call add(g:ingress_effects,['render'])
endfunction
function! s:event(name, value) abort
  call add(g:ingress_effects,['event',a:name,deepcopy(a:value)])
  let a:value.message='Changed only in detached event payload'
endfunction
function! s:invalid() abort
  let s:invalid+=1
endfunction
function! s:register(...) abort
  let s:serial+=1
  let params=extend({'requestId':'ingress-'.s:serial,'roomId':'A','text':getline(1)},a:0 ? a:1 : {})
  call wbx#drafts#register(params.requestId,params,bufnr('%'),b:changedtick)
  return params
endfunction
function! s:result(params, status) abort
  return extend(deepcopy(a:params),{'status':a:status,'message':'Synthetic '.a:status,'messageId':'result-'.s:serial})
endfunction
function! s:receive(result) abort
  let g:ingress_effects=[]
  call wbx#delivery_ingress#receive(s:owner,a:result)
endfunction
try
  let buffer=wbx#workspace#buffer('wbx://compose/A','compose','A')
  execute 'buffer '.buffer
  call setline(1,'Native draft evidence') | call feedkeys("i\<Esc>",'xt')
  let b:wbx_registered_draft=1
  let cpo=&cpoptions
  let s:owner=wbx#delivery_ingress#new({'State':function('s:state'),'Clear':function('s:clear'),
        \ 'ProtocolError':function('s:invalid'),'Notify':function('s:notice'),'Render':function('s:render'),'Event':function('s:event')})
  call assert_equal(cpo,&cpoptions) | call assert_equal(['ports'],keys(s:owner))
  let request=s:register() | let result=s:result(request,'sent')
  call s:receive(result)
  call assert_equal(['unread','notification','clear','upload','notice','render','event'],map(copy(g:ingress_effects),'v:val[0]'))
  call assert_equal(['A',result.messageId],g:ingress_effects[0][1:])
  call assert_equal([repeat('a',32),3],g:ingress_effects[2][2:])
  call assert_equal(result.requestId,g:ingress_effects[2][1].requestId)
  call assert_equal('WbxDelivery',g:ingress_effects[-1][1])
  call assert_equal('Synthetic sent',result.message,'event hooks cannot mutate received result')
  let reads=s:reads | call s:receive(result)
  call assert_equal([],g:ingress_effects) | call assert_equal(reads,s:reads)
  call add(s:checks,'construction is inert; exact sent outcome settles once before ordered echo suppression/local clear/upload/badge/notice/render/detached event effects')

  for mismatch in ['roomId','parentId','text','attachmentId','draftId','format']
    let request=s:register({'parentId':'root','attachmentId':repeat('a',32),'draftId':'draft','format':'markdown'})
    let result=s:result(request,'sent') | let result[mismatch]='wrong'
    let invalid=s:invalid | let reads=s:reads
    call s:receive(result)
    call assert_equal(invalid+1,s:invalid,mismatch) | call assert_true(wbx#drafts#pending())
    call assert_equal([],g:ingress_effects) | call assert_equal(reads,s:reads)
    call wbx#drafts#failed(request.requestId,0)
  endfor
  call add(s:checks,'exact request/room/parent/text/file/draft/format matching stays in drafts; known mismatches are protocol failures without clear/render/event or consuming pending evidence')

  for status in ['unknown','failed','sent']
    let request=s:register() | let result=s:result(request,status)
    call s:receive(result)
    call assert_false(wbx#drafts#pending())
    call assert_equal(status==# 'unknown',wbx#drafts#uncertain('A'))
    if status!=# 'sent' | call assert_equal(['upload','notice','render','event'],map(copy(g:ingress_effects),'v:val[0]')) | endif
    call assert_equal(['Native draft evidence'],getline(1,'$'))
    call wbx#drafts#resolve('A')
  endfor
  call add(s:checks,'unknown retains possible-write evidence; failed does not invent uncertainty; only sent requests a local clear and downstream upload policy remains separate')

  let previous=deepcopy(s:state) | let next=deepcopy(previous) | let next.revision=2 | let next.room={'id':'B'}
  let request=s:register()
  call wbx#delivery_ingress#observe(previous,next) | call assert_true(wbx#drafts#pending(),'same-session view/revision changes do not retire a request')
  let next.localContext.sessionId=repeat('b',32)
  call wbx#delivery_ingress#observe(previous,next)
  call assert_false(wbx#drafts#pending()) | call assert_true(wbx#drafts#uncertain('A'))
  let evidence=wbx#drafts#evidence('A')
  call wbx#delivery_ingress#observe(next,next) | call assert_equal(evidence,wbx#drafts#evidence('A'))
  let current=s:register()
  call s:receive(s:result(request,'sent'))
  call assert_true(wbx#drafts#pending()) | call assert_equal([],g:ingress_effects)
  call wbx#drafts#failed(current.requestId,0) | call wbx#drafts#resolve('A')
  call add(s:checks,'accepted session replacement retires pending authority through existing uncertainty evidence; same-session selection changes and retired results cannot release replacement work')

  for transition in ['failed','idle','legacy-to-session','session-to-legacy']
    let previous=deepcopy(s:state) | let next=deepcopy(previous)
    if transition==# 'legacy-to-session' | call remove(previous,'localContext')
    elseif transition==# 'session-to-legacy' | call remove(next,'localContext')
    else | let next.state=transition | endif
    let request=s:register()
    call wbx#delivery_ingress#observe(previous,next)
    call assert_false(wbx#drafts#pending(),transition) | call assert_true(wbx#drafts#uncertain('A'),transition)
    call wbx#drafts#resolve('A')
  endfor
  call assert_equal(['ports'],keys(s:owner))
  call add(s:checks,'idle/failure retains original disconnect policy; entering/leaving session-aware operation conservatively retains possible writes without another session/uncertainty registry')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Native draft evidence',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Native draft evidence"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'scope':'actual draft evidence/matching and native view; inert downstream effects, no RPC/service'})],$WBX_EDITOR_RESULT)
qa!
