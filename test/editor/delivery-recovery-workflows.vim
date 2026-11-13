" Public destination-bound recovery with real RPC, intent/draft/render owners; inert physical transport only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:recovery_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:recovery_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:recovery_flow_running=1','let g:recovery_flow_starts+=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:recovery_flow_running=0','call wbx#_exit(0)','endfunction'],
      \ s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:recovery_flow_running=1 | let g:recovery_flow_requests=[] | let g:recovery_flow_starts=0
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:session='a'
function! s:state(room) abort
  let rooms=[{'id':'A','title':'Recovery A','type':'group'},{'id':'B','title':'Recovery B','type':'group'}]
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'sending':v:false,
        \ 'readStatus':'off','room':rooms[a:room==# 'A' ? 0 : 1],'rooms':rooms,'messages':[],
        \ 'localContext':{'sessionId':repeat(s:session,32),'coverage':'session-only'}}
endfunction
function! s:publish(room) abort
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':s:state(a:room)})
endfunction
function! s:hello(...) abort
  let value={'version':1,'state':s:state('A'),'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','local-context-v1','delivery-resolution-v1']}
  if a:0 | call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else | call call(s:Hello,[{'result':value}]) | endif
endfunction
function! s:reply(request, value) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':a:value})
endfunction
function! s:delivery(request, status) abort
  let result=extend(copy(a:request.params),{'status':a:status,'message':'Synthetic recovery '.a:status})
  if a:status==# 'sent' | let result.messageId='recovery-sent-'.a:request.id | endif
  call wbx#_receive({'jsonrpc':'2.0','method':'delivery','params':result})
endfunction
function! s:sends() abort
  return filter(copy(g:recovery_flow_requests),'v:val.method==# "messages.send"')
