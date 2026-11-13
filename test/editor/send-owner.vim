" Composer send action with inert application/consent/request ports and real native draft/view primitives.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload','p')
call writefile(['function! wbx#state() abort','return g:send_owner_state','endfunction',
      \ 'function! wbx#supports(capability) abort','return 1','endfunction'],s:stub.'/autoload/wbx.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:wbx_tui={'persist_drafts':0}
let g:send_owner_state={'state':'ready','ready':1,'room':{'id':'A','type':'group'},
      \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'},'messages':[]}
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:events=[] | let s:notices=[]
let s:ready=1 | let s:caps=['message-replies'] | let s:support=1 | let s:combo=1 | let s:next=0
let s:consent={} | let s:race='' | let s:refuse=0 | let s:sync=0
function! s:state() abort
  return g:send_owner_state
endfunction
function! s:destination() abort
  return {'ready':s:ready}
endfunction
function! s:support(capability) abort
  return s:support
endfunction
function! s:combo(format) abort
  return s:combo
endfunction
function! s:capabilities() abort
  return s:caps
endfunction
function! s:next() abort
  let s:next+=1
  return s:next
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:render() abort
  call add(s:events,'render')
endfunction
function! s:consent(text) abort
  call add(s:events,'consent')
  if s:race==# 'text' | call setline(1,'Newer text from consent hook') | endif
  if s:race==# 'format' | let b:wbx_format='plain' | endif
  if s:race==# 'draft' | let b:wbx_draft_id='different-draft' | endif
  if s:race==# 'parent' | let b:wbx_parent='different-parent' | endif
  if s:race==# 'file' | call wbx#drafts#upload(bufnr('%'),{'attachmentId':repeat('e',32)}) | endif
  if s:race==# 'window'
    let origin=win_getid() | wincmd p | call win_gotoid(origin)
  endif
  if s:race==# 'session' | let g:send_owner_state=deepcopy(g:send_owner_state) | let g:send_owner_state.localContext.sessionId=repeat('b',32) | endif
  if s:race==# 'quote' | let g:send_owner_state=deepcopy(g:send_owner_state) | let g:send_owner_state.messages=[] | endif
  if s:race==# 'uncertain' | call wbx#drafts#mark_uncertain('A') | endif
  return copy(s:consent)
endfunction
function! s:request(method, params, Callback) abort
  call assert_true(wbx#drafts#pending(),'pending registration precedes transport, including synchronous response')
  call add(s:events,'request')
  call add(s:requests,{'method':a:method,'params':deepcopy(a:params),'Callback':a:Callback})
  if s:sync | call call(a:Callback,[{'error':{'code':-32002,'message':'Synthetic synchronous refusal'}}]) | endif
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:reply(index, code) abort
  call call(s:requests[a:index].Callback,[a:code ? {'error':{'code':a:code,'message':'Synthetic error'}} : {'result':v:null}])
endfunction
function! s:retire() abort
  call wbx#drafts#disconnect()
  call wbx#drafts#resolve('A')
endfunction
function! s:fresh() abort
  call s:retire()
  execute 'buffer '.s:composer
  let b:wbx_room='A' | let b:wbx_parent='' | let b:wbx_format='plain'
  setlocal buftype=nofile
  let b:wbx_draft_id='owner-draft'
  let b:wbx_quote_sources=[]
  call wbx#drafts#upload(bufnr('%'),{})
  let b:wbx_confirmed_sent={}
  let g:send_owner_state.localContext.sessionId=repeat('a',32)
  call setline(1,'Standalone send action text')
  call feedkeys("i\<Esc>",'xt')
  let s:events=[] | let s:race='' | let s:consent={}
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
try
  enew | file send-owner-independent.txt | call setline(1,'Independent foreground retained')
  split
  let s:composer=wbx#workspace#buffer('wbx://compose/A','compose','A')
  execute 'buffer '.s:composer
  let cpo=&cpoptions
  let s:owner=wbx#send_action#new({'State':function('s:state'),'Destination':function('s:destination'),
        \ 'Supports':function('s:support'),'SupportsUpload':function('s:combo'),'Capabilities':function('s:capabilities'),
        \ 'NextId':function('s:next'),'Consent':function('s:consent'),'Request':function('s:request'),
        \ 'Notify':function('s:notify'),'Render':function('s:render')})
  call assert_equal(cpo,&cpoptions)
  call s:fresh()
  let before=s:native()
  call wbx#send_action#send(s:owner)
  call assert_equal(['request','render'],s:events)
  call assert_equal('messages.send',s:requests[-1].method)
  call assert_equal({'roomId':'A','text':getline(1),'requestId':'editor-1'},s:requests[-1].params)
  call assert_equal(before,s:native())
  call s:reply(0,0) | call assert_true(wbx#drafts#pending(),'RPC success alone is not a delivery')
  call s:reply(0,-32002) | call assert_false(wbx#drafts#pending()) | call assert_false(wbx#drafts#uncertain('A'))
  call wbx#send_action#send(s:owner) | call assert_equal(2,len(s:requests))
  call add(s:checks,'ordinary plain dispatch registers exact pending before request, retains native work, and only explicit retry follows confirmed failure')

  call s:fresh() | let b:wbx_format='markdown' | let s:consent={'cancelled':1}
  let before=s:native() | let request_count=len(s:requests)
  call wbx#send_action#send(s:owner)
  call assert_equal(request_count,len(s:requests)) | call assert_equal(before,s:native())
  let s:consent={'mentionsAccepted':v:true,'allAccepted':v:true}
  call wbx#send_action#send(s:owner)
  call assert_equal('messages.sendRich',s:requests[-1].method)
  call assert_false(has_key(s:requests[-1].params,'format'),'rich-only wire keeps its established implicit format')
  call assert_true(s:requests[-1].params.mentionsAccepted) | call assert_true(s:requests[-1].params.allAccepted)
  call s:fresh() | let b:wbx_format='markdown'
  call wbx#drafts#upload(bufnr('%'),{'attachmentId':repeat('d',32)})
  call wbx#send_action#send(s:owner)
  call assert_equal('uploads.send',s:requests[-1].method) | call assert_equal('markdown',s:requests[-1].params.format)
  call assert_equal(repeat('d',32),s:requests[-1].params.attachmentId)
  call s:fresh() | call setline(1,'')
  call wbx#drafts#upload(bufnr('%'),{'attachmentId':repeat('d',32)})
  call wbx#send_action#send(s:owner)
  call assert_equal('uploads.send',s:requests[-1].method) | call assert_equal('',s:requests[-1].params.text)
  call s:fresh() | let b:wbx_parent='root'
  execute 'file '.fnameescape(wbx#view#compose_name('A','root'))
  call wbx#send_action#send(s:owner)
  call assert_equal('root',s:requests[-1].params.parentId)
  let b:wbx_parent='' | execute 'file wbx://compose/A'
  call add(s:checks,'consent cancellation retains native work; rich and combined file wire routes preserve explicit flags and exact attachment identity')

  for race in ['text','format','draft','parent','file','window','session','uncertain','quote']
    call s:fresh() | let b:wbx_format='markdown' | let s:race=race
    if race==# 'quote'
      let message={'id':'quoted','author':'Synthetic','created':'','text':'Copied text'}
      let g:send_owner_state.messages=[message]
      let b:wbx_quote_sources=[{'roomId':'A','sessionId':repeat('a',32),'messageId':'quoted',
            \ 'fingerprint':sha256(json_encode(['quoted','Synthetic','','Copied text','']))}]
    endif
    let request_count=len(s:requests) | let next=s:next
    call wbx#send_action#send(s:owner)
    call assert_equal(request_count,len(s:requests),race) | call assert_equal(next,s:next,race.': no request id allocated')
    if race==# 'text' | call assert_equal('Newer text from consent hook',getline(1)) | endif
  endfor
  call add(s:checks,'consent rechecks exact text/format/file/draft/parent, leave-and-return, session and uncertainty; quote proof uses current post-consent state')

  for gate in ['destination','empty','length','pending','uncertain','sent','combo','file-stale','replies']
    call s:fresh()
    if gate==# 'destination' | let s:ready=0 | endif
    if gate==# 'empty' | call setline(1,' ') | endif
    if gate==# 'length' | call setline(1,repeat('x',1001)) | endif
    if gate==# 'pending' | call wbx#drafts#register('other',{'roomId':'B','text':'Other work'},bufnr('%'),b:changedtick) | endif
    if gate==# 'uncertain' | call wbx#drafts#mark_uncertain('A') | endif
    if gate==# 'sent' | let b:wbx_confirmed_sent={'tick':b:changedtick,'roomId':'A','parentId':'','format':'plain','attachmentRevision':get(b:,'wbx_attachment_revision',0)} | endif
    if gate==# 'combo' | let b:wbx_format='markdown' | let s:combo=0 | call wbx#drafts#upload(bufnr('%'),{'attachmentId':repeat('d',32)}) | endif
    if gate==# 'file-stale' | call wbx#drafts#upload(bufnr('%'),{'attachmentId':repeat('d',32),'stale':1}) | endif
    if gate==# 'replies'
      let b:wbx_parent='root' | let s:caps=[]
      execute 'file '.fnameescape(wbx#view#compose_name('A','root'))
    endif
    let request_count=len(s:requests)
    call wbx#send_action#send(s:owner) | call assert_equal(request_count,len(s:requests),gate)
    if gate==# 'replies' | execute 'file wbx://compose/A' | endif
    let s:ready=1 | let s:combo=1 | let s:caps=['message-replies']
  endfor
  call add(s:checks,'independent destination/empty/size/pending/uncertainty/already-sent/combination/stale-file/reply gates retain admission')

  call s:fresh() | let s:refuse=1
  call wbx#send_action#send(s:owner) | call assert_false(wbx#drafts#pending())
  call assert_false(wbx#drafts#uncertain('A'),'refused dispatch does not invent possible submission')
  let s:refuse=0 | let s:sync=1 | let request_count=len(s:requests)
  call wbx#send_action#send(s:owner)
  call assert_equal(request_count+1,len(s:requests)) | call assert_false(wbx#drafts#pending())
  let s:sync=0
  call add(s:checks,'dispatch refusal and synchronous callback retain original registration/error/render ordering without automatic retry')

  call s:fresh()
  call wbx#send_action#send(s:owner) | let old=len(s:requests)-1
  call s:reply(old,-32004) | call assert_true(wbx#drafts#uncertain('A'))
  let request_count=len(s:requests)
  call wbx#send_action#send(s:owner) | call assert_equal(request_count,len(s:requests))
  call wbx#drafts#resolve('A',wbx#drafts#evidence('A'))
  call wbx#send_action#send(s:owner)
  call s:retire() | let g:send_owner_state.localContext.sessionId=repeat('b',32)
  call wbx#send_action#send(s:owner)
  let renders=len(s:events)
  call s:reply(old,-32004)
  call assert_true(wbx#drafts#pending()) | call assert_equal(renders,len(s:events))
  call s:reply(len(s:requests)-1,-32002)
  call assert_false(wbx#drafts#pending())
  call assert_equal('Standalone send action text',getline(1))
  call add(s:checks,'possible submission stays uncertain until explicit recovery; retired callback cannot release or redraw replacement pending work')
  call assert_equal(['ports'],keys(s:owner),'no second draft/request/session lifetime registry')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let at=screenpos(win_getid(),1,1)
    let text=join(map(range(at.col,at.col+winwidth(0)-1),'screenstring(at.row,v:val)'),'')
    call assert_match('Standalone send action text',text) | call add(s:drawn,trim(text))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'requests':len(s:requests),
      \ 'scope':'inert application/consent/request ports; real native buffers, draft ledger, view intents and quote guards; no backend'})],$WBX_EDITOR_RESULT)
qa!
