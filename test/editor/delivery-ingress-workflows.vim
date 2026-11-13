" Public send/delivery/clear with actual native owners; inert physical transport only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:ingress_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:ingress_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:ingress_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:ingress_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:ingress_running=1 | let g:ingress_requests=[] | let g:ingress_events={}
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:session='a' | let s:room='A'
function! IngressDeliveryEvent() abort
  let value=g:wbx_tui_event
  let g:ingress_events[value.requestId]=get(g:ingress_events,value.requestId,0)+1
  call assert_false(wbx#drafts#pending(),'event follows pending settlement')
endfunction
augroup ingress_workflow_events
  autocmd!
  autocmd User WbxDelivery call IngressDeliveryEvent()
augroup END
function! s:state() abort
  let rooms=[{'id':'A','title':'Delivery room A','type':'group'},{'id':'B','title':'Delivery room B','type':'group'}]
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'sending':v:false,
        \ 'room':rooms[s:room==# 'A' ? 0 : 1],'rooms':rooms,
        \ 'messages':[{'id':'root','author':'Synthetic','text':'Ordinary delivery root','created':''}],
        \ 'localContext':{'sessionId':repeat(s:session,32),'coverage':'session-only'}}
endfunction
function! s:hello(...) abort
  let value={'version':1,'state':s:state(),'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','local-context-v1','message-replies','markdown-send-v1','delivery-resolution-v1']}
  if a:0 | call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else | call call(s:Hello,[{'result':value}]) | endif
endfunction
function! s:publish() abort
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':s:state()})
endfunction
function! s:sends() abort
  return filter(copy(g:ingress_requests),'index(["messages.send","messages.sendRich"],v:val.method)>=0')
endfunction
function! s:text(text) abort
  call setline(1,a:text) | call feedkeys("i\<Esc>",'xt')
