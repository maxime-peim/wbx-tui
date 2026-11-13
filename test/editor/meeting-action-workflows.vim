" Public meeting actions and pane ACKs with real native RPC/state/view owners; inert transport/terminal effects.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:meeting_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:meeting_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:meeting_flow_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:meeting_flow_running=0','call wbx#_exit(0)','endfunction',
      \ 'function! wbx#transport#terminal(command) abort','call add(g:meeting_flow_terminals,copy(a:command))','endfunction',
      \ 'function! wbx#transport#detach() abort','let g:meeting_flow_detaches+=1','endfunction',
      \ 'function! wbx#transport#focus() abort','let g:meeting_flow_focus+=1','return 1','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:meeting_flow_running=1 | let g:meeting_flow_requests=[] | let g:meeting_flow_terminals=[]
let g:meeting_flow_detaches=0 | let g:meeting_flow_focus=0
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,'upcoming_meetings':0,
      \ 'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
runtime autoload/wbx/meeting.vim
let s:checks=[] | let s:drawn=[] | let s:session='wbx-first' | let s:revision=1 | let s:active=0
function! s:state(status) abort
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':a:status,'mode':'demo','ready':v:false,
        \ 'rooms':[],'room':v:null,'messages':[]}
endfunction
function! s:meeting() abort
  return {'active':s:active ? v:true : v:false,'ready':s:active ? v:true : v:false,'session':s:active ? s:session : v:null,'display':'editor',
        \ 'attach':s:active ? ['tmux','-S','/synthetic-only/meeting.sock','attach-session','-t',s:session] : [],
        \ 'panes':{'version':1,'revision':s:revision,'layouts':['gallery','speaker'],'sources':[{'id':'video','kind':'video','label':'Bound slot','available':v:true}]}}
endfunction
function! s:hello(...) abort
  let value={'version':1,'state':s:state('idle'),'meeting':s:meeting(),'capabilities':['meeting-tmux','meeting-panes-v1','local-context-v1']}
  call assert_true(wbx#protocol#hello(value),json_encode(value))
  if a:0 | call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else | call call(s:Hello,[{'result':value}]) | endif
endfunction
function! s:publish() abort
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting','params':s:meeting()})
endfunction
function! s:requests(method) abort
  return filter(copy(g:meeting_flow_requests),'v:val.method==# a:method')
endfunction
function! s:pane() abort
  let requests=len(s:requests('meeting.pane'))
  WebexMeetingLayout
  call assert_equal(requests+1,len(s:requests('meeting.pane')))
  return s:requests('meeting.pane')[-1]
endfunction
function! s:reply(request, status) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':{'session':a:request.params.session,'revision':a:request.params.intent.revision,
        \ 'action':a:request.params.intent.action,'status':a:status}})
