" Public composer send, recovery and replacement; real rich confirm() only in a private drawn PTY.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
set ttimeout ttimeoutlen=10
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:send_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:send_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:send_flow_running=1','let g:send_flow_starts+=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:send_flow_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:send_flow_running=1 | let g:send_flow_requests=[] | let g:send_flow_starts=0
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:dialogs=0 | let s:arms=0
function! s:sends() abort
  return filter(copy(g:send_flow_requests),'index(["messages.send","messages.sendRich","uploads.send"],v:val.method)>=0')
endfunction
function! s:reply(request, code) abort
  call wbx#_receive(extend({'jsonrpc':'2.0','id':a:request.id},a:code ? {'error':{'code':a:code,'message':'Synthetic refusal'}} : {'result':v:null}))
endfunction
function! s:delivery(request, status) abort
  let result=extend(deepcopy(a:request.params),{'status':a:status,'message':'Synthetic delivery '.a:status})
  if a:status==# 'sent' | let result.messageId='sent-'.a:request.id | endif
  if a:request.method==# 'messages.sendRich'
    let result.format='markdown'
    if a:status==# 'sent' | call remove(result,'text') | endif
  endif
  let envelope={'jsonrpc':'2.0','method':'delivery','params':result}
  call assert_true(wbx#protocol#valid(envelope)) | call wbx#_receive(envelope)
endfunction
function! s:hello(session, ...) abort
  let state={'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'sending':v:false,
        \ 'readStatus':'off','room':{'id':'A','title':'Synthetic send target','type':'group'},
        \ 'rooms':[{'id':'A','title':'Synthetic send target','type':'group'}],
        \ 'messages':[{'id':'root','author':'Synthetic','text':'Loaded send history','created':''},
        \ {'id':'other-root','author':'Synthetic','text':'Another thread','created':''}],
        \ 'localContext':{'sessionId':repeat(a:session,32),'coverage':'session-only'}}
  let value={'version':1,'state':state,'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','message-replies','markdown-send-v1','local-context-v1','delivery-resolution-v1']}
  if a:0
    call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else
    call call(s:Hello,[{'result':value}])
  endif
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:text(text) abort
  call setline(1,a:text) | call feedkeys("i\<Esc>",'xt')
