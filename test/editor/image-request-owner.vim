" Real view/protocol/source primitives, controlled request/render effects; no service or helper jobs.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#images#schedule() abort','let g:image_owner_schedules+=1','endfunction',
      \ 'function! wbx#images#open(...) abort','call add(g:image_owner_opened,a:000)','endfunction'],s:stub.'/autoload/wbx/images.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:image_owner_schedules=0 | let g:image_owner_opened=[]
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:notices=[] | let s:invalid=0 | let s:refuse=0 | let s:budget=[]
let s:ready=1 | let s:disconnected=0 | let s:blocked=0 | let s:generation=1
let s:state={'ready':1,'room':{'id':'room'}}
let s:options={} | let s:caps=['message-images','image-opening']
let s:metadata=[]
let s:message={'id':'message','images':[{'id':repeat('a',64),'state':'pending'}],'attachments':[{'id':repeat('a',64)}]}
let s:image={'id':repeat('a',64),'state':'ready','width':1,'height':1,'lines':repeat([repeat('⣿',40)],12),
      \ 'png':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='}
function! s:state() abort
  return s:state
endfunction
function! s:options() abort
  return s:options
endfunction
function! s:message() abort
  return bufnr('%')==s:history ? s:message : {}
endfunction
function! s:caps() abort
  return s:caps
endfunction
function! s:metadata() abort
  return s:metadata
endfunction
function! s:ready() abort
  return s:ready
endfunction
function! s:disconnected() abort
  return s:disconnected
endfunction
function! s:blocked() abort
  return s:blocked
endfunction
function! s:generation() abort
  return s:generation
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:invalid() abort
  let s:invalid+=1
endfunction
function! s:request(method, params, Callback) abort
  call add(s:requests,{'method':a:method,'params':a:params,'Callback':a:Callback})
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:reply(request, response) abort
  call call(a:request.Callback,[a:response])
endfunction
function! s:open() abort
  call wbx#image_request#open(s:owner,'buffer','1')
  return s:requests[-1]
endfunction
try
  let s:history=wbx#workspace#buffer('wbx://history','history')
  execute 'buffer '.s:history
  call wbx#view#write(s:history,['Visible image source','Folded image row'],function('s:notify'))
  let b:wbx_history_room='room' | let b:wbx_image_pending=[{'messageId':'message','row':1}]
  let cpo=&cpoptions
  let s:owner=wbx#image_request#new({'State':function('s:state'),'Options':function('s:options'),'Message':function('s:message'),
        \ 'Capabilities':function('s:caps'),'Metadata':function('s:metadata'),'Ready':function('s:ready'),'Disconnected':function('s:disconnected'),
        \ 'Blocked':function('s:blocked'),'Generation':function('s:generation'),'Request':function('s:request'),
        \ 'Notify':function('s:notify'),'ProtocolError':function('s:invalid')})
  call assert_equal(cpo,&cpoptions) | call assert_equal(['attempts','busy','metadata','ports','room'],sort(keys(s:owner)))
  call assert_equal({},s:owner.metadata)
  call wbx#image_request#observe(s:owner,s:state.room)
  call wbx#image_request#visible(s:owner)
  call assert_equal('messages.images',s:requests[-1].method)
  call assert_equal({'roomId':'room','messageId':'message'},s:requests[-1].params)
  call assert_true(wbx#image_request#busy(s:owner))
  call s:reply(s:requests[-1],{'error':{'code':-1}})
  let requests=len(s:requests)
  call wbx#image_request#visible(s:owner) | call assert_equal(requests,len(s:requests),'attempted failure never loops')
  call wbx#image_request#reset(s:owner)
  for n in range(1,20)
    let b:wbx_image_pending[0].messageId='message-'.n
    call wbx#image_request#visible(s:owner)
    call add(s:budget,[n,line('w0'),line('w$'),foldclosed(1),wbx#view#edited(s:history),len(s:owner.attempts)])
    if wbx#image_request#busy(s:owner) | call s:reply(s:requests[-1],{'result':[]}) | endif
  endfor
  if line('w$') > 0
    call assert_equal(16,len(s:owner.attempts))
  else
    " Vim -es may invalidate its viewport after an RPC callback. Do not fake
    " visibility: assert no further reads. Both drawn editors prove all 16.
    call assert_equal(s:budget[0][5],len(s:owner.attempts))
    call assert_equal(0,s:budget[-1][2])
  endif
  let b:wbx_image_pending[0].messageId='message'
  let request=s:open() | call s:reply(request,{'result':s:image})
  call assert_equal(1,len(g:image_owner_opened))
  call assert_equal({'owner':1,'room':'room','message':'message'},g:image_owner_opened[-1][2])
  call add(s:checks,'default-on preview is single-flight and one-attempt per message; failed preview permits a successful explicit high-resolution open with captured source')

  for gate in ['off','false','connection','disconnected','capability','attachment','wrong-room','fold','offscreen','edited']
    call wbx#image_request#reset(s:owner)
    let requests=len(s:requests)
    if gate==# 'off' | let s:options.images=0 | endif
    if gate==# 'false' | let s:options.images=v:false | endif
    if gate==# 'connection' | let s:ready=0 | endif
    if gate==# 'disconnected' | let s:disconnected=1 | endif
    if gate==# 'capability' | let s:caps=['image-opening'] | endif
    if gate==# 'attachment' | let s:blocked=1 | endif
    if gate==# 'wrong-room' | let b:wbx_history_room='other' | endif
    if gate==# 'fold' | setlocal foldmethod=manual | 1,2fold | endif
    if gate==# 'offscreen' | let b:wbx_image_pending[0].row=9999 | endif
    if gate==# 'edited' | setlocal modifiable | call setline(1,'Annotated image source') | endif
    call wbx#image_request#visible(s:owner) | call assert_equal(requests,len(s:requests),gate)
    let s:options={} | let s:ready=1 | let s:disconnected=0 | let s:caps=['message-images','image-opening'] | let s:blocked=0
    let b:wbx_history_room='room' | let b:wbx_image_pending[0].row=1
    silent! normal! zE
    if gate==# 'edited'
      call setline(1,'Visible image source') | setlocal nomodified nomodifiable
      let b:wbx_render_tick=b:changedtick
    endif
  endfor
  call wbx#image_request#reset(s:owner)
  let s:metadata=['headers-v1'] | let s:options.images=0
  for n in range(1,20)
    let b:wbx_attachment_pending=[{'messageId':'metadata-'.n,'row':1}]
    call wbx#image_request#visible(s:owner)
    if wbx#image_request#busy(s:owner)
      call assert_equal('messages.attachmentMetadata',s:requests[-1].method)
      call s:reply(s:requests[-1],{'error':{'code':-1}})
    endif
    let requests=len(s:requests)
    call wbx#image_request#visible(s:owner)
    call assert_equal(requests,len(s:requests),'failed metadata attempts never retry')
  endfor
  if line('w$') > 0 | call assert_equal(16,len(s:owner.metadata)) | endif
  call assert_equal({},s:owner.attempts,'metadata does not spend image preview attempts')
  call wbx#image_request#observe(s:owner,{'id':'other'})
  call assert_equal({},s:owner.attempts) | call assert_equal({},s:owner.metadata)
  let s:owner.metadata={'old':1}
  call wbx#image_request#reset(s:owner)
  call assert_equal({},s:owner.metadata,'session reset clears metadata attempts')
  let s:metadata=[] | let s:options={}
  call add(s:checks,'preview opt-outs, connection/source/attachment/fold/viewport gates and sixteen-attempt room budget remain bounded and independent')

  let old=s:open() | let old_read=s:owner.busy
  call wbx#image_request#reset(s:owner) | let current=s:open() | let current_read=s:owner.busy
  call assert_true(old_read isnot current_read)
  call s:reply(old,{'result':v:null})
  call assert_true(s:owner.busy is current_read) | call assert_equal(0,s:invalid)
  call s:reply(current,{'error':{'code':-1}}) | call assert_false(wbx#image_request#busy(s:owner))
  let request=s:open() | let s:generation+=1 | let opened=len(g:image_owner_opened)
  call s:reply(request,{'result':s:image}) | call assert_equal(opened,len(g:image_owner_opened))
  let request=s:open() | let s:message.id='other'
  call s:reply(request,{'result':s:image}) | call assert_equal(opened,len(g:image_owner_opened))
  let s:message.id='message'
  let request=s:open() | call s:reply(request,{'result':s:image})
  call assert_equal(opened+1,len(g:image_owner_opened))
  call add(s:checks,'read dictionary identity fences stale completion before validation/release; captured generation and exact current message reject retired bytes while fresh open succeeds')

  let request=s:open() | let value=deepcopy(s:image) | let value.id=repeat('b',64)
  call s:reply(request,{'result':value}) | call assert_equal(1,s:invalid)
  let s:refuse=1 | call s:open() | call assert_false(wbx#image_request#busy(s:owner))
  let s:refuse=0 | let request=s:open() | call s:reply(request,{'result':s:image})
  let requests=len(s:requests)
  call wbx#image_request#open(s:owner,'bad','1') | call wbx#image_request#open(s:owner,'buffer','5')
  call assert_equal(requests,len(s:requests))
  call add(s:checks,'wrong identity reports protocol failure, refusal releases only its admission, and explicit recovery preserves mode/index guards')

  " Connect the actual legacy attachment fallback to this SAME image admission.
  let attachment=wbx#attachment_open#new({'Options':function('s:options'),'Capabilities':function('s:caps'),'Message':function('s:message'),
        \ 'Request':function('s:request'),'Notify':function('s:notify'),'ProtocolError':function('s:invalid'),
        \ 'ImageBusy':function('wbx#image_request#busy',[s:owner]),'SetImageBusy':function('wbx#image_request#set_busy',[s:owner])})
  let context={'serial':0,'window':win_getid(),'buffer':bufnr('%'),'row':line('.'),'message':'message','room':'room','attachment':s:image.id}
  call wbx#attachment_open#image(attachment,context) | let old=s:requests[-1]
  call assert_true(wbx#image_request#busy(s:owner)) | call assert_equal(1,attachment.busy)
  call wbx#attachment_open#selected(attachment,1)
  call wbx#image_request#reset(s:owner) | let current=s:open() | let current_read=s:owner.busy
  call s:reply(old,{'result':s:image})
  call assert_true(s:owner.busy is current_read,'late attachment fallback cannot release image request')
  call s:reply(current,{'result':s:image})
  let read=wbx#image_request#set_busy(s:owner,1)
  call assert_equal({},wbx#image_request#set_busy(s:owner,1),'no competing acquire')
  call assert_equal(0,wbx#image_request#set_busy(s:owner,0,deepcopy(read)),'equal contents do not authorize release')
  call assert_equal(1,wbx#image_request#set_busy(s:owner,0,read))
  call add(s:checks,'legacy attachment fallback shares one image reservation; stale fallback/equal-copy tokens cannot release a newer read or create parallel admission')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
    endfor
    call assert_match('Visible image source',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Visible image source"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'requests':len(s:requests),'budget':s:budget,
      \ 'scope':'real native source/protocol primitives and actual attachment fallback; inert request and image effects'})],$WBX_EDITOR_RESULT)
qa!