endfunction
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
function! s:reconnect() abort
  WebexDemo
  let hello=g:meeting_flow_requests[-1] | call assert_equal('hello',hello.method)
  call s:hello(hello.id) | call assert_equal('session.start',g:meeting_flow_requests[-1].method)
  call wbx#_receive({'jsonrpc':'2.0','id':g:meeting_flow_requests[-1].id,'result':v:null})
  " Demo is an explicit workspace command; restore the independent native view
  " before testing subsequent meeting-only focus/text/undo preservation.
  call win_gotoid(s:native_window)
  execute 'buffer '.s:native_buffer
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call s:hello()
  let picker=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx/meeting.vim$"')[0].sid
  execute 'function! <SNR>'.picker."_pick(lines, Callback) abort\ncall call(a:Callback,[1])\nendfunction"
  enew | file meeting-independent-native.txt | call setline(1,'Native meeting workflow work') | call feedkeys("i\<Esc>",'xt')
  let native=s:native()
  let s:native_window=win_getid() | let s:native_buffer=bufnr('%')
  WebexMeetingDemo
  call assert_equal('meeting.start',g:meeting_flow_requests[-1].method)
  call assert_equal('demo',g:meeting_flow_requests[-1].params.mode)
  call assert_false(wbx#meeting_state().active,'request dispatch alone is not authoritative meeting readiness')
  let s:active=1 | call s:publish()
  call assert_true(wbx#meeting_state().ready)
  call assert_equal(1,len(g:meeting_flow_terminals))
  call assert_equal(native,s:native())
  let request=s:pane()
  let s:revision+=1 | call s:publish()
  call s:reply(request,'applied')
  call assert_match('Pane operation applied',execute('messages'))
  call assert_equal(0,wbx#_meeting_pending())
  call add(s:checks,'explicit demo start then authoritative ready publication and a normal pane ACK succeed with idle messaging; same-owner revision publication before ACK is accepted')

  WebexMeetingDetach
  let terminals=len(g:meeting_flow_terminals) | call s:publish()
  call assert_equal(terminals,len(g:meeting_flow_terminals),'local detach prevents automatic view reopening')
  WebexMeetingEditor
  call assert_equal(1,g:meeting_flow_focus)
  call assert_equal('meeting.present',g:meeting_flow_requests[-1].method)
  call s:publish() | call assert_equal(terminals+1,len(g:meeting_flow_terminals))
  call wbx#_meeting_view_closed() | let terminals=len(g:meeting_flow_terminals)
  call s:publish() | call assert_equal(terminals,len(g:meeting_flow_terminals))
  WebexMeetingEditor | call s:publish()
  WebexMicrophone
  call assert_equal({'action':'microphone.toggle'},g:meeting_flow_requests[-1].params)
  call assert_match('mic:unknown',wbx#status(),'control dispatch is not confirmed transmission')
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'send-state','kind':'microphone','state':'on','requestId':1}})
  call assert_match('mic:on',wbx#status())
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':s:state('failed')})
  call assert_true(wbx#meeting_supports('meeting-panes-v1'),'messaging failure cannot revoke independent meeting controls')
  call assert_equal(native,s:native())
  call add(s:checks,'detach/close are local view policy, explicit presentation reopens via the physical port; controls only publish observations when events arrive and messaging failure stays independent')

  let request=s:pane()
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'error':{'code':-32001,'message':'Synthetic pane failure'}})
  let requests=len(g:meeting_flow_requests) | sleep 25m | call assert_equal(requests,len(g:meeting_flow_requests))
  call assert_equal(0,wbx#_meeting_pending())
  let request=s:pane() | call s:reply(request,'unknown')
  let request=s:pane() | call s:reply(request,'refused')
  let request=s:pane() | call s:reply(request,'applied')
  call assert_equal(native,s:native())
  call add(s:checks,'RPC error and owner unknown/refused outcomes never replay mutations; a new deliberate request recovers promptly without touching native work')

  let old=s:pane() | let s:session='wbx-replacement' | let s:revision=1 | call s:publish()
  call assert_equal({},wbx#meeting_events())
  let current=s:pane() | let pending=wbx#_meeting_pending()
  call wbx#_receive({'jsonrpc':'2.0','id':old.id,'result':v:null})
  call assert_true(g:meeting_flow_running,'retired malformed body is not a protocol failure for the replacement')
  call assert_equal(pending,wbx#_meeting_pending())
  let requests=len(s:requests('meeting.pane')) | WebexMeetingLayout | call assert_equal(requests,len(s:requests('meeting.pane')))
  call s:reply(current,'applied')
  let request=s:pane()
  let state=s:state('ready') | let state.localContext={'sessionId':repeat('b',32),'coverage':'session-only'}
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':state})
  call s:reply(request,'applied')
  call assert_equal(0,wbx#_meeting_pending(),'independent meeting ACK survives messaging-session replacement')
  call add(s:checks,'meeting-owner replacement retires old result authority before validation and protects new admission; messaging-session replacement does not invalidate an independent meeting ACK')

  let old=s:pane() | let controls=len(s:requests('meeting.control'))
  let g:meeting_flow_running=0 | call wbx#_exit(0)
  call assert_true(wbx#meeting_state().active) | call assert_false(wbx#meeting_state().ready)
  call assert_equal(0,wbx#_meeting_pending())
  call s:reconnect()
  let current=s:pane() | call assert_true(current.id>old.id)
  call wbx#_receive({'jsonrpc':'2.0','id':old.id,'result':v:null})
  call assert_true(wbx#_meeting_pending()>0)
  call s:reply(current,'applied')
  WebexMeetingReconnect
  call assert_equal('meeting.reconnect',g:meeting_flow_requests[-1].method)
  call assert_equal({'session':'wbx-replacement'},g:meeting_flow_requests[-1].params)
  call assert_equal(1,len(s:requests('meeting.start')),'transport/recovery never rejoins automatically')
  call assert_equal(controls,len(s:requests('meeting.control')),'transport/recovery never replays old controls')
  call add(s:checks,'transport loss retains last owner but marks controls unready and retires callbacks; explicit rehandshake and same-owner recovery preserve monotonic IDs without rejoin/toggle replay')

  let request=s:pane()
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'result':{'session':'wbx-wrong','revision':request.params.intent.revision,'action':'layout','status':'applied'}})
  call assert_false(g:meeting_flow_running)
  call s:reconnect()
  let request=s:pane() | call s:reply(request,'applied')
  call assert_equal(native,s:native())
  WebexMeetingStatus
  call assert_match('Controls: ready',join(getline(1,'$'),"\n"))
  call assert_match('NOT SENT',join(getline(1,'$'),"\n"))
  call add(s:checks,'malformed current-owner ACK uses the original protocol-disconnect contract; fresh explicit recovery works and native status remains truthful about preview/transmission')
  call assert_equal([],filter(copy(g:meeting_flow_requests),'index(["meeting.start","meeting.present","meeting.control","meeting.pane","meeting.reconnect","hello","session.start"],v:val.method)<0'))
  if $WBX_EDITOR_SCREEN==# '1'
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
    endfor
    call assert_match('Webex meeting',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Webex meeting"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:meeting_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'methods':map(copy(g:meeting_flow_requests),'v:val.method'),'terminalIntents':len(g:meeting_flow_terminals),
      \ 'scope':'public commands and actual native RPC/state/intent/view/status owners; inert transport/terminal only, no tmux/browser/devices'})],$WBX_EDITOR_RESULT)
qa!
