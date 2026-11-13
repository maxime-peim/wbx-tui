" Complete ACK ingress under real expression-mapping textlock; no mocked renderer or service.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:delivery_render_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:delivery_render_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','throw "Backend forbidden"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:delivery_render_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:delivery_render_running=1 | let g:delivery_render_requests=[] | let g:delivery_render_events={}
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:status='sent' | let s:race='' | let s:locked_seen=0
augroup delivery_render_events
  autocmd!
  autocmd User WbxDelivery let g:delivery_render_events[g:wbx_tui_event.requestId]=get(g:delivery_render_events,g:wbx_tui_event.requestId,0)+1
augroup END
function! s:state(session) abort
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'sending':v:false,
        \ 'readStatus':'off','room':{'id':'A','title':'Session '.a:session.' space','type':'group'},
        \ 'rooms':[{'id':'A','title':'Session '.a:session.' space','type':'group'}],
        \ 'messages':[{'id':'history','author':'Synthetic','text':'History session '.a:session,'created':''}],
        \ 'localContext':{'sessionId':repeat(a:session,32),'coverage':'session-only'}}
endfunction
function! s:timers() abort
  return filter(timer_info(),'string(v:val.callback) =~# "<SNR>".s:render_sid."_retry\\|wbx#delivery_clear#clear"')
endfunction
function! s:drain() abort
  let start=reltime()
  while !empty(s:timers()) && reltimefloat(reltime(start))<1 | sleep 5m | endwhile
  call assert_equal([],s:timers())
endfunction
function! s:sends() abort
  return filter(copy(g:delivery_render_requests),'v:val.method ==# "messages.send"')
endfunction
function! s:send(text) abort
  call setline(1,a:text) | call feedkeys("i\<Esc>",'xt')
  let previous=len(s:sends())
  WebexSend
  call assert_equal(previous+1,len(s:sends()))
  return s:sends()[-1]
