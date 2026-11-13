" Real coordinator/connection/channel/meeting control; only transport is inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:cx_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:cx_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:cx_running=1','let g:cx_starts+=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:cx_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:cx_running=0 | let g:cx_starts=0 | let g:cx_writes=[] | let g:cx_answers=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'people_status':0,'read_status':0,
      \ 'upcoming_meetings':1,'spaces_cache':1,'persist_drafts':0,'mark_read_on_open':0,'folds':0}
runtime plugin/wbx.vim
let s:checks=[] | let s:drawn=[] | let s:phases=[]
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:answer(tag, response) abort
  call add(g:cx_answers,a:tag)
endfunction
function! s:reply(id, result) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:id,'result':deepcopy(a:result)})
endfunction
function! s:hello(full) abort
  let result={'version':1,'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:true,'ready':v:true,'session':'wbx-synthetic','attach':[],'display':'editor'},
        \ 'capabilities':['messaging','meeting-tmux','local-context-v1'],'localDrafts':['disk-v1']}
  if a:full | let result.capabilities+=['upcoming-meetings','spaces-cache'] | endif
  return result
endfunction
function! s:phase(phase, session) abort
  let state={'revision':wbx#state().revision+1,'state':a:phase,'mode':'demo','ready':a:phase==# 'ready' ? v:true : v:false,
        \ 'rooms':[],'room':v:null,'messages':[]}
  if !empty(a:session) | let state.localContext={'sessionId':repeat(a:session,32),'coverage':'session-only'} | endif
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':state})
endfunction
function! s:draw(case) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  redraw!
  let info=getwininfo(win_getid())[0] | let row=screenpos(win_getid(),1,1).row
  let text=join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
  call assert_match('Independent connection work',text)
  call add(s:drawn,{'case':a:case,'text':trim(text)})
endfunction
try
  WebexDemo
  call assert_equal(['hello'],map(copy(g:cx_writes),'v:val.method'))
  let first=g:cx_writes[0]
  let old=wbx#rpc('test.hold',{},function('s:answer',['old']))
  botright 5new | file independent-connection-work.txt
  call setline(1,'Independent connection work') | call feedkeys("\<Esc>",'xt')
  call append(1,'Unsynced draft annotation')
  call assert_equal(0,undotree().synced)
  let before=s:native()
  call s:reply(first.id,s:hello(0))
  call assert_equal(['hello','session.start','test.hold'],map(copy(g:cx_writes),'v:val.method'))
  call assert_false(has_key(g:cx_writes[1].params,'upcomingMeetings'))
  call assert_false(has_key(g:cx_writes[1].params,'spacesCache'))
  call s:reply(g:cx_writes[1].id,v:null)
  call assert_equal(before,s:native())
  call s:draw('held-handshake-and-legacy-startup')
  call add(s:checks,'legacy hello applies meeting state before queued session startup')

  for phase in ['ready','failed','ready','idle','ready']
    call s:phase(phase,phase==# 'ready' ? 'b' : '')
    call assert_equal(phase==# 'ready' ? 1 : 0,wbx#supports_local_drafts())
    call assert_true(wbx#meeting_supports('meeting-tmux'),'messaging failure/replacement preserves independent meeting controls')
    silent let health=wbx#health()
    call assert_true(health.protocol_ready,'messaging failure is not a transport failure')
    let sent=len(g:cx_writes)
    WebexMicrophone
    call assert_equal(sent+1,len(g:cx_writes),'meeting action is admitted before any messaging recovery')
    call assert_equal('meeting.control',g:cx_writes[-1].method)
    call assert_equal({'action':'microphone.toggle'},g:cx_writes[-1].params)
    call s:reply(g:cx_writes[-1].id,v:null)
    call assert_equal(before,s:native())
    call add(s:phases,{'messaging':phase,'meeting_control':'acknowledged','protocol_ready':health.protocol_ready})
  endfor
  call assert_equal(1,g:cx_starts)
  call s:draw('meeting-controls-survive-messaging-failure')
  call add(s:checks,'ready-failed-ready-idle-ready: meeting actions succeed without transport restart')

  call wbx#transport#stop()
  call assert_false(wbx#meeting_supports('meeting-tmux'))
  call assert_false(wbx#supports_local_drafts())
  let sent=len(g:cx_writes)
  call assert_equal(-1,wbx#rpc('messages.reactionsBatch',{},function('s:answer',['passive']),'passive-reactions'))
  call assert_equal(sent,len(g:cx_writes)) | call assert_equal(1,g:cx_starts)
  let current=wbx#rpc('test.current',{},function('s:answer',['current']))
  let second=g:cx_writes[-1]
  call assert_equal('hello',second.method)
  call assert_equal(2,g:cx_starts)
  call s:reply(old,v:null) | call s:reply(first.id,s:hello(1))
  call assert_equal([],g:cx_answers)
  call assert_false(wbx#meeting_supports('meeting-tmux'),'old hello cannot re-enable assertions on a new transport')
  call s:reply(second.id,s:hello(1)) | call s:reply(current,v:null)
  call assert_equal(['current'],g:cx_answers)
  call assert_true(wbx#meeting_supports('meeting-tmux'))
  call assert_equal(before,s:native())
  call add(s:checks,'explicit reconnect only: old hello/work cannot restore assertions or replay')

  call wbx#transport#stop()
  let refused=wbx#rpc('test.refused',{},function('s:answer',['refused']))
  let hello=g:cx_writes[-1]
  let bad=s:hello(1) | let bad.version=999
  call s:reply(hello.id,bad)
  call assert_false(g:cx_running)
  silent let health=wbx#health()
  call assert_false(health.protocol_ready)
  call assert_equal({'pending':0,'queued':0,'lastRequest':refused},health.rpc_requests)
  call assert_false(wbx#meeting_supports('meeting-tmux'))
  call s:reply(refused,v:null)
  call assert_equal(['current'],g:cx_answers)
  call assert_equal(0,len(filter(copy(g:cx_writes),'v:val.method==# "test.refused"')))
  let recovered=wbx#rpc('test.recovered',{},function('s:answer',['recovered']))
  let hello=g:cx_writes[-1] | call s:reply(hello.id,s:hello(1)) | call s:reply(recovered,v:null)
  call assert_equal(['current','recovered'],g:cx_answers)
  call assert_true(wbx#meeting_supports('meeting-tmux'))
  call assert_equal(before,s:native())
  call s:draw('invalid-hello-then-explicit-recovery')
  call add(s:checks,'invalid hello does not drain; explicit valid handshake restores independent meeting')
  call assert_equal(4,g:cx_starts)
  for request in g:cx_writes
    call assert_true(index(['hello','session.start','test.hold','meeting.control','test.current','test.recovered'],request.method)>=0)
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:cx_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'phases':s:phases,
      \ 'meeting_actions':map(filter(copy(g:cx_writes),'v:val.method==# "meeting.control"'),'v:val.params.action'),
      \ 'starts':g:cx_starts,'requests':map(copy(g:cx_writes),'{"id":v:val.id,"method":v:val.method}')})],$WBX_EDITOR_RESULT)
qa!
