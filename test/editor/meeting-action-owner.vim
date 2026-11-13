" Logical meeting owner with real native intent primitives; inert RPC and terminal effects.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload','p')
call writefile(['function! wbx#state() abort','return {"state":"idle","ready":0,"room":v:null}','endfunction'],s:stub.'/autoload/wbx.vim')
execute 'set rtp^='.fnameescape(s:stub)
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:effects=[] | let s:notices=[] | let s:invalid=0
let s:ready=1 | let s:disconnected=0 | let s:closing=0 | let s:refuse=0 | let s:sync=0 | let s:input=''
let s:caps=['meeting-tmux','meeting-panes-v1','upcoming-meetings']
let s:options={'demo':0,'config':'','meeting':{'display':'editor','fallback':'editor','headless_demo':1,'call_id':'test-only'}}
function! s:options() abort
  return deepcopy(s:options)
endfunction
function! s:input(prompt) abort
  call assert_equal('Webex HTTPS meeting link: ',a:prompt)
  return s:input
endfunction
function! s:ready() abort
  return s:ready
endfunction
function! s:disconnected() abort
  return s:disconnected
endfunction
function! s:closing() abort
  return s:closing
endfunction
function! s:caps() abort
  return copy(s:caps)
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:invalid() abort
  let s:invalid+=1
endfunction
function! s:effect(name, ...) abort
  call add(s:effects,[a:name]+a:000)
endfunction
function! s:request(method, params, ...) abort
  call add(s:requests,{'method':a:method,'params':deepcopy(a:params),'Callback':a:0 ? a:1 : 0})
  if s:sync && a:method==# 'meeting.pane'
    call call(a:1,[{'result':{'session':a:params.session,'revision':a:params.intent.revision,'action':a:params.intent.action,'status':'applied'}}])
  endif
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:meeting(session) abort
  return {'active':v:true,'ready':v:true,'session':a:session,'attach':['synthetic-client'],'display':'editor',
        \ 'panes':{'version':1,'revision':1,'layouts':['gallery'],'sources':[]}}
endfunction
function! s:pane() abort
  call wbx#meeting_action#pane(s:owner,wbx#view#intent(),s:owner.epoch,deepcopy(s:owner.meeting),[{'action':'layout','layout':'gallery'}],1)
  return s:requests[-1]
endfunction
function! s:reply(request, status) abort
  call call(a:request.Callback,[{'result':{'session':a:request.params.session,'revision':a:request.params.intent.revision,
        \ 'action':a:request.params.intent.action,'status':a:status}}])