endfunction
function! s:unknown(text) abort
  call setline(1,a:text) | call feedkeys("i\<Esc>",'xt')
  let request_count=len(s:sends())
  WebexSend
  call assert_equal(request_count+1,len(s:sends()))
  let request=s:sends()[-1]
  call s:delivery(request,'unknown')
  call assert_true(wbx#drafts#uncertain(request.params.roomId))
  return request
endfunction
function! s:resolve() abort
  let request_count=len(g:recovery_flow_requests)
  WebexResolveDelivery
  call assert_equal(request_count+1,len(g:recovery_flow_requests))
  let request=g:recovery_flow_requests[-1]
  call assert_equal('delivery.resolveBound',request.method)
  call assert_equal({'roomId':wbx#state().room.id},request.params)
  return request
endfunction
function! s:select(room) abort
  call wbx#select(a:room)
  let request=g:recovery_flow_requests[-1]
  call assert_equal('rooms.select',request.method)
  call s:publish(a:room) | call s:reply(request,v:null)
  WebexCompose
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:promote() abort
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.retained-'.bufnr('%').'.txt')
  setlocal buftype=
  WebexCompose
endfunction
function! s:reconnect(session) abort
  let s:session=a:session
  WebexDemo
  let hello=g:recovery_flow_requests[-1] | call assert_equal('hello',hello.method)
  call s:hello(hello.id)
  call assert_equal('session.start',g:recovery_flow_requests[-1].method)
  call s:reply(g:recovery_flow_requests[-1],v:null)
  call s:promote()
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call call(function('<SNR>'.sid.'_layout'),[])
  call s:hello() | WebexCompose
  call s:unknown('Ordinary checked-delivery recovery')
  let before=s:native() | let request_count=len(s:sends())
  let request=s:resolve()
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  call s:reply(request,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  call assert_equal(request_count,len(s:sends()))
  WebexSend | call s:delivery(s:sends()[-1],'sent')
  call assert_equal([''],getline(1,'$'))
  call add(s:checks,'matching acknowledged public recovery retains native draft until a new deliberate send; ordinary confirmed delivery then clears normally')

  call s:unknown('Error retains checked native work')
  let request=s:resolve() | let before=s:native() | let request_count=len(g:recovery_flow_requests)
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'error':{'code':-32004,'message':'Synthetic recovery refusal'}})
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  sleep 25m
  call assert_equal(request_count,len(g:recovery_flow_requests),'failed resolution is not retried')
  let request=s:resolve() | call s:reply(request,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  call add(s:checks,'RPC error retires its correlation only; uncertainty/native work survive and a new explicit resolution recovers')

  call s:unknown('A recovery held while selecting B')
  let old=s:resolve()
  call s:select('B') | call s:unknown('Independent B uncertain draft')
  let before=s:native()
  call s:reply(old,{'roomId':'A'})
  call assert_true(wbx#drafts#uncertain('A')) | call assert_true(wbx#drafts#uncertain('B'))
  call assert_equal(before,s:native())
  let request=s:resolve() | call s:reply(request,{'roomId':'B'})
  call assert_false(wbx#drafts#uncertain('B')) | call assert_true(wbx#drafts#uncertain('A'))
  call s:select('A')
  let request=s:resolve()
  call setline(1,'Newer edit while resolution is held') | call feedkeys("i\<Esc>",'xt')
  let before=s:native()
  call s:reply(request,{'roomId':'A'})
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  let request=s:resolve() | call s:reply(request,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A'))
  call add(s:checks,'changed selected room and newer native revision reject stale ACKs; exact current-room recovery does not clear another room')

  call s:unknown('Same native text with newer uncertainty')
  let request=s:resolve() | let before=s:native()
  " Independent uncertainty observation, deliberately without changing native intent.
  call wbx#drafts#mark_uncertain('A') | let evidence=wbx#drafts#evidence('A')
  call s:reply(request,{'roomId':'A'})
  call assert_equal(evidence,wbx#drafts#evidence('A')) | call assert_equal(before,s:native())
  let current=s:resolve() | call s:reply(current,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A'))
  call wbx#drafts#mark_uncertain('A') | let evidence=wbx#drafts#evidence('A')
  call s:reply(current,{'roomId':'A'})
  call assert_equal(evidence,wbx#drafts#evidence('A'),'duplicate RPC response cannot invoke a retired callback')
  let request=s:resolve() | call s:reply(request,{'roomId':'A'})
  call add(s:checks,'new same-room evidence beats an older ACK even with unchanged native intent; duplicate response cannot erase later uncertainty')

  call s:unknown('Held before messaging session replacement')
  let old=s:resolve() | let s:session='b' | call s:publish('A')
  let before=s:native() | let request_count=len(g:recovery_flow_requests)
  call s:reply(old,{'roomId':'A'})
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  call assert_equal(request_count,len(g:recovery_flow_requests),'session replacement does not replay resolution')
  call s:promote()
  let current=s:resolve() | call s:reply(current,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A'))
  call s:unknown('Held before physical transport replacement')
  let old=s:resolve()
  let g:recovery_flow_running=0 | call wbx#_exit(0)
  call s:reconnect('c')
  let current=s:resolve() | call assert_true(current.id>old.id)
  let before=s:native()
  call s:reply(old,{'roomId':'A'})
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  call s:reply(current,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A'))
  call add(s:checks,'messaging-session and physical transport replacement fence old ACKs without replay; fresh explicit recovery uses current intent and monotonic correlation')

  call s:unknown('Wrong-room ACK must retain uncertainty')
  let request=s:resolve() | let before=s:native()
  call s:reply(request,{'roomId':'B'})
  call assert_false(g:recovery_flow_running,'malformed bound ACK uses original protocol-disconnect contract')
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(before,s:native())
  call s:reconnect('d')
  let request=s:resolve() | call s:reply(request,{'roomId':'A'})
  call assert_false(wbx#drafts#uncertain('A'))
  call setline(1,'Fresh deliberately sent work after recovery') | call feedkeys("i\<Esc>",'xt')
  WebexSend | call s:delivery(s:sends()[-1],'sent')
  call assert_equal([''],getline(1,'$'))
  call add(s:checks,'wrong-room ACK disconnects without interpreting it as recovery; explicit reconnect/recovery and a new send complete normally')
  call assert_equal([],filter(copy(g:recovery_flow_requests),'index(["hello","session.start","rooms.select","messages.send","delivery.resolveBound"],v:val.method)<0'))
  call assert_equal(2,g:recovery_flow_starts)
  if $WBX_EDITOR_SCREEN==# '1'
    call setline(1,'Visible destination-bound recovery')
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Visible destination-bound recovery',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Visible destination-bound recovery"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:recovery_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'sendRecords':len(s:sends()),
      \ 'resolutionRequests':len(filter(copy(g:recovery_flow_requests),'v:val.method==# "delivery.resolveBound"')),
      \ 'requests':map(copy(g:recovery_flow_requests),'v:val.method'),
      \ 'scope':'public send/recovery and complete RPC correlation/intent/evidence/protocol/render owners; inert transport, controlled newer uncertainty observation; no service'})],$WBX_EDITOR_RESULT)
qa!