endfunction
function! s:emit(request, status) abort
  let value=extend(deepcopy(a:request.params),{'status':a:status,'message':'Synthetic complete ACK '.a:status})
  if a:status==# 'sent' | let value.messageId='ack-'.a:request.id | endif
  let message={'jsonrpc':'2.0','method':'delivery','params':value}
  call assert_true(wbx#protocol#valid(message)) | call wbx#_receive(message)
endfunction
function! DeliveryRenderExpression() abort
  call s:emit(s:held,s:status)
  call s:emit(s:held,s:status)
  let s:locked_seen=!empty(s:timers()) && !getbufvar(wbx#buffers().history,'&modifiable')
        \ && !getbufvar(wbx#buffers().rooms,'&modifiable')
        \ && get(g:delivery_render_events,s:held.params.requestId,0)==1
  if s:race==# 'session'
    let old=filter(s:timers(),'string(v:val.callback) =~# "<SNR>".s:render_sid."_retry"')[0]
    let state=s:state('b')
    call wbx#_receive({'jsonrpc':'2.0','method':'state','params':state})
    call call(old.callback,[old.id])
  endif
  return s:race==# 'edit' ? ' NEWER NATIVE EDIT' : ''
endfunction
function! s:locked() abort
  inoremap <silent><buffer><expr> <F6> DeliveryRenderExpression()
  call feedkeys("A\<F6>\<Esc>",'xt')
  iunmap <buffer> <F6>
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:render_sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/render_request.vim$"')[0].sid
  call call(function('<SNR>'.sid.'_layout'),[])
  call call(function('<SNR>'.sid.'_hello'),[{'result':{'version':1,'state':s:state('a'),
        \ 'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['messaging','local-context-v1','delivery-resolution-v1']}}])
  WebexCompose
  let ordinary=s:send('Unlocked ordinary ACK')
  call s:emit(ordinary,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_equal([],s:timers())
  call assert_equal(1,g:delivery_render_events[ordinary.params.requestId])
  call add(s:checks,'unlocked ACK retains synchronous rendering/clear/event behavior without a timer')

  let s:held=s:send('Complete sent ACK under native textlock')
  let request_count=len(g:delivery_render_requests)
  call s:locked()
  call assert_true(s:locked_seen,'complete locked ACK returns, emits once, queues presentation and restores readonly projections')
  call s:drain()
  call assert_equal([''],getline(1,'$')) | call assert_false(wbx#drafts#pending())
  call assert_equal(request_count,len(g:delivery_render_requests))
  call assert_equal(1,g:delivery_render_events[s:held.params.requestId])
  call assert_notmatch('Sending…',join(getbufline(wbx#buffers().history,1,'$'),"\n"))
  call add(s:checks,'complete real-textlock sent ACK finishes once and deferred clear/render remove sending state without replaying requests/events')

  let s:held=s:send('Acknowledged text before native edit') | let s:race='edit'
  let request_count=len(g:delivery_render_requests)
  call s:locked()
  let before=s:native()
  call s:drain()
  call assert_equal(before,s:native()) | call assert_match('NEWER NATIVE EDIT',getline(1))
  call assert_equal(request_count,len(g:delivery_render_requests))
  call assert_false(wbx#drafts#pending())
  call assert_equal(1,g:delivery_render_events[s:held.params.requestId]) | let s:race=''
  call add(s:checks,'native edits returned by the expression mapping beat deferred clearing; rendering retains current text/full undo/focus')

  for status in ['unknown','failed']
    let s:held=s:send('Retained '.status.' outcome under textlock') | let s:status=status
    let request_count=len(g:delivery_render_requests)
    call s:locked() | call s:drain()
    call assert_equal(s:held.params.text,getline(1))
    call assert_equal(status==# 'unknown',wbx#drafts#uncertain('A'))
    call assert_equal(request_count,len(g:delivery_render_requests))
    call assert_equal(1,g:delivery_render_events[s:held.params.requestId])
    if status==# 'unknown'
      call assert_match('Delivery uncertain',join(getbufline(wbx#buffers().history,1,'$'),"\n"))
      WebexSend | call assert_equal(request_count,len(g:delivery_render_requests))
      WebexResolveDelivery
      let resolve=g:delivery_render_requests[-1]
      call assert_equal('delivery.resolveBound',resolve.method)
      call wbx#_receive({'jsonrpc':'2.0','id':resolve.id,'result':{'roomId':'A'}})
      call assert_false(wbx#drafts#uncertain('A'))
    endif
  endfor
  let s:status='sent'
  let recovered=s:send('Explicit recovery after checked outcomes')
  call s:emit(recovered,'sent') | call assert_equal([''],getline(1,'$'))
  call add(s:checks,'unknown/failed locked ACKs retain native work and exact recovery policy; no automatic resolve/retry or duplicate delivery event')

  let s:held=s:send('Retired session ACK under textlock') | let s:race='session'
  call s:locked()
  let before=s:native() | let request_count=len(g:delivery_render_requests)
  call s:drain()
  call assert_equal(before,s:native()) | call assert_equal(s:held.params.text,getline(1))
  call assert_equal(request_count,len(g:delivery_render_requests))
  let history=join(getbufline(wbx#buffers().history,1,'$'),"\n")
  call assert_match('History session b',history) | call assert_notmatch('History session a',history)
  call assert_false(getbufvar(wbx#buffers().history,'&modifiable'))
  WebexSend | call assert_equal(request_count,len(g:delivery_render_requests),'old-account draft remains unverified')
  let retired=bufnr('%')
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.retired.txt') | setlocal buftype=
  WebexCompose
  let fresh=s:send('Fresh explicit replacement-session ACK')
  call s:emit(s:held,'sent') | call assert_true(wbx#drafts#pending())
  call s:emit(fresh,'sent')
  call assert_equal([''],getline(1,'$')) | call assert_false(wbx#drafts#pending())
  call assert_equal(['Retired session ACK under textlock'],getbufline(retired,1,'$'))
  call assert_equal(1,g:delivery_render_events[s:held.params.requestId])
  call add(s:checks,'session replacement cancels retired redraw/clear callbacks, renders current session only and preserves explicit new-session recovery')
  call assert_equal([],filter(values(g:delivery_render_events),'v:val != 1'))
  if $WBX_EDITOR_SCREEN==# '1'
    call setline(1,'Visible complete ACK recovery surface')
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Visible complete ACK recovery surface',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Visible complete ACK recovery surface"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call s:drain()
let g:delivery_render_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'completeTextlockACKObserved':s:locked_seen,
      \ 'sendRecords':len(s:sends()),'deliveryEvents':len(g:delivery_render_events),
      \ 'requests':map(copy(g:delivery_render_requests),'v:val.method'),
      \ 'scope':'real complete ACK/native expression textlock/renderer/view/draft owners; inert physical transport only; no service'})],$WBX_EDITOR_RESULT)
qa!