endfunction
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
try
  enew | file meeting-action-native.txt | call setline(1,'Independent native meeting work') | call feedkeys("i\<Esc>",'xt')
  let native=s:native() | let cpo=&cpoptions
  let s:owner=wbx#meeting_action#new({'Options':function('s:options'),'Input':function('s:input'),
        \ 'Ready':function('s:ready'),'Disconnected':function('s:disconnected'),'Closing':function('s:closing'),
        \ 'Capabilities':function('s:caps'),'Request':function('s:request'),'Notify':function('s:notify'),'ProtocolError':function('s:invalid'),
        \ 'Render':function('s:effect',['render']),'Event':function('s:effect',['event']),'CancelSelection':function('s:effect',['selection']),
        \ 'Focus':function('s:effect',['focus']),'Detach':function('s:effect',['detach']),'Terminal':function('s:effect',['terminal'])})
  call assert_equal(cpo,&cpoptions) | call assert_equal([],s:requests)
  call assert_equal(['detached','epoch','events','meeting','pending','ports','serial','terminal_session'],sort(keys(s:owner)))
  call wbx#meeting_action#start(s:owner,'',0) | call assert_equal([],s:requests,'empty live prompt cancels')
  call wbx#meeting_action#start(s:owner,'',1)
  call assert_equal({'mode':'demo','display':'editor','fallback':'editor','headless':v:true,'callId':'test-only'},s:requests[-1].params)
  call wbx#meeting_action#start(s:owner,'https://synthetic.invalid/meeting',0)
  call assert_equal('meeting.start',s:requests[-1].method)
  call assert_equal(v:false,s:requests[-1].params.headless) | call assert_equal('live',s:requests[-1].params.mode)
  call assert_equal('https://synthetic.invalid/meeting',s:requests[-1].params.meeting)
  call add(s:checks,'construction is inert; explicit start preserves live/demo/headless/prompt/config policy without joins or retries inferred from state')

  let s:effects=[]
  call wbx#meeting_action#receive(s:owner,s:meeting('wbx-one'))
  call assert_equal(['render','terminal','event'],map(copy(s:effects),'v:val[0]'))
  call wbx#meeting_action#detach(s:owner)
  let s:effects=[] | call wbx#meeting_action#receive(s:owner,s:meeting('wbx-one'))
  call assert_equal(['render','event'],map(copy(s:effects),'v:val[0]'))
  call wbx#meeting_action#present(s:owner,'editor')
  call assert_equal('focus',s:effects[-1][0]) | call assert_equal('meeting.present',s:requests[-1].method)
  let s:effects=[] | let s:closing=1 | call wbx#meeting_action#receive(s:owner,s:meeting('wbx-one'))
  call assert_equal(['render','event'],map(copy(s:effects),'v:val[0]'))
  let s:closing=0
  let value=s:meeting('wbx-one') | let value.display='kitty'
  let s:effects=[] | call wbx#meeting_action#receive(s:owner,value)
  call assert_equal(['detach','render','event'],map(copy(s:effects),'v:val[0]'))
  call add(s:checks,'observation renders before terminal attach/event; local detach/closing suppress reattach, explicit editor presentation focuses first, noneditor state detaches only the client')

  call wbx#meeting_action#media(s:owner,{'type':'send-state','kind':'microphone','state':'on'})
  let copy=wbx#meeting_action#events(s:owner) | let copy['send-state:microphone'].state='off'
  call assert_equal('on',s:owner.events['send-state:microphone'].state)
  let epoch=s:owner.epoch | let value=deepcopy(s:owner.meeting)
  call wbx#meeting_action#observe(s:owner,value) | call assert_equal(epoch,s:owner.epoch)
  let value=deepcopy(value) | let value.ready=v:false | call wbx#meeting_action#observe(s:owner,value)
  call assert_equal(epoch+1,s:owner.epoch) | call assert_true(has_key(s:owner.events,'send-state:microphone'))
  call assert_true(wbx#meeting_action#supports(s:owner,'meeting-tmux',1))
  call assert_false(wbx#meeting_action#supports(s:owner,'meeting-tmux',0))
  call wbx#meeting_action#reconnect(s:owner)
  call assert_equal({'session':'wbx-one'},s:requests[-1].params) | call assert_equal('meeting.reconnect',s:requests[-1].method)
  let requests=len(s:requests) | call wbx#meeting_action#auth(s:owner) | call assert_equal(requests,len(s:requests))
  call wbx#meeting_action#observe(s:owner,s:meeting('wbx-two')) | call assert_equal({},s:owner.events)
  call wbx#meeting_action#auth(s:owner) | call assert_equal({'action':'auth.refresh'},s:requests[-1].params)
  call assert_equal(native,s:native())
  call add(s:checks,'meeting readiness/capabilities remain independent of idle messaging; observations are detached copies, owner replacement clears events and explicit reconnect never joins/replays')

  let request=s:pane()
  let value=deepcopy(s:owner.meeting) | let value.panes.revision+=1
  call wbx#meeting_action#observe(s:owner,value)
  let notices=len(s:notices) | call s:reply(request,'applied')
  call assert_equal(notices+1,len(s:notices),'same-owner normal revision publication must not over-fence its ACK')
  call assert_equal(0,s:owner.pending)
  let s:sync=1 | call s:pane() | call assert_equal(0,s:owner.pending) | let s:sync=0
  call add(s:checks,'exact pane ACK retires admission; same-owner revision publication before ACK and synchronous completion both succeed without interpreting presentation as transmission')

  let request=s:pane()
  call call(request.Callback,[{'error':{'code':-1,'message':'Synthetic failure'}}])
  call assert_equal(0,s:owner.pending)
  let requests=len(s:requests) | sleep 25m | call assert_equal(requests,len(s:requests))
  let request=s:pane() | call s:reply(request,'unknown')
  let request=s:pane() | call s:reply(request,'refused')
  let s:refuse=1 | call s:pane() | call assert_equal(0,s:owner.pending) | let s:refuse=0
  let request=s:pane() | call s:reply(request,'applied')
  call add(s:checks,'error/unknown/refused/dispatch refusal release only logical request admission; no automatic mutation retry and each fresh deliberate recovery remains possible')

  let old=s:pane() | let retired=s:owner.pending
  call wbx#meeting_action#observe(s:owner,s:meeting('wbx-replacement'))
  call assert_equal(0,s:owner.pending)
  let current=s:pane() | call assert_true(s:owner.pending>retired)
  let pending=s:owner.pending | let notices=len(s:notices)
  call call(old.Callback,[{'result':v:null}])
  call assert_equal(pending,s:owner.pending) | call assert_equal(notices,len(s:notices)) | call assert_equal(0,s:invalid)
  call s:reply(current,'applied')
  let old=s:pane() | call wbx#meeting_action#lost(s:owner)
  call wbx#meeting_action#unready(s:owner) | call assert_false(s:owner.meeting.ready)
  call call(old.Callback,[{'result':v:null}]) | call assert_equal(0,s:invalid)
  call wbx#meeting_action#observe(s:owner,s:meeting('wbx-replacement'))
  let request=s:pane() | call call(request.Callback,[{'result':{'session':'wrong'}}])
  call assert_equal(1,s:invalid)
  call add(s:checks,'meeting replacement/loss fences retired ACKs before body interpretation and cannot release newer requests; malformed current ACK retains protocol-failure behavior')

  let snapshot=deepcopy(s:owner.meeting) | let epoch=s:owner.epoch | let origin=wbx#view#intent()
  call wbx#meeting_action#media(s:owner,{'type':'status','state':'connected'})
  let requests=len(s:requests)
  call setline(1,'New native text') | call feedkeys("i\<Esc>",'xt')
  call wbx#meeting_action#pane(s:owner,origin,epoch,snapshot,[{'action':'layout','layout':'gallery'}],1)
  call assert_equal(requests,len(s:requests))
  let origin=wbx#view#intent() | let value=deepcopy(snapshot) | let value.panes.revision+=1
  call wbx#meeting_action#observe(s:owner,value)
  call wbx#meeting_action#pane(s:owner,origin,epoch,snapshot,[{'action':'layout','layout':'gallery'}],1)
  call assert_equal(requests,len(s:requests))
  call wbx#meeting_action#pane(s:owner,wbx#view#intent(),s:owner.epoch,deepcopy(s:owner.meeting),[{'action':'source.set','source':'video','available':0}],1)
  call assert_equal(requests,len(s:requests))
  call add(s:checks,'native edits, stale modal epoch/envelope and unavailable source slots reject old choices without target substitution')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
    endfor
    call assert_match('New native text',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "New native text"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'scope':'real native intent with inert application/RPC/terminal ports; no transport process/tmux/provider'})],$WBX_EDITOR_RESULT)
qa!
