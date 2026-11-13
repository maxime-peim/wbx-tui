" Bound recovery orchestration with real native intent/draft evidence and inert application/persistence ports.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#state() abort','return deepcopy(g:recovery_owner_state)','endfunction',
      \ 'function! wbx#context_epoch() abort','return g:recovery_owner_epoch','endfunction'],s:stub.'/autoload/wbx.vim')
call writefile(['function! wbx#draft_persistence#ready() abort','return g:recovery_owner_ready','endfunction',
      \ 'function! wbx#draft_persistence#resolved(room) abort','call add(g:recovery_owner_saved,a:room)','endfunction'],
      \ s:stub.'/autoload/wbx/draft_persistence.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:recovery_owner_saved=[] | let g:recovery_owner_ready=1 | let g:recovery_owner_epoch=0
let g:recovery_owner_state={}
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:notices=[]
let s:support=1 | let s:refuse=0 | let s:synchronous=0 | let s:invalid=0 | let s:renders=0
function! s:state() abort
  return g:recovery_owner_state
endfunction
function! s:support(capability) abort
  call assert_equal('delivery-resolution-v1',a:capability)
  return s:support
endfunction
function! s:request(method, params, Callback) abort
  call assert_equal('delivery.resolveBound',a:method)
  call assert_equal({'roomId':'A'},a:params)
  call add(s:requests,{'method':a:method,'params':copy(a:params),'Callback':a:Callback})
  if s:synchronous | call call(a:Callback,[{'result':{'roomId':'A'}}]) | endif
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:invalid() abort
  let s:invalid+=1
endfunction
function! s:render() abort
  let s:renders+=1
endfunction
function! s:reply(response) abort
  call call(s:requests[-1].Callback,[a:response])
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat,
        \ get(b:,'wbx_staged_upload',{}),get(b:,'wbx_format','plain')]