endfunction
function! s:send(text) abort
  call s:text(a:text)
  let requests=len(s:sends())
  WebexSend
  call assert_equal(requests+1,len(s:sends()))
  call assert_true(wbx#drafts#pending())
  return s:sends()[-1]
endfunction
function! s:emit(request, status) abort
  let value=extend(deepcopy(a:request.params),{'status':a:status,'message':'Synthetic ingress '.a:status})
  if a:status==# 'sent' | let value.messageId='ack-'.a:request.id | endif
  if a:request.method==# 'messages.sendRich' | let value.format='markdown' | endif
  let envelope={'jsonrpc':'2.0','method':'delivery','params':value}
  call assert_true(wbx#protocol#valid(envelope)) | call wbx#_receive(envelope)
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:resolve() abort
  WebexResolveDelivery
  let request=g:ingress_requests[-1]
  call assert_equal('delivery.resolveBound',request.method)
  call assert_true(wbx#drafts#uncertain('A'),'dispatch alone cannot resolve uncertainty')
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':{'roomId':'A'}})
  call assert_false(wbx#drafts#uncertain('A'))
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call call(function('<SNR>'.sid.'_layout'),[]) | call s:hello()
  WebexCompose | call s:text('Normal complete delivery')
  let native=s:native() | let requests=len(g:ingress_requests)
  call feedkeys("\<CR>",'xt') | silent! write
  call assert_equal(native,s:native()) | call assert_equal(requests,len(g:ingress_requests))
  WebexSend | let request=s:sends()[-1]
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':v:null})
  call assert_true(wbx#drafts#pending()) | call assert_equal(native,s:native())
  call s:emit(request,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_false(wbx#drafts#pending())
  call assert_equal(1,g:ingress_events[request.params.requestId])
  let cleared=s:native() | call s:emit(request,'sent')
  call assert_equal(cleared,s:native()) | call assert_equal(1,g:ingress_events[request.params.requestId])
  call add(s:checks,'ordinary Enter/write never send; explicit send and RPC acceptance retain draft until one matching sent delivery synchronously clears and publishes once')

  call win_gotoid(win_findbuf(wbx#buffers().history)[0]) | call cursor(b:wbx_message_blocks[0].body,1)
  WebexReply
  call assert_equal('root',b:wbx_parent)
  let request=s:send('Reply delivered to exact root') | call assert_equal('root',request.params.parentId)
  call s:emit(request,'sent') | call assert_equal([''],getline(1,'$'))
  WebexCancelReply | WebexFormat markdown
  let request=s:send('**Ordinary Markdown delivery**')
  call assert_equal('messages.sendRich',request.method) | call s:emit(request,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_equal('markdown',b:wbx_format)
  WebexFormat plain
  call add(s:checks,'reply and Markdown public sends retain exact parent/format/draft matching and clear normally without format downgrade or target substitution')

  let request=s:send('Background destination delivery') | let target=bufnr('%')
  vnew | file delivery-independent.txt | call s:text('Independent native foreground')
  let before=s:native()
  let s:room='B' | call s:publish()
  call assert_true(wbx#drafts#pending('A'),'same-session room selection is not send retirement')
  call s:emit(request,'sent')
  call assert_equal([''],getbufline(target,1,'$')) | call assert_equal(before,s:native())
  let s:room='A' | call s:publish() | WebexCompose
  let request=s:send('Text admitted before newer edit')
  call s:text('Newer native work retained') | let before=s:native()
  call s:emit(request,'sent')
  call assert_equal(before,s:native()) | call assert_false(wbx#drafts#pending())
  call add(s:checks,'delivery follows its registered destination, not selected room/focus; newer native text/full undo and independent foreground survive exact older success')

  let request=s:send('Uncertain delivery is not absence') | let before=s:native()
  call s:emit(request,'unknown')
  call assert_equal(before,s:native()) | call assert_true(wbx#drafts#uncertain('A'))
  let requests=len(g:ingress_requests)
  call s:emit(request,'sent') | WebexSend | call wbx#redraw() | sleep 25m
  call assert_equal(requests,len(g:ingress_requests)) | call assert_equal(before,s:native())
  call assert_equal(1,g:ingress_events[request.params.requestId],'later duplicate cannot reinterpret settled unknown as sent')
  call s:resolve()
  let recovered=s:send('Explicit send after bound resolution') | call s:emit(recovered,'sent')
  call assert_equal([''],getline(1,'$'))
  let failed=s:send('Confirmed failed delivery') | let before=s:native()
  call s:emit(failed,'failed')
  call assert_equal(before,s:native()) | call assert_false(wbx#drafts#uncertain('A'))
  let recovered=s:send('Explicit retry after failure') | call s:emit(recovered,'sent')
  call assert_equal([''],getline(1,'$'))
  call add(s:checks,'unknown retains text and room-wide uncertainty with no automatic retries; exact acknowledged resolution and new deliberate send recover, while confirmed failure permits a new explicit attempt')

  let old=s:send('Submission retained across ready-session replacement') | let retired=bufnr('%')
  let stale=s:state() | let stale.revision=wbx#state().revision-1
  let stale.localContext.sessionId=repeat('b',32)
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':stale})
  call assert_true(wbx#drafts#pending(),'rejected stale state is not authority to retire a current send')
  call assert_false(wbx#drafts#uncertain('A'))
  let before=s:native() | let s:session='b' | call s:publish()
  call assert_false(wbx#drafts#pending()) | call assert_true(wbx#drafts#uncertain('A'))
  call assert_equal(before,s:native())
  call s:emit(old,'sent')
  call assert_equal(before,s:native()) | call assert_false(has_key(g:ingress_events,old.params.requestId))
  call s:resolve()
  let requests=len(s:sends()) | WebexSend | call assert_equal(requests,len(s:sends()),'old authored draft cannot be silently adopted')
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.retired.txt') | setlocal buftype=
  WebexCompose
  let current=s:send('Fresh replacement-session submission')
  call assert_notequal(old.params.requestId,current.params.requestId)
  let before=s:native() | call s:emit(old,'failed')
  call assert_equal(before,s:native()) | call assert_true(wbx#drafts#pending())
  call s:emit(current,'sent') | call assert_equal([''],getline(1,'$'))
  call assert_equal(['Submission retained across ready-session replacement'],getbufline(retired,1,'$'))
  call add(s:checks,'ready-to-ready session replacement retires old authority into uncertainty before late delivery; explicit recovery/promotion enables fresh-session send and old outcomes cannot settle new work')

  let old=s:send('Transport-lost submission')
  let g:ingress_running=0 | call wbx#_exit(0)
  call assert_true(wbx#drafts#uncertain('A')) | call assert_false(wbx#drafts#pending())
  let s:session='c'
  WebexDemo | let hello=g:ingress_requests[-1]
  call assert_equal('hello',hello.method) | call s:hello(hello.id)
  call wbx#_receive({'jsonrpc':'2.0','id':g:ingress_requests[-1].id,'result':v:null})
  WebexCompose | call s:resolve()
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.disconnected.txt') | setlocal buftype=
  WebexCompose
  let current=s:send('Fresh explicit send after disconnect')
  let before=s:native() | call s:emit(old,'sent')
  call assert_equal(before,s:native()) | call assert_true(wbx#drafts#pending())
  call s:emit(current,'sent') | call assert_equal([''],getline(1,'$'))
  call add(s:checks,'transport loss retains existing possible-write policy and monotonic request identity; explicit rehandshake/new composer/send succeeds without replaying a lost submission')
  call assert_equal([],filter(values(g:ingress_events),'v:val!=1'))
  call assert_equal([],filter(copy(g:ingress_requests),'index(["messages.send","messages.sendRich","delivery.resolveBound","hello","session.start"],v:val.method)<0'))
  if $WBX_EDITOR_SCREEN==# '1'
    call s:text('Visible recovered delivery composer')
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Visible recovered delivery composer',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Visible recovered delivery composer"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:ingress_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'methods':map(copy(g:ingress_requests),'v:val.method'),'deliveryEvents':len(g:ingress_events),
      \ 'scope':'public native commands, actual RPC/draft/delivery/clear/recovery/presentation owners; inert physical transport only'})],$WBX_EDITOR_RESULT)
qa!
