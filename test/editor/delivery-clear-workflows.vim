" Public sends/delivery ingress with controlled local writer faults; physical transport is inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:clear_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:clear_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:clear_flow_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:clear_flow_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:clear_flow_running=1 | let g:clear_flow_requests=[]
let g:clear_flow_blocks=0 | let g:clear_flow_writes=0 | let g:clear_flow_race=''
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:retry_seen=0
function! s:sends() abort
  return filter(copy(g:clear_flow_requests),'index(["messages.send","messages.sendRich","uploads.send"],v:val.method)>=0')
endfunction
function! s:timers() abort
  return filter(timer_info(),'string(v:val.callback) =~# "wbx#delivery_clear#clear"')
endfunction
function! s:drain() abort
  let start=reltime()
  while !empty(s:timers()) && reltimefloat(reltime(start))<1 | sleep 5m | endwhile
  call assert_equal([],s:timers())
endfunction
function! s:hello(session, ...) abort
  let state={'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'sending':v:false,
        \ 'readStatus':'off','room':{'id':'A','title':'Synthetic clear target','type':'group'},
        \ 'rooms':[{'id':'A','title':'Synthetic clear target','type':'group'}],'messages':[],
        \ 'localContext':{'sessionId':repeat(a:session,32),'coverage':'session-only'}}
  let value={'version':1,'state':state,'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','message-replies','uploads-v1','markdown-send-v1','local-context-v1','delivery-resolution-v1'],
        \ 'uploadFormats':['markdown-single-file-v1']}
  if a:0
    call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else
    call call(s:Hello,[{'result':value}])
  endif
