" Selection intent/focus owner with inert application ports; no plugin/backend.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:opens=[] | let s:attachments=[] | let s:notices=[]
let s:refuse=0
let s:context={'selected':v:null,'ready':0,'loading':0,'disconnected':0,'reload':0,
      \ 'rooms':[{'id':'A','unread':v:true},{'id':'B','unread':v:false},{'id':'C','cached':1}]}
function! s:context() abort
  return deepcopy(s:context)
endfunction
function! s:request(params, ...) abort
  call add(s:requests,{'params':copy(a:params),'Callback':a:0 ? a:1 : 0})
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:open(request) abort
  call add(s:opens,deepcopy(a:request))
endfunction
function! s:attachments(changed) abort
  call add(s:attachments,a:changed)
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:select(id, ...) abort
  return wbx#selection#select(s:owner,a:id,{'focus':a:0 ? a:1 : 1,'allow_read':1,'reload':a:0>1 ? a:2 : 0})
endfunction
function! s:reply(index, ...) abort
  call call(s:requests[a:index].Callback,[a:0 ? {'error':{'code':-1,'message':'Synthetic selection failure'}} : {'result':v:null}])
endfunction
try
  let cpo=&cpoptions
  let s:owner=wbx#selection#new({'Context':function('s:context'),'Request':function('s:request'),
        \ 'Attachments':function('s:attachments'),'Open':function('s:open'),'Notify':function('s:notify')})
  call assert_equal(cpo,&cpoptions)
  let rooms=wbx#workspace#buffer('wbx://spaces','rooms')
  execute 'buffer '.rooms
  call setline(1,'Standalone selection origin')
  let b:wbx_render_tick=b:changedtick
  let origin=win_getid()

  call s:select('A')
  let focus=deepcopy(s:owner.focus) | let request_count=len(s:requests) | let serial=s:owner.serial
  call assert_equal(-1,s:select('C'))
  call assert_equal(focus,s:owner.focus,'browse-only refusal does not cancel an already-admitted intent')
  call assert_equal(request_count,len(s:requests)) | call assert_equal(serial,s:owner.serial)
  let s:context.selected='A' | let s:context.loading=1
  call assert_equal(0,s:select('A'))
  call assert_equal(focus,s:owner.focus) | call assert_equal(request_count,len(s:requests))
  let s:context.ready=1 | let s:context.loading=0
  call s:reply(0)
  call assert_equal('A',s:opens[-1].id) | call assert_equal(1,s:opens[-1].allow_read)
  call assert_equal({},s:owner.focus)
  call s:reply(0) | call assert_equal(1,len(s:opens),'one completion consumes one focus intent')
  call add(s:checks,'cached refusal and duplicate loading preserve the original intent; valid completion opens exactly once')

  let request_count=len(s:requests) | let attachments=copy(s:attachments)
  let s:context.loading=1
  call assert_equal(0,s:select('A'),'ready history resumes even during background polling')
  call assert_equal(1,s:opens[-1].resume) | call assert_equal(0,s:opens[-1].allow_read)
  call assert_equal(request_count,len(s:requests)) | call assert_equal(attachments,s:attachments)
  let opened=len(s:opens)
  call assert_equal(0,s:select('A',0)) | call assert_equal(opened,len(s:opens))
  call add(s:checks,'ready same-room return is local, receipt-disabled and focus-neutral unless requested')

  let s:context.loading=0
  let older=len(s:requests) | call s:select('B')
  call s:select('A')
  let opened=len(s:opens)
  call s:reply(older)
  call assert_equal(opened,len(s:opens),'late B cannot reopen after local A return')
  let older=len(s:requests) | call s:select('B')
  let newer=len(s:requests) | call s:select('A',1,1)
  let focus=deepcopy(s:owner.focus)
  call s:reply(older,1) | call assert_equal(focus,s:owner.focus,'old errors cannot consume a newer intent')
  call s:reply(newer)
  call assert_equal('A',s:opens[-1].id)
  call add(s:checks,'returning A does not wait for held B; late success/error cannot consume a newer focus intent')

  let index=len(s:requests) | call s:select('B')
  let focus=deepcopy(s:owner.focus)
  botright new | file selection-independent.txt
  call setline(1,'Independent selection owner work')
  call wbx#selection#leaving(s:owner)
  call assert_equal(focus,s:owner.focus,'background window events are not departure from the requesting origin')
  call win_gotoid(origin)
  call wbx#selection#leaving(s:owner)
  let s:context.selected='B'
  let opened=len(s:opens) | call s:reply(index)
  call assert_equal(opened,len(s:opens),'leaving and returning cannot revive old focus')
  call add(s:checks,'origin-aware cancellation distinguishes background window work from an actual leave-and-return')

  for failure in ['error','wrong-room','unlisted','not-ready','loading','disconnected','annotation','promotion','different-window']
    call win_gotoid(origin)
    let s:context.selected='A' | let s:context.ready=1 | let s:context.loading=0 | let s:context.disconnected=0
    let s:context.rooms=[{'id':'A','unread':v:true},{'id':'B','unread':v:true}]
    let index=len(s:requests) | call s:select('B')
    let s:context.selected='B'
    if failure==# 'wrong-room' | let s:context.selected='A' | endif
    if failure==# 'unlisted' | let s:context.rooms=[{'id':'A'}] | endif
    if failure==# 'not-ready' | let s:context.ready=0 | endif
    if failure==# 'loading' | let s:context.loading=1 | endif
    if failure==# 'disconnected' | let s:context.disconnected=1 | endif
    if failure==# 'annotation' | call setline(1,'Retained selection annotation') | endif
    if failure==# 'promotion' | setlocal buftype= | endif
    if failure==# 'different-window' | wincmd j | endif
    let opened=len(s:opens)
    if failure==# 'error' | call s:reply(index,1) | else | call s:reply(index) | endif
    call assert_equal(opened,len(s:opens),failure.': no activation')
    call assert_equal({},s:owner.focus,failure.': completion consumes only its matching intent')
    call win_gotoid(origin)
    setlocal buftype=nofile
    let b:wbx_render_tick=b:changedtick
  endfor
  call add(s:checks,'completion requires exact room, loaded membership, readiness, connection and unchanged origin ownership')

  let s:context.selected='A' | let s:context.ready=1 | let s:context.loading=0 | let s:context.disconnected=0
  let s:context.rooms=[{'id':'A'},{'id':'B'}] | let s:context.reload=1
  call s:select('A',1,1)
  call assert_equal({'roomId':'A','reload':v:true},s:requests[-1].params)
  call wbx#selection#cancel(s:owner)
  let serial=s:owner.serial
  let s:refuse=1 | call assert_equal(-1,s:select('B')) | let s:refuse=0
  call assert_equal({},s:owner.focus) | call assert_true(s:owner.serial>serial)
  let index=len(s:requests) | call s:select('B',0)
  call assert_equal(0,s:requests[index].Callback,'programmatic requests have no focus callback')
  let s:context.selected='B'
  let opened=len(s:opens)
  call assert_equal(0,s:select('B',0)) | call assert_equal(opened,len(s:opens))
  let s:context.selected=v:null
  let request_count=len(s:requests)
  call s:select('',0)
  call assert_equal(request_count+1,len(s:requests),'missing selected-room evidence cannot masquerade as a local resume')
  call assert_equal([],filter(getscriptinfo(),'v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx.vim" || v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx/transport.vim"'))
  call add(s:checks,'reload capability, refused requests, monotonic intent serials and focus-neutral selection stay independent of transport')
  if $WBX_EDITOR_SCREEN==# '1'
    call win_gotoid(origin)
    redraw!
    let row=screenpos(win_getid(),1,1).row | let col=getwininfo(win_getid())[0].wincol
    let text=join(map(range(col,col+winwidth(0)-1),'screenstring(row,v:val)'),'')
    call assert_match('Retained selection annotation',text) | call add(s:drawn,trim(text))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'requests':len(s:requests),'opens':len(s:opens),
      \ 'scope':'inert request/context/activation/attachment ports; real native ownership and origin windows; no application/backend'})],$WBX_EDITOR_RESULT)
qa!
