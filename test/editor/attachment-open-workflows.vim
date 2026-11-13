" Public attachment commands with real native file/sink helpers and inert protocol transport only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let $TMPDIR=fnamemodify($WBX_EDITOR_RESULT,':h')
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:attachment_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call AttachmentFlowWire(a:wire)','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:attachment_flow_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:attachment_flow_running=0','call wbx#_exit(0)','endfunction'],
      \ s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:attachment_flow_running=1 | let g:attachment_flow_requests=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:session='a' | let s:chunks=0 | let s:opened=[]
function! s:state() abort
  let room={'id':'room','title':'Stable attachment room','type':'group'}
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,
        \ 'room':room,'rooms':[room],'messages':[
        \ {'id':'message','author':'Synthetic','created':'','text':'Loaded attachment source','attachments':[{'id':repeat('a',64)}]},
        \ {'id':'other','author':'Synthetic','created':'','text':'Other loaded message','attachments':[{'id':repeat('b',64)}]}],
        \ 'localContext':{'sessionId':repeat(s:session,32),'coverage':'session-only'}}
endfunction
function! s:hello(...) abort
  let value={'version':1,'state':s:state(),'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['attachment-typed-open-v1','message-attachments','local-context-v1']+(s:chunks ? ['attachment-chunks-v1'] : [])}
  if a:0 | call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else | call call(s:Hello,[{'result':value}]) | endif
endfunction
function! s:reply(request, value) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':a:value})
endfunction
function! AttachmentFlowWire(wire) abort
  let request=json_decode(a:wire)
  call add(g:attachment_flow_requests,request)
  if request.method==# 'messages.attachmentChunk'
    call s:reply(request,extend(copy(request.params),{'decodedBytes':16,'data':'QXR0YWNobWVudCBib2R5Cg=='}))
  elseif request.method==# 'messages.attachmentComplete'
    call s:reply(request,{'requestId':request.params.requestId,'transferId':request.params.transferId,'complete':v:true})
  endif
endfunction
function! s:wait(expression) abort
  let start=reltime()
  while !eval(a:expression) && reltimefloat(reltime(start))<4 | sleep 5m | endwhile
  if !eval(a:expression) | throw 'Timeout: '.a:expression.' | '.execute('messages') | endif
endfunction
function! s:history() abort
  call win_gotoid(s:window)
  execute 'buffer '.s:history
  call cursor(b:wbx_message_blocks[0].body,1)
endfunction
function! s:resolves() abort
  return filter(copy(g:attachment_flow_requests),'v:val.method==# "messages.attachmentResolve"')
endfunction
function! s:open() abort
  let previous=len(s:resolves())
  WebexAttachment 1
  call s:wait('len(s:resolves())=='.(previous+1))
  return s:resolves()[-1]
endfunction
function! s:value(request) abort
  let value={'meta':{'id':a:request.params.attachmentId,'name':'sample.txt','mime':'text/plain','sourceBytes':16},
        \ 'body':{'kind':'original','decodedBytes':16,'text':v:true,
        \ 'payload':{'mode':'inline','encoding':'base64','data':'QXR0YWNobWVudCBib2R5Cg=='}}}
  if get(a:request.params,'transfer','')==# 'chunks-v1'
    let value.body.payload={'mode':'chunks','encoding':'base64','requestId':a:request.id,'transferId':repeat('f',32),
          \ 'chunks':1,'chunkBytes':49152,'encodedBytes':24,'sha256':sha256("Attachment body\n")}
  endif
  return value
endfunction
function! s:finish(request) abort
  let before=bufnr('$')
  call s:reply(a:request,s:value(a:request))
  call s:wait('exists("b:wbx_attachment") && bufnr("%")>'.before)
  call assert_equal(['Attachment body'],getline(1,'$'))
  call assert_equal(a:request.params.attachmentId,b:wbx_attachment.id)
  call assert_false(&modeline || &swapfile || &undofile)
  call s:wait('!wbx#attachments#busy() && !wbx#attachment_stream#busy()')
  call add(s:opened,bufnr('%'))
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:reconnect(session) abort
  let s:session=a:session
  WebexDemo
  let hello=g:attachment_flow_requests[-1] | call assert_equal('hello',hello.method)
  call s:hello(hello.id)
  call assert_equal('session.start',g:attachment_flow_requests[-1].method) | call s:reply(g:attachment_flow_requests[-1],v:null)
  call s:history()
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call call(function('<SNR>'.sid.'_layout'),[])
  call s:hello()
  let s:history=wbx#buffers().history | let s:window=win_findbuf(s:history)[0]
  call s:history()
  let request=s:open() | call s:finish(request)
  call setline(1,'User attachment annotation retained') | call feedkeys("i\<Esc>",'xt') | let annotated=bufnr('%')
  let annotation=undotree()
  call s:history()
  let s:chunks=1 | call s:hello() | call s:history()
  let request=s:open()
  call assert_equal('chunks-v1',request.params.transfer)
  call s:finish(request)
  call assert_equal(1,len(filter(copy(g:attachment_flow_requests),'v:val.method==# "messages.attachmentChunk"')))
  call assert_equal(1,len(filter(copy(g:attachment_flow_requests),'v:val.method==# "messages.attachmentComplete"')))
  call assert_equal(['User attachment annotation retained'],getbufline(annotated,1,'$'))
  call add(s:checks,'ordinary inline and chunked original reads materialize exact native text through real private helpers, preserving earlier annotations')

  call s:history() | let s:chunks=0 | call s:hello() | call s:history()
  let request=s:open() | let before=s:native() | let requests=len(g:attachment_flow_requests)
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'error':{'code':-32002,'message':'Synthetic attachment refusal'}})
  call assert_equal(before,s:native()) | sleep 25m
  call assert_equal(requests,len(g:attachment_flow_requests))
  let g:wbx_tui.attachment_handlers={'.txt':'invalid-handler'}
  let request=s:open() | call s:reply(request,s:value(request))
  call assert_equal(before,s:native()) | call assert_false(wbx#attachments#busy())
  let g:wbx_tui.attachment_handlers={}
  let request=s:open() | call s:finish(request)
  call add(s:checks,'RPC and local-handler failures retain native work without retry/downgrade; a later explicit open recovers normally')

  call s:history() | let old=s:open()
  call cursor(b:wbx_message_blocks[1].body,1) | doautocmd CursorMoved
  call assert_equal('messages.attachmentCancel',g:attachment_flow_requests[-1].method)
  call assert_equal({'requestId':old.id},g:attachment_flow_requests[-1].params)
  call s:history() | let current=s:open() | let before=s:native()
  call s:reply(old,s:value(old))
  call assert_equal(before,s:native())
  let requests=len(s:resolves()) | WebexAttachment 1 | call assert_equal(requests,len(s:resolves()),'old result cannot release new busy admission')
  call s:finish(current)
  call add(s:checks,'move-away cancellation targets the exact request; a late old result neither steals focus nor releases a newer read')

  call s:history() | let old=s:open()
  let g:wbx_tui.attachment_handlers={'.txt':{}} | call wbx#_attachment_check(0)
  call assert_equal({'requestId':old.id},g:attachment_flow_requests[-1].params)
  let before=s:native() | call s:reply(old,s:value(old)) | call assert_equal(before,s:native())
  let g:wbx_tui.attachment_handlers={} | let old=s:open()
  let s:session='b'
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':s:state()})
  let before=s:native() | let requests=len(s:resolves())
  call s:reply(old,s:value(old)) | sleep 50m
  call assert_equal(before,s:native(),'same IDs in a new session cannot authorize the old result')
  call assert_equal(requests,len(s:resolves()),'session replacement never refetches automatically')
  let request=s:open() | call s:finish(request)
  call add(s:checks,'settings changes and same-ID messaging-session replacement revoke old authority; only a fresh explicit current-session read opens')

  call s:history() | let old=s:open()
  let g:attachment_flow_running=0 | call wbx#_exit(0)
  call s:reconnect('c')
  let current=s:open() | call assert_true(current.id>old.id) | let before=s:native()
  call s:reply(old,s:value(old)) | call assert_equal(before,s:native())
  call s:finish(current)
  call add(s:checks,'physical transport replacement retains monotonic RPC identity and logical generation fences; retired data cannot affect fresh explicit opening')

  call s:history() | let old=s:open() | let value=s:value(old)
  let value.meta.id=repeat('b',64) | let before=s:native()
  call s:reply(old,value)
  call assert_false(g:attachment_flow_running)
  call assert_equal(before[0:1],s:native()[0:1],'protocol failure does not open a new attachment or move focus')
  call assert_match('Disconnected',join(getline(1,'$'),"\n"),'managed history truthfully renders disconnect state')
  call s:reconnect('d')
  let current=s:open() | call s:finish(current)
  call assert_equal(['User attachment annotation retained'],getbufline(annotated,1,'$'))
  let annotation_window=win_findbuf(annotated)[0]
  call win_execute(annotation_window,'let w:attachment_flow_undo=undotree()')
  call assert_equal(annotation,getwinvar(annotation_window,'attachment_flow_undo'),'independent annotated attachment keeps full native undo')
  call add(s:checks,'mismatched attachment metadata still disconnects through protocol admission; explicit reconnect/open recovers without losing annotated native work')
  call assert_equal([],filter(copy(g:attachment_flow_requests),
        \ 'index(["hello","session.start","messages.attachmentResolve","messages.attachmentCancel","messages.attachmentChunk","messages.attachmentComplete"],v:val.method)<0'))
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Attachment body',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Attachment body"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:attachment_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'materializedViews':len(s:opened),'resolveRequests':len(s:resolves()),
      \ 'requests':map(copy(g:attachment_flow_requests),'v:val.method'),
      \ 'scope':'real private file/chunk helpers and native protocol/view/RPC/intent owners; inert transport only; no remote service or external handler'})],$WBX_EDITOR_RESULT)
qa!
