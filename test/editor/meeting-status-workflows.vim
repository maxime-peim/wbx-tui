" Public status with actual observation/RPC/view/connection owners; only physical transport/terminal inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:status_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:status_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:status_flow_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:status_flow_running=0','call wbx#_exit(0)','endfunction',
      \ 'function! wbx#transport#terminal(command) abort','throw "Status must not open a terminal"','endfunction',
      \ 'function! wbx#transport#detach() abort','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:status_flow_running=1 | let g:status_flow_requests=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':0,'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
let s:checks=[] | let s:drawn=[] | let s:session='wbx-observed' | let s:ready=1
function! s:meeting() abort
  return {'active':v:true,'ready':s:ready ? v:true : v:false,'session':s:session,'display':'kitty','attach':[]}
endfunction
function! s:state(status) abort
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':a:status,'mode':'demo','ready':v:false,'rooms':[],'messages':[],'room':v:null}
endfunction
function! s:hello(...) abort
  let value={'version':1,'state':s:state('idle'),'meeting':s:meeting(),'capabilities':['meeting-tmux','local-context-v1']}
  call assert_true(wbx#protocol#hello(value))
  if a:0 | call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else | call call(s:Hello,[{'result':value}]) | endif
endfunction
function! s:emit(method, params) abort
  let envelope={'jsonrpc':'2.0','method':a:method,'params':a:params}
  call assert_true(wbx#protocol#valid(envelope),json_encode(envelope))
  call wbx#_receive(envelope)
endfunction
function! s:media(value) abort
  call s:emit('meeting.event',a:value)
endfunction
function! s:text() abort
  return join(getbufline(wbx#buffers().meeting,1,'$'),"\n")
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:reply(request, ...) abort
  call wbx#_receive(extend({'jsonrpc':'2.0','id':a:request.id},a:0 ? {'error':{'code':-1,'message':'Synthetic owner unavailable'}} : {'result':v:null}))
endfunction
function! s:screen(pattern) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  normal! ggzt
  redraw!
  let info=getwininfo(win_getid())[0] | let rows=[]
  for row in range(info.winrow,info.winrow+info.height-1)
    call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
  endfor
  call assert_match(a:pattern,join(rows,"\n"))
  call add(s:drawn,filter(rows,'v:val =~# a:pattern'))
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call s:hello()
  WebexMeetingStatus
  call assert_match('microphone: unknown (no observation)',s:text())
  call assert_match('Sources:.*unknown / no observation',s:text())
  let requests=len(g:status_flow_requests)
  call feedkeys("\<CR>",'xt') | silent! write
  WebexRefresh | call wbx#redraw()
  call assert_equal(requests,len(g:status_flow_requests),'status/refresh/Enter/write cannot control or reconnect')
  WebexMicrophone
  let control=g:status_flow_requests[-1]
  call assert_equal('meeting.control',control.method) | call assert_equal({'action':'microphone.toggle'},control.params)
  call s:reply(control)
  call assert_match('mic:unknown',wbx#status(),'RPC acceptance is not a sending observation')
  call s:media({'type':'status','state':'connected'})
  call s:media({'type':'send-state','kind':'microphone','state':'on','requestId':1})
  call s:media({'type':'send-state','kind':'camera','state':'awaiting','requestId':2})
  call s:media({'type':'send-state','kind':'screen','state':'starting','requestId':3})
  call assert_match('microphone: on (confirmed sending)',s:text())
  call assert_match('camera: awaiting (pending trusted browser confirmation; not confirmed sending)',s:text())
  call assert_match('screen: starting (starting; not confirmed sending)',s:text())
  call assert_match('mic:on cam:awaiting share:starting',wbx#status())
  call add(s:checks,'normal public status updates synchronously from accepted media events; RPC control acceptance, ordinary refresh/Enter/write and missing evidence never fabricate transmission')

  call s:media({'type':'camera-state','state':'on','sending':v:false,'requestId':4})
  call s:media({'type':'audio-state','enabled':v:true})
  call s:media({'type':'sources','sources':[{'id':'local','kind':'local','label':'Local','available':v:true},
        \ {'id':'video','kind':'video','label':"Received\tvideo",'available':v:false,'present':v:false}]})
  call s:media({'type':'auth-state','method':'oauth','state':'failed','reason':'expired'})
  call s:media({'type':'notice','message':"Synthetic\tstatus\nnotice"})
  call assert_match('Local preview: on · NOT SENT',s:text())
  call assert_match('Rx audio playback: enabled (not microphone sending)',s:text())
  call assert_match('NOT complete attendee/self/lobby coverage',s:text())
  call assert_match('Rx video: Received video · unavailable · participant not reported present',s:text())
  call assert_match('Authentication: failed · reason: expired',s:text())
  call assert_match('Notice: Synthetic status notice',s:text())
  let buffer=bufnr('%') | let tick=b:changedtick
  call wbx#redraw() | WebexRefresh
  call assert_equal(tick,b:changedtick,'unchanged status does not rewrite native projection')
  call s:screen('Webex meeting')
  call add(s:checks,'preview/Rx remain separate from sending; bounded source slots, sanitized notices and authentication details project normally without rewriting unchanged text')

  enew | file status-independent.txt
  call setline(1,['Independent native status work','Fold body','Fold end','Tail']) | call feedkeys("i\<Esc>",'xt')
  setlocal foldmethod=manual
  1,3fold
  let native=s:native() | let closed=foldclosed(2)
  let g:status_flow_running=0 | call wbx#_exit(0)
  call assert_equal(native,s:native()) | call assert_equal(closed,foldclosed(2))
  call assert_match('STATUS UNKNOWN (backend disconnected)',s:text())
  call assert_match('not proof of stopped sending',s:text())
  call assert_match('Last reported microphone: on (confirmed sending)',s:text())
  call assert_match('CALL STALE/UNKNOWN mic:unknown cam:unknown share:unknown Rx:unknown',wbx#status())
  let requests=len(g:status_flow_requests)
  WebexMeetingReconnect | call wbx#redraw() | sleep 25m
  call assert_equal(requests,len(g:status_flow_requests),'disconnected display does not reconnect or retry')
  let window=win_getid()
  WebexMeetingStatus | call s:screen('STATUS UNKNOWN')
  call win_gotoid(window)
  execute 'buffer '.native[0]
  call add(s:checks,'backend loss retains last reports but marks current media unknown; independent native text/full undo/focus/folds survive and neither redraw nor unavailable recovery auto-rejoins')

  let s:ready=0
  WebexDemo | let hello=g:status_flow_requests[-1] | call assert_equal('hello',hello.method)
  call s:hello(hello.id)
  call assert_equal('session.start',g:status_flow_requests[-1].method)
  call s:reply(g:status_flow_requests[-1])
  WebexMeetingStatus
  call assert_match('Observations STALE',s:text())
  WebexMeetingReconnect | let failed=g:status_flow_requests[-1]
  call assert_equal('meeting.reconnect',failed.method) | call assert_equal({'session':'wbx-observed'},failed.params)
  call s:reply(failed,1)
  let requests=len(g:status_flow_requests) | sleep 25m | call assert_equal(requests,len(g:status_flow_requests))
  WebexMeetingReconnect | let current=g:status_flow_requests[-1] | call assert_true(current.id>failed.id)
  call s:reply(current)
  call assert_match('Observations STALE',s:text(),'ACK alone cannot establish current readiness')
  let s:ready=1 | call s:emit('meeting',s:meeting())
  call assert_notmatch('Observations STALE',s:text())
  call assert_match('Controls: ready',s:text())
  call s:media({'type':'send-state','kind':'microphone','state':'off','requestId':5,'reason':'host-muted'})
  call assert_match('microphone: off (not sending) · reason: host-muted',s:text())
  call assert_match('mic:off',wbx#status())
  call add(s:checks,'explicit transport handshake and same-owner recovery retain distinct authority; error never retries, new deliberate recovery plus authoritative readiness/events restores truthful status without control replay')

  for state in ['failed','ended']
    call s:media({'type':'status','state':state})
    call assert_match('Observations STALE',s:text())
    call assert_match('Last reported Call: '.state,s:text())
    call assert_match('mic:unknown',wbx#status())
  endfor
  call s:media({'type':'status','state':'connected'})
  call s:emit('state',s:state('failed'))
  call assert_notmatch('Observations STALE',s:text(),'messaging failure is not independent meeting failure')
  let s:session='wbx-replacement' | call s:emit('meeting',s:meeting())
  call assert_equal({},wbx#meeting_events())
  call assert_match('microphone: unknown (no observation)',s:text())
  call s:media({'type':'send-state','kind':'microphone','state':'on','requestId':6})
  call assert_match('mic:on',wbx#status())
  call add(s:checks,'failed/ended call reports become stale, not synthetic stopped sending; messaging failure stays independent and replacement owner clears observation storage before new reports')

  WebexMeetingStatus
  setlocal modifiable
  call append('$','Native status annotation') | call feedkeys("i\<Esc>",'xt')
  let annotated=s:native()
  call s:media({'type':'send-state','kind':'microphone','state':'off','requestId':7})
  WebexRefresh
  call assert_equal(annotated,s:native(),'native annotation and full undo are not presentation-owner storage')
  call assert_match('mic:off',wbx#status(),'compact still uses current observations when annotated detail is retained')
  WebexRefresh!
  call assert_notmatch('Native status annotation',s:text())
  call assert_match('microphone: off (not sending)',s:text())
  setlocal modifiable
  call append('$','Promoted status work') | call feedkeys("i\<Esc>",'xt')
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.promoted.txt')
  setlocal buftype=
  let promoted=s:native()
  call s:media({'type':'send-state','kind':'camera','state':'off','requestId':8})
  call assert_equal(promoted,s:native())
  WebexMeetingStatus
  call assert_notequal(promoted[0],bufnr('%'))
  call assert_match('camera: off (not sending)',s:text())
  call s:screen('Webex meeting')
  call assert_equal([],filter(copy(g:status_flow_requests),'index(["meeting.control","meeting.reconnect","hello","session.start"],v:val.method)<0'))
  call assert_equal(1,len(filter(copy(g:status_flow_requests),'v:val.method==# "meeting.control"')))
  call add(s:checks,'native annotations/promoted text and full undo survive new observations; explicit refresh! rebuilds only generated detail and current compact state remains independent')
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:status_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'methods':map(copy(g:status_flow_requests),'v:val.method'),
      \ 'scope':'public status/control/recovery, actual observation/RPC/connection/native write owners; inert physical transport only, no service/device/live media'})],$WBX_EDITOR_RESULT)
qa!