endfunction
function! s:thread(root) abort
  call win_gotoid(win_findbuf(wbx#buffers().history)[0])
  let block=filter(copy(b:wbx_message_blocks),'v:val.id==# a:root')[0]
  call cursor(block.body,1)
  WebexReply
  stopinsert
endfunction
function! s:arm(case, steps) abort
  let s:arms+=1 | let s:dialogs+=len(a:steps)
  call writefile([json_encode({'serial':s:arms,'case':a:case,'steps':a:steps})],$WBX_EDITOR_RESULT.'.dialogs-next.json')
  call rename($WBX_EDITOR_RESULT.'.dialogs-next.json',$WBX_EDITOR_RESULT.'.dialogs.json')
endfunction
function! s:resolve() abort
  WebexResolveDelivery
  let request=g:send_flow_requests[-1]
  call assert_equal('delivery.resolveBound',request.method)
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':{'roomId':'A'}})
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call call(function('<SNR>'.sid.'_layout'),[])
  call s:hello('a') | WebexCompose
  call s:text('Ordinary explicit send')
  let before=s:native() | let request_count=len(g:send_flow_requests)
  call feedkeys("\<CR>",'xt') | silent! write
  call assert_equal(before,s:native()) | call assert_equal(request_count,len(g:send_flow_requests))
  WebexSend
  let sent=s:sends()[-1]
  call assert_equal('messages.send',sent.method) | call assert_equal('A',sent.params.roomId)
  call assert_equal('Ordinary explicit send',sent.params.text) | call assert_true(wbx#drafts#pending())
  call s:reply(sent,0) | call assert_equal(before,s:native())
  call assert_true(wbx#drafts#pending(),'RPC success is not a delivery ACK')
  call s:delivery(sent,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_false(wbx#drafts#pending())
  call add(s:checks,'ordinary Enter/write stay native; explicit plain send dispatches once and only matching delivery clears unchanged text')

  call s:text('Retained on confirmed refusal') | let before=s:native()
  WebexSend | let failed=s:sends()[-1] | call s:reply(failed,-32002)
  call assert_equal(before,s:native()) | call assert_false(wbx#drafts#pending())
  let request_count=len(s:sends()) | call wbx#redraw() | call assert_equal(request_count,len(s:sends()))
  WebexSend | let recovered=s:sends()[-1] | call assert_notequal(failed.params.requestId,recovered.params.requestId)
  call s:delivery(recovered,'sent') | call assert_equal([''],getline(1,'$'))
  call add(s:checks,'confirmed refusal retains full native work; redraw never retries and a deliberate new request recovers normally')

  call s:text('Possible submission retained') | WebexSend | let unknown=s:sends()[-1]
  call s:reply(unknown,-32004) | call assert_true(wbx#drafts#uncertain('A'))
  let before=s:native() | let request_count=len(s:sends()) | WebexSend
  call assert_equal(request_count,len(s:sends())) | call assert_equal(before,s:native())
  call s:resolve() | call assert_false(wbx#drafts#uncertain('A'))
  WebexSend | let checked=s:sends()[-1] | call s:delivery(checked,'sent')
  call assert_equal([''],getline(1,'$'))
  call add(s:checks,'possible submission blocks resend until explicit exact-room acknowledged recovery; new explicit send then succeeds')

  call s:text('Old admitted text') | WebexSend | let old=s:sends()[-1]
  call s:text('Newer native work wins') | let before=s:native()
  call s:delivery(old,'sent')
  call assert_equal(before,s:native(),'exact old success cannot clear newer native work/full undo')
  call add(s:checks,'late matching success releases its request but preserves newer native text/full undo/focus')

  call s:text('Main discussion draft retained')
  let main=s:native() | let windows=len(getwininfo())
  call s:thread('root')
  for status in ['failed','unknown']
    call s:text('Reply retained on '.status) | WebexSend | let request=s:sends()[-1] | let before=s:native()
    call s:delivery(request,status)
    call assert_equal(before,s:native()) | call assert_equal('root',wbx#destination().parentId)
    if status==# 'unknown' | call s:resolve() | endif
  endfor
  for format in ['plain','markdown']
    call s:thread('root')
    execute 'WebexFormat '.format
    call s:text('Confirmed thread reply in '.format) | WebexSend | let request=s:sends()[-1]
    let thread=bufnr('%') | let before=s:native()
    call s:reply(request,0) | call assert_equal(before,s:native(),'RPC success alone cannot leave reply mode')
    call s:delivery(request,'sent')
    call assert_equal(main,s:native(),'confirmed reply restores the main discussion draft and native undo in the same window')
    call assert_false(has_key(wbx#destination(),'parentId'))
    call assert_equal([''],getbufline(thread,1,'$'))
    call assert_equal(windows,len(getwininfo()),'returning to the main discussion creates no splits')
  endfor
  call s:thread('root') | WebexFormat plain
  call s:text('Earlier reply') | WebexSend | let request=s:sends()[-1]
  call s:text('Newer unsent reply') | let before=s:native()
  call s:delivery(request,'sent')
  call assert_equal(before,s:native()) | call assert_equal('root',wbx#destination().parentId)
  WebexSend | let request=s:sends()[-1]
  call s:thread('other-root') | call s:text('Newer thread draft') | let before=s:native()
  call s:delivery(request,'sent')
  call assert_equal(before,s:native(),'a late confirmation never switches away from a newer thread')
  call assert_equal('other-root',wbx#destination().parentId)
  WebexCancelReply
  call assert_equal(main,s:native())
  call add(s:checks,'confirmed plain/Markdown replies return to the retained main draft; failed/unknown outcomes, newer edits and other threads stay put')

  WebexFormat markdown
  call s:text('  **Exact native Markdown**  ')
  WebexSend | let rich=s:sends()[-1]
  call assert_equal('messages.sendRich',rich.method)
  call assert_equal('  **Exact native Markdown**  ',rich.params.text,'normalization never changes submitted draft bytes')
  call s:reply(rich,0)
  call assert_equal('  **Exact native Markdown**  ',getline(1),'RPC success alone still cannot clear Markdown')
  call s:delivery(rich,'sent')
  call assert_equal([''],getline(1,'$'),'correlated Markdown success clears without requiring source text in the delivery')
  call s:text('**Earlier Markdown**') | WebexSend | let rich=s:sends()[-1]
  call s:text('**Newer unsent Markdown**') | let before=s:native()
  call s:delivery(rich,'sent')
  call assert_equal(before,s:native(),'confirmed old Markdown never clears newer unsent text or undo')
  call s:text('Tag <@personId:synthetic-peer|Person>') | let before=s:native() | let request_count=len(s:sends())
  WebexSend | let rich=s:sends()[-1]
  call assert_equal(request_count+1,len(s:sends()),'explicit individual-tag send has no extra dialog')
  call assert_equal('Tag <@personId:synthetic-peer|Person>',rich.params.text)
  call assert_true(rich.params.mentionsAccepted)
  call assert_false(has_key(rich.params,'allAccepted'),'a person tag never grants broadcast consent')
  call assert_equal(before,s:native(),'dispatch retains native work until confirmed delivery')
  call s:delivery(rich,'sent') | call assert_equal([''],getline(1,'$'))
  WebexFormat plain
  call add(s:checks,'Markdown is sent byte-for-byte; metadata-only confirmed delivery clears only its unchanged native draft')

  if $WBX_EDITOR_SCREEN==# '1'
    WebexFormat markdown | call s:text('Accepted <@all>')
    call s:arm('send/cancel',[{'match':'ATTENTION: @all notifies the entire space.','key':'enter'}])
    let before=s:native() | let request_count=len(s:sends())
    WebexSend | call assert_equal(request_count,len(s:sends())) | call assert_equal(before,s:native())
    call s:arm('send/accept',[{'match':'ATTENTION: @all notifies the entire space.','key':'accept'}])
    WebexSend | let rich=s:sends()[-1]
    call assert_equal('messages.sendRich',rich.method)
    call assert_true(rich.params.mentionsAccepted) | call assert_true(rich.params.allAccepted)
    call s:delivery(rich,'sent') | call assert_equal([''],getline(1,'$'))
    WebexFormat plain
    call add(s:checks,'individual tags need only explicit Send; @all retains one real default-Cancel gate before its exact rich send')
  endif

  call s:text('Held across session replacement') | WebexSend | let retired=s:sends()[-1]
  let g:send_flow_running=0 | call wbx#_exit(0)
  call assert_false(wbx#drafts#pending()) | call assert_true(wbx#drafts#uncertain('A'))
  WebexDemo
  call assert_equal('hello',g:send_flow_requests[-1].method)
  call s:hello('b',g:send_flow_requests[-1].id)
  call assert_equal('session.start',g:send_flow_requests[-1].method) | call s:reply(g:send_flow_requests[-1],0)
  WebexCompose
  call s:resolve()
  let request_count=len(s:sends()) | WebexSend
  call assert_equal(request_count,len(s:sends()),'retained prior-account draft is not silently adopted')
  " Deliberately save/promote the old draft as ordinary user work, then open a
  " fresh public composer for the new session rather than changing its metadata.
  let retired_buffer=bufnr('%')
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.retired-notes.txt')
  setlocal buftype=
  WebexCompose
  call assert_notequal(retired_buffer,bufnr('%'))
  call s:text('Fresh deliberate replacement send') | WebexSend | let current=s:sends()[-1]
  call assert_notequal(retired.params.requestId,current.params.requestId)
  let before=s:native()
  call s:reply(retired,-32004) | call s:delivery(retired,'sent')
  call assert_equal(before,s:native()) | call assert_true(wbx#drafts#pending())
  call s:delivery(current,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_false(wbx#drafts#pending())
  call assert_equal(['Held across session replacement'],getbufline(retired_buffer,1,'$'))
  call add(s:checks,'replacement retires old pending without replay; old error/delivery cannot clear new pending or text and explicit new-session send works')
  if $WBX_EDITOR_SCREEN==# '1'
    call s:text('Visible retained native send surface')
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Visible retained native send surface',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Visible retained native send surface"'))
  endif
  call assert_equal(1,g:send_flow_starts,'only deliberate replacement starts the inert transport')
  call assert_equal([],filter(copy(g:send_flow_requests),'index(["hello","session.start","messages.send","messages.sendRich","delivery.resolveBound"],v:val.method)<0'))
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:send_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'expectedNativeDialogs':s:dialogs,
      \ 'requests':map(copy(g:send_flow_requests),'v:val.method'),'sends':len(s:sends()),
      \ 'scope':'ordinary public commands, real native draft/intent/confirmation; inert transport only; real keyboard acceptance drawn-only'})],$WBX_EDITOR_RESULT)
qa!