endfunction
function! s:fresh() abort
  call wbx#drafts#disconnect()
  call wbx#drafts#resolve('A') | call wbx#drafts#resolve('B')
  execute 'buffer '.s:composer
  execute 'file wbx://compose/A'
  setlocal buftype=nofile
  let b:wbx_room='A' | let b:wbx_parent='' | let b:wbx_format='plain'
  let b:wbx_staged_upload={'attachmentId':repeat('d',32),'name':'Retained local file'}
  call setline(1,'Retained exact-room recovery draft') | call feedkeys("i\<Esc>",'xt')
  let g:recovery_owner_state={'state':'ready','ready':1,'room':{'id':'A'},
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
  let g:recovery_owner_saved=[] | let g:recovery_owner_ready=1
  let s:invalid=0 | let s:renders=0 | let s:refuse=0 | let s:synchronous=0 | let s:support=1
  call wbx#drafts#mark_uncertain('A')
endfunction
try
  enew | file recovery-owner-independent.txt | call setline(1,'Independent recovery foreground')
  split
  let s:composer=wbx#workspace#buffer('wbx://compose/A','compose','A')
  execute 'buffer '.s:composer
  let cpo=&cpoptions
  let s:owner=wbx#delivery_recovery#new({'State':function('s:state'),'Supports':function('s:support'),
        \ 'Request':function('s:request'),'ProtocolError':function('s:invalid'),
        \ 'Render':function('s:render'),'Notify':function('s:notify')})
  call assert_equal(cpo,&cpoptions) | call assert_equal(['ports'],keys(s:owner))
  call assert_equal([],s:requests)
  call s:fresh() | call wbx#drafts#mark_uncertain('B')
  let before=s:native()
  call wbx#delivery_recovery#resolve(s:owner)
  call assert_true(wbx#drafts#uncertain('A'),'dispatch is not an ACK')
  call assert_equal([],g:recovery_owner_saved)
  call s:reply({'result':{'roomId':'A'}})
  call assert_false(wbx#drafts#uncertain('A')) | call assert_true(wbx#drafts#uncertain('B'))
  call assert_equal(['A'],g:recovery_owner_saved) | call assert_equal(1,s:renders)
  call assert_equal(before,s:native())
  call add(s:checks,'exact-room ACK alone resolves matching evidence, observes persistence once and redraws without changing native text/full undo/file/focus')

  for gate in ['persistence','room','capability','pending']
    call s:fresh()
    if gate==# 'persistence' | let g:recovery_owner_ready=0 | endif
    if gate==# 'room' | let g:recovery_owner_state.room=v:null | endif
    if gate==# 'capability' | let s:support=0 | endif
    if gate==# 'pending' | call wbx#drafts#register('busy',{'roomId':'A','text':'Pending'},s:composer,b:changedtick) | endif
    let request_count=len(s:requests) | let before=s:native()
    call wbx#delivery_recovery#resolve(s:owner)
    call assert_equal(request_count,len(s:requests),gate) | call assert_true(wbx#drafts#uncertain('A'),gate)
    call assert_equal(before,s:native(),gate) | call assert_equal([],g:recovery_owner_saved,gate)
  endfor
  call s:fresh()
  call wbx#drafts#register('other-room',{'roomId':'B','text':'Other pending'},s:composer,b:changedtick)
  call wbx#delivery_recovery#resolve(s:owner) | call s:reply({'result':{'roomId':'A'}})
  call assert_false(wbx#drafts#uncertain('A')) | call assert_true(wbx#drafts#pending('B'))
  call add(s:checks,'persistence/selection/capability/exact-room pending admission stays independent; another room pending does not block this recovery')

  call s:fresh() | let s:refuse=1
  call wbx#delivery_recovery#resolve(s:owner)
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(0,s:renders)
  let request_count=len(s:requests) | sleep 25m | call assert_equal(request_count,len(s:requests))
  let s:refuse=0
  call wbx#delivery_recovery#resolve(s:owner)
  call s:reply({'error':{'code':-32004,'message':'Synthetic uncertain failure'},'result':{'roomId':'A'}})
  call assert_true(wbx#drafts#uncertain('A')) | call assert_equal(0,s:renders)
  call assert_equal([],g:recovery_owner_saved)
  call wbx#delivery_recovery#resolve(s:owner) | call s:reply({'result':{'roomId':'A'}})
  call assert_false(wbx#drafts#uncertain('A')) | call assert_equal(['A'],g:recovery_owner_saved)
  call s:fresh() | let s:synchronous=1
  call wbx#delivery_recovery#resolve(s:owner)
  call assert_false(wbx#drafts#uncertain('A')) | call assert_equal(['A'],g:recovery_owner_saved)
  call add(s:checks,'refused dispatch and RPC error retain evidence without retry; explicit retry and synchronous valid response recover normally')

  for value in [v:null,[],{}, {'roomId':'B'}, {'roomId':'A','extra':1}, {'roomId':1}]
    call s:fresh()
    call wbx#delivery_recovery#resolve(s:owner) | call s:reply({'result':value})
    call assert_equal(1,s:invalid) | call assert_true(wbx#drafts#uncertain('A'))
    call assert_equal(0,s:renders) | call assert_equal([],g:recovery_owner_saved)
  endfor
  call add(s:checks,'malformed/wrong-room/extra-key acknowledgements report protocol failure and never resolve or persist')

  for guard in ['text','parent','format','room','session','epoch','state','leave-return','promotion','rename']
    call s:fresh()
    call wbx#delivery_recovery#resolve(s:owner)
    if guard==# 'text' | call setline(1,'Newer native recovery draft') | endif
    if guard==# 'parent' | let b:wbx_parent='root' | endif
    if guard==# 'format' | let b:wbx_format='markdown' | endif
    if guard==# 'room' | let g:recovery_owner_state.room={'id':'B'} | endif
    if guard==# 'session' | let g:recovery_owner_state.localContext.sessionId=repeat('b',32) | endif
    if guard==# 'epoch' | let g:recovery_owner_epoch+=1 | endif
    if guard==# 'state' | let g:recovery_owner_state.ready=0 | endif
    if guard==# 'leave-return' | let origin=win_getid() | wincmd p | call win_gotoid(origin) | endif
    if guard==# 'promotion' | setlocal buftype= | endif
    if guard==# 'rename' | file recovered-independent.txt | endif
    let before=s:native()
    call s:reply({'result':{'roomId':'A'}})
    call assert_true(wbx#drafts#uncertain('A'),guard)
    call assert_equal([],g:recovery_owner_saved,guard) | call assert_equal(0,s:renders,guard)
    call assert_equal(before,s:native(),guard)
    " Stale intent is rejected before an otherwise malformed result is inspected.
    call s:reply({'result':{'roomId':'B'}}) | call assert_equal(0,s:invalid,guard)
  endfor
  call add(s:checks,'exact native intent rejects edit/format/parent/selection/session/epoch/readiness/promotion/rename and leave-and-return before interpreting stale output')

  call s:fresh()
  call wbx#delivery_recovery#resolve(s:owner) | let Old=s:requests[-1].Callback
  call wbx#drafts#mark_uncertain('A') | let evidence=wbx#drafts#evidence('A')
  call call(Old,[{'result':{'roomId':'A'}}])
  call assert_equal(evidence,wbx#drafts#evidence('A'))
  call assert_equal([],g:recovery_owner_saved) | call assert_equal(1,s:renders,'guarded compare failure keeps original redraw contract')
  call wbx#delivery_recovery#resolve(s:owner) | call s:reply({'result':{'roomId':'A'}})
  call assert_false(wbx#drafts#uncertain('A')) | call assert_equal(['A'],g:recovery_owner_saved)
  call s:fresh() | call wbx#drafts#resolve('A')
  call wbx#delivery_recovery#resolve(s:owner) | call s:reply({'result':{'roomId':'A'}})
  call assert_equal(['A'],g:recovery_owner_saved,'zero local evidence preserves original explicit backend-resolution compatibility')
  call assert_equal(['ports'],keys(s:owner))
  call add(s:checks,'newer same-room uncertainty cannot be erased by older evidence; fresh explicit request succeeds and no duplicate ledger or single-flight policy is added')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Retained exact-room recovery draft',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Retained exact-room recovery draft"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'requests':len(s:requests),
      \ 'scope':'real native intent/draft ledger; inert application and persistence-ready/observation ports, no transport or service'})],$WBX_EDITOR_RESULT)
qa!