endfunction
function! s:emit(request, status) abort
  let result=extend(deepcopy(a:request.params),{'status':a:status,'message':'Synthetic '.a:status})
  if a:status==# 'sent' | let result.messageId='clear-sent-'.a:request.id | endif
  if a:request.method==# 'messages.sendRich' | let result.format='markdown' | endif
  let envelope={'jsonrpc':'2.0','method':'delivery','params':result}
  call assert_true(wbx#protocol#valid(envelope)) | call wbx#_receive(envelope)
endfunction
function! s:text(text) abort
  call setline(1,a:text) | call feedkeys("i\<Esc>",'xt')
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:send(text) abort
  call s:text(a:text)
  let previous=len(s:sends())
  WebexSend
  call assert_equal(previous+1,len(s:sends()))
  return s:sends()[-1]
endfunction
function! ClearDeliveryWrite(buffer, lines, ...) abort
  if a:lines==# [''] && getbufvar(a:buffer,'wbx_kind','')==# 'compose'
    let g:clear_flow_writes+=1
    if g:clear_flow_blocks>0
      let g:clear_flow_blocks-=1
      let race=g:clear_flow_race | let g:clear_flow_race=''
      if race==# 'edit' | call setbufline(a:buffer,1,'Newer native work before local retry') | endif
      if race==# 'session' | call s:hello('b') | endif
      return 0
    endif
  endif
  return call(g:ClearDeliveryOriginalWrite,[a:buffer,a:lines]+a:000)
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call call(function('<SNR>'.sid.'_layout'),[])
  call s:hello('a') | WebexCompose
  let g:ClearDeliveryOriginalWrite=funcref('<SNR>'.sid.'_write')
  execute 'function! <SNR>'.sid."_write(buffer, lines, ...) abort\nreturn call('ClearDeliveryWrite',[a:buffer,a:lines]+a:000)\nendfunction"
  let request=s:send('Ordinary ACK clears exact text')
  let writes=g:clear_flow_writes
  call s:emit(request,'sent')
  call assert_equal(writes+1,g:clear_flow_writes) | call assert_equal([''],getline(1,'$'))
  call assert_false(wbx#drafts#pending()) | call assert_equal([],s:timers())
  let request=s:send('Failed outcome retains native work') | let before=s:native()
  let writes=g:clear_flow_writes
  call s:emit(request,'failed')
  call assert_equal(writes,g:clear_flow_writes) | call assert_equal(before,s:native())
  call add(s:checks,'ordinary matching sent ACK clears once; confirmed failed delivery never enters the successful-clear owner')

  let held=s:send('Transient local write failure recovers')
  let request_count=len(s:sends()) | let writes=g:clear_flow_writes
  let g:clear_flow_blocks=1
  call s:emit(held,'sent')
  call s:drain()
  call assert_equal([''],getline(1,'$')) | call assert_equal(writes+2,g:clear_flow_writes)
  call assert_equal(request_count,len(s:sends()),'local write retry never dispatches another send')
  let s:retry_seen=g:clear_flow_writes==writes+2 && getline(1)==# ''
  call add(s:checks,'transient local write refusal defers exactly the local clear, then recovers after release without another send')

  let request=s:send('Older ACK before newer edit')
  call s:text('Newer edit before ACK')
  let before=s:native() | let writes=g:clear_flow_writes
  call s:emit(request,'sent')
  call assert_equal(before,s:native()) | call assert_equal(writes,g:clear_flow_writes)
  let request=s:send('Acknowledged before clear hook edit')
  let g:clear_flow_blocks=1 | let g:clear_flow_race='edit'
  let request_count=len(s:sends()) | let writes=g:clear_flow_writes
  call s:emit(request,'sent')
  let before=s:native() | call s:drain()
  call assert_equal(before,s:native()) | call assert_equal('Newer native work before local retry',getline(1))
  call assert_equal(writes+1,g:clear_flow_writes) | call assert_equal(request_count,len(s:sends()))
  call add(s:checks,'newer native text/full undo survives both late matching ACK and edits made before the scheduled local retry')

  let request=s:send('Acknowledged but local writer unavailable')
  let g:clear_flow_blocks=99 | let writes=g:clear_flow_writes | let request_count=len(s:sends())
  call s:emit(request,'sent') | call s:drain()
  call assert_equal(writes+4,g:clear_flow_writes) | call assert_true(wbx#drafts#is_sent(bufnr('%')))
  let before=s:native() | WebexSend
  call assert_equal(request_count,len(s:sends())) | call assert_equal(before,s:native())
  let g:clear_flow_blocks=0
  let request=s:send('New deliberate edited message after confirmed send')
  call s:emit(request,'sent') | call assert_equal([''],getline(1,'$'))
  call add(s:checks,'four local attempts exhaust without resend; unchanged confirmed copy stays blocked and only a deliberate new edit/send recovers')

  WebexFormat markdown
  call s:text('**Exact one-file ACK**')
  call wbx#drafts#upload(bufnr('%'),{'attachmentId':repeat('d',32),'name':'synthetic.txt','bytes':5})
  WebexSend | let request=s:sends()[-1] | call assert_equal('uploads.send',request.method)
  let writes=g:clear_flow_writes | let g:clear_flow_blocks=99 | let request_count=len(s:sends())
  call s:emit(request,'sent') | call s:drain()
  call assert_equal(writes+1,g:clear_flow_writes) | call assert_equal([],s:timers())
  call assert_true(wbx#drafts#is_sent(bufnr('%'))) | call assert_equal({},wbx#drafts#upload(bufnr('%')))
  WebexSend | call assert_equal(request_count,len(s:sends()))
  let g:clear_flow_blocks=0 | WebexFormat plain
  let request=s:send('Explicit new plain work after file confirmation')
  call assert_equal('messages.send',request.method) | call s:emit(request,'sent')
  call assert_equal([''],getline(1,'$'))
  call add(s:checks,'blocked attachment clear never defers after upload cleanup; confirmed-sent attachment revision prevents accidental resend')

  let request=s:send('Old session local clear must not resume')
  let g:clear_flow_blocks=1 | let g:clear_flow_race='session' | let writes=g:clear_flow_writes
  call s:emit(request,'sent')
  call s:text('Replacement session native work')
  let before=s:native() | let request_count=len(s:sends())
  call s:drain()
  call assert_equal(before,s:native()) | call assert_equal(writes+1,g:clear_flow_writes)
  call assert_equal(request_count,len(s:sends()))
  WebexSend | call assert_equal(request_count,len(s:sends()),'unverified old-account draft remains blocked')
  let retired_buffer=bufnr('%')
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.retired-notes.txt') | setlocal buftype=
  WebexCompose
  let current=s:send('Fresh session explicit ACK clear')
  let before=s:native() | let writes=g:clear_flow_writes
  call s:emit(request,'sent')
  call assert_equal(before,s:native()) | call assert_equal(writes,g:clear_flow_writes)
  call assert_true(wbx#drafts#pending())
  call s:emit(current,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_false(wbx#drafts#pending())
  call assert_equal(['Replacement session native work'],getbufline(retired_buffer,1,'$'))
  call add(s:checks,'session replacement cancels stale local clear; late duplicate ACK cannot affect new pending/text and fresh-session explicit send clears normally')
  if $WBX_EDITOR_SCREEN==# '1'
    call s:text('Visible local-clear recovery surface')
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Visible local-clear recovery surface',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Visible local-clear recovery surface"'))
  endif
  call assert_equal([],filter(copy(g:clear_flow_requests),'index(["messages.send","messages.sendRich","uploads.send"],v:val.method)<0'))
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call s:drain()
let g:clear_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'localRetryObserved':s:retry_seen,
      \ 'requests':map(copy(g:clear_flow_requests),'v:val.method'),'sends':len(s:sends()),'localWriteAttempts':g:clear_flow_writes,
      \ 'scope':'public send/delivery and real timers, controlled local write faults, inert physical transport; textlock itself tested at owner boundary; no service'})],$WBX_EDITOR_RESULT)
qa!
