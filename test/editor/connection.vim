" Standalone connection composition; physical transport and application ports inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:checks=[] | let g:cx_events=[] | let g:cx_writes=[] | let g:cx_notices=[] | let g:cx_answers=[]
let g:cx_running=0 | let g:cx_start_ok=1 | let g:cx_backend=['/bin/false']
function! s:backend() abort
  return g:cx_backend
endfunction
function! s:running() abort
  return g:cx_running
endfunction
function! s:prepare() abort
  call add(g:cx_events,'prepare')
endfunction
function! s:start(command) abort
  call assert_equal(g:cx_backend,a:command)
  call add(g:cx_events,'start')
  let g:cx_running=g:cx_start_ok
  return g:cx_running
endfunction
function! s:started() abort
  call add(g:cx_events,'started')
endfunction
function! s:accept(result) abort
  call assert_true(wbx#connection#ready(g:cx))
  call add(g:cx_events,'accept')
endfunction
function! s:stop() abort
  let g:cx_running=0
  call add(g:cx_events,'stop')
  call wbx#connection#lost(g:cx)
endfunction
function! s:write(wire) abort
  let request=json_decode(a:wire)
  call add(g:cx_writes,request)
  call add(g:cx_events,request.method)
endfunction
function! s:notify(text) abort
  call add(g:cx_notices,a:text)
endfunction
function! s:answer(response) abort
  call add(g:cx_answers,a:response)
endfunction
function! s:result() abort
  return {'version':1,'state':{'revision':0,'state':'idle','mode':'demo','rooms':[],'messages':[],'room':v:null,'ready':v:false},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','meeting-tmux','local-context-v1'],
        \ 'localDrafts':['disk-v1']}
endfunction
function! s:reply(id, result) abort
  call wbx#connection#response(g:cx,{'id':a:id,'result':a:result})
endfunction
try
  let ports={'Backend':function('s:backend'),'Running':function('s:running'),'Prepare':function('s:prepare'),
        \ 'Start':function('s:start'),'Started':function('s:started'),'Stop':function('s:stop'),'Write':function('s:write'),
        \ 'Accept':function('s:accept'),'Notify':function('s:notify')}
  let g:cx=wbx#connection#new($WBX_EDITOR_RESULT.'.missing-root',ports)
  call assert_false(wbx#connection#ready(g:cx))
  call assert_false(wbx#connection#disconnected(g:cx))
  let before=wbx#connection#requests(g:cx)
  let g:cx_backend=[]
  call assert_false(wbx#connection#ensure(g:cx),'missing default bundle is rejected')
  let g:cx_backend=['/nonexistent/wbx-confirmation-backend']
  call assert_false(wbx#connection#ensure(g:cx),'invalid executable is rejected')
  call assert_equal([],g:cx_events,'configuration failures cannot retire/reset application work')
  call assert_equal(before,wbx#connection#requests(g:cx))
  call add(s:checks,'configuration validated before reset/start')

  let g:cx_backend=['/bin/false'] | let g:cx_start_ok=0
  call assert_equal(-1,wbx#connection#request(g:cx,'state.get',{}))
  call assert_equal(['prepare','start'],g:cx_events)
  call assert_equal(before,wbx#connection#requests(g:cx),'failed start allocates no request')
  call assert_equal([],g:cx_writes)
  call add(s:checks,'failed physical start cannot issue hello or queue work')

  let g:cx_events=[] | let g:cx_start_ok=1
  call assert_equal(-1,wbx#connection#request(g:cx,'messages.reactions',{},function('s:answer'),'passive-reactions'))
  call assert_equal([],g:cx_events,'cold passive read has no startup authority')
  let params={'mode':'demo','upcomingMeetings':v:true,'spacesCache':v:true,'notificationPreview':v:true,'senderNames':v:true}
  let id=wbx#connection#request(g:cx,'session.start',params,function('s:answer'))
  call assert_equal(2,id)
  call assert_equal(['prepare','start','started','hello'],g:cx_events)
  call assert_equal(1,wbx#connection#requests(g:cx).queued)
  let hello=g:cx_writes[-1]
  call s:reply(hello.id,s:result())
  call assert_equal(['prepare','start','started','hello','accept','session.start'],g:cx_events)
  call assert_equal({'mode':'demo'},g:cx_writes[-1].params)
  call assert_equal(5,len(keys(params)),'downgrade never edits caller params')
  call assert_equal(6,len(g:cx_notices),'three startup diagnostics + three exact compatibility notices')
  call assert_equal(['Spaces cache requires an updated backend. Ordinary messaging will continue without it.',
        \ 'Other-space notification previews require an updated backend. Notifications will continue without excerpts.',
        \ 'Sender names require an updated backend. Existing message labels and excerpts are unchanged.'],g:cx_notices[-3:])
  call s:reply(id,v:null)
  call add(s:checks,'one held hello accepts application before FIFO; legacy flags downgraded')

  let detached=wbx#connection#feature(g:cx,'localDrafts')
  let detached[0]='foreign'
  call assert_equal(['disk-v1'],wbx#connection#feature(g:cx,'localDrafts'))
  call wbx#connection#session(g:cx)
  call assert_equal(['disk-v1'],wbx#connection#feature(g:cx,'localDrafts'))
  call assert_true(wbx#connection#ready(g:cx))
  call assert_false(wbx#connection#disconnected(g:cx))
  call add(s:checks,'detached feature assertions survive messaging session boundary')

  let old=wbx#connection#request(g:cx,'state.get',{},function('s:answer'))
  let answers=len(g:cx_answers)
  call wbx#connection#stop(g:cx)
  call assert_true(wbx#connection#disconnected(g:cx))
  call assert_false(wbx#connection#ready(g:cx))
  call assert_equal([],wbx#connection#feature(g:cx,'localDrafts'))
  let starts=count(g:cx_events,'start')
  call assert_equal(-1,wbx#connection#request(g:cx,'messages.reactionsBatch',{},function('s:answer'),'passive-reactions'))
  call assert_equal(starts,count(g:cx_events,'start'))
  let fresh=wbx#connection#request(g:cx,'state.get',{},function('s:answer'))
  let hello=g:cx_writes[-1]
  call assert_true(hello.id>old && fresh>hello.id)
  call s:reply(old,v:null)
  call assert_equal(answers,len(g:cx_answers))
  let result=s:result() | let result.capabilities+=['spaces-cache','upcoming-meetings','notification-previews','sender-names-v1']
  call s:reply(hello.id,result)
  call s:reply(fresh,v:null)
  call assert_equal(answers+1,len(g:cx_answers))
  let id=wbx#connection#request(g:cx,'session.start',params)
  call assert_equal(params,g:cx_writes[-1].params,'advertised flags preserved exactly')
  call s:reply(id,v:null)
  call add(s:checks,'transport replacement clears assertions/callbacks, monotonic reconnect never replays')

  for bad in ['version','error']
    call wbx#connection#stop(g:cx)
    let id=wbx#connection#request(g:cx,'state.get',{},function('s:answer'))
    let hello=g:cx_writes[-1] | let sent=len(g:cx_writes) | let accepted=count(g:cx_events,'accept')
    if bad==# 'version'
      let result=s:result() | let result.version=999
      call s:reply(hello.id,result)
      call assert_match('Invalid backend protocol',g:cx_notices[-1])
    else
      call wbx#connection#response(g:cx,{'id':hello.id,'error':{'code':-32000,'message':'not supported'}})
      call assert_match('Unsupported backend protocol',g:cx_notices[-1])
    endif
    call assert_equal(accepted,count(g:cx_events,'accept'))
    call assert_equal(sent,len(g:cx_writes),'invalid negotiation never flushes queued work')
    call assert_false(wbx#connection#ready(g:cx))
    call assert_true(wbx#connection#disconnected(g:cx))
    call assert_equal(0,wbx#connection#requests(g:cx).pending)
    call assert_equal(0,wbx#connection#requests(g:cx).queued)
    call add(s:checks,'invalid hello/'.bad.' stops before accept/drain')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'events':g:cx_events,
      \ 'scope':'standalone connection + unchanged request channel; inert physical/application ports'})],$WBX_EDITOR_RESULT)
qa!
