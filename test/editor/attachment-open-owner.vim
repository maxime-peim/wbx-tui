" Action lifetime with real protocol/policy/view primitives and inert application/physical ports.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
" Keep policy/validation real; replace only physical effects in this private runtime.
execute 'source '.fnameescape($WBX_EDITOR_ROOT.'/autoload/wbx/attachments.vim')
call writefile(['function! wbx#attachments#busy() abort','return g:open_owner_file_busy','endfunction',
      \ 'function! wbx#attachments#stop() abort','call add(g:open_owner_stops,"file")','let g:open_owner_file_busy=0','endfunction',
      \ 'function! wbx#attachments#open(file, context, ...) abort',
      \ 'if g:open_owner_fault | throw "Synthetic materialization failure" | endif',
      \ 'call add(g:open_owner_files,{"file":a:file,"context":a:context,"stream":a:0})',
      \ 'call wbx#attachment_open#handoff(g:open_owner,a:context)','endfunction'],s:stub.'/autoload/wbx/attachments.vim')
call writefile(['function! wbx#attachment_stream#busy() abort','return g:open_owner_sink_busy','endfunction',
      \ 'function! wbx#attachment_stream#stop() abort','call add(g:open_owner_stops,"sink")','endfunction',
      \ 'function! wbx#attachment_stream#start(context, params) abort',
      \ 'let g:open_owner_sink_busy=1','let g:open_owner_preflight={"context":a:context,"params":a:params}','endfunction',
      \ 'function! wbx#attachment_stream#resolved(context, value) abort','let g:open_owner_resolved={"context":a:context,"value":a:value}','endfunction'],
      \ s:stub.'/autoload/wbx/attachment_stream.vim')
call writefile(['function! wbx#images#schedule() abort','endfunction',
      \ 'function! wbx#images#open(...) abort','call add(g:open_owner_images,a:000)','endfunction'],s:stub.'/autoload/wbx/images.vim')
call writefile(['function! wbx#chooser#select(lines, Callback) abort','let g:OpenOwnerChoice=a:Callback','endfunction'],s:stub.'/autoload/wbx/chooser.vim')
call writefile(['function! wbx#state() abort','return g:open_owner_state','endfunction'],s:stub.'/autoload/wbx.vim')
execute 'source '.fnameescape(s:stub.'/autoload/wbx/attachments.vim')
execute 'set rtp^='.fnameescape(s:stub)
let s:checks=[] | let s:drawn=[] | let s:requests=[] | let s:notices=[] | let s:invalid=0
let s:capabilities=['attachment-typed-open-v1','message-attachments','image-opening']
let s:can_cancel=1 | let s:disconnected=0 | let s:image_busy=0 | let s:refuse=0
let g:open_owner_file_busy=0 | let g:open_owner_sink_busy=0 | let g:open_owner_fault=0
let g:open_owner_files=[] | let g:open_owner_images=[] | let g:open_owner_stops=[]
let g:open_owner_state={'state':'ready','ready':1,'room':{'id':'room'},'localContext':{'sessionId':repeat('a',32)}}
let g:wbx_tui={'attachment_handlers':{},'image_open':'buffer'}
let s:message={'id':'message','attachments':[{'id':repeat('a',64)}]}
function! s:state() abort
  return g:open_owner_state
endfunction
function! s:message() abort
  return bufnr('%')==s:history && g:open_owner_state.ready ? s:message : {}
endfunction
function! s:options() abort
  return g:wbx_tui
endfunction
function! s:caps() abort
  return copy(s:capabilities)
endfunction
function! s:disconnected() abort
  return s:disconnected
endfunction
function! s:can_cancel() abort
  return s:can_cancel
endfunction
function! s:image_busy() abort
  return s:image_busy
endfunction
function! s:image_set(value, ...) abort
  let s:image_busy=a:value
  return a:value ? {'read':1} : 1
endfunction
function! s:image_open(...) abort
  call add(g:open_owner_images,a:000)
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:invalid() abort
  let s:invalid+=1
endfunction
function! s:request(method, params, ...) abort
  call add(s:requests,{'method':a:method,'params':copy(a:params),'Callback':a:0 ? a:1 : 0})
  return s:refuse ? -1 : len(s:requests)
endfunction
function! s:reply(request, value) abort
  call call(a:request.Callback,[a:value])
endfunction
function! s:value() abort
  return {'meta':{'id':repeat('a',64),'name':'sample.txt','mime':'text/plain','sourceBytes':16},
        \ 'body':{'kind':'original','decodedBytes':16,'text':v:true,
        \ 'payload':{'mode':'inline','encoding':'base64','data':'QXR0YWNobWVudCBib2R5Cg=='}}}
endfunction
function! s:fresh() abort
  call wbx#attachment_open#lost(g:open_owner)
  let g:open_owner_sink_busy=0 | let g:open_owner_file_busy=0 | let g:open_owner_fault=0
  let g:open_owner_files=[] | let g:open_owner_stops=[] | let s:invalid=0
  let g:wbx_tui.attachment_handlers={} | let s:refuse=0 | let s:can_cancel=1
  let s:capabilities=['attachment-typed-open-v1','message-attachments','image-opening']
  execute 'buffer '.s:history | call cursor(1,1)
endfunction
function! s:open() abort
  call wbx#attachment_open#open(g:open_owner,'open','1')
  return s:requests[-1]
endfunction
try
  enew | file attachment-owner-notes.txt | call setline(1,'Independent attachment owner notes')
  split
  let s:history=wbx#workspace#buffer('wbx://history','history')
  execute 'buffer '.s:history
  call wbx#view#write(s:history,['Loaded attachment source','Other native row'],function('s:notify'))
  let b:wbx_history_room='room'
  let cpo=&cpoptions
  let g:open_owner=wbx#attachment_open#new({'State':function('s:state'),'Message':function('s:message'),
        \ 'Options':function('s:options'),'Capabilities':function('s:caps'),'Disconnected':function('s:disconnected'),
        \ 'CanCancel':function('s:can_cancel'),'ImageBusy':function('s:image_busy'),'SetImageBusy':function('s:image_set'),
        \ 'ImageOpen':function('s:image_open'),'Request':function('s:request'),'Notify':function('s:notify'),'ProtocolError':function('s:invalid')})
  call assert_equal(cpo,&cpoptions)
  call assert_equal(['busy','generation','intent','ports','serial'],sort(keys(g:open_owner)))
  let request=s:open() | let context=g:open_owner.intent
  call assert_equal('messages.attachmentResolve',request.method)
  call assert_equal({'roomId':'room','messageId':'message','attachmentId':repeat('a',64),'action':'open','selectors':[]},request.params)
  call assert_true(wbx#attachment_open#blocks_previews(g:open_owner))
  call s:reply(request,{'result':s:value()})
  call assert_equal(1,len(g:open_owner_files)) | call assert_true(g:open_owner_files[0].context is context)
  call assert_equal('QXR0YWNobWVudCBib2R5Cg==',g:open_owner_files[0].file.data)
  call assert_equal(0,g:open_owner.busy) | call assert_equal({},g:open_owner.intent)
  call add(s:checks,'ordinary typed resolve hands exact original bytes and shared context to the file owner once, then releases action intent')

  call s:fresh() | let request=s:open()
  call s:reply(request,{'error':{'code':-32004,'message':'Synthetic read failure'}})
  call assert_equal(0,g:open_owner.busy) | call assert_equal({},g:open_owner.intent)
  let request=s:open() | let g:open_owner_fault=1
  call s:reply(request,{'result':s:value()})
  call assert_equal({},g:open_owner.intent) | call assert_equal([],g:open_owner_files)
  let g:open_owner_fault=0 | let request=s:open() | call s:reply(request,{'result':s:value()})
  call assert_equal(1,len(g:open_owner_files))
  call s:fresh() | let s:refuse=1 | call s:open()
  call assert_equal(0,g:open_owner.busy) | call assert_equal({},g:open_owner.intent)
  call add(s:checks,'read error, materialization error and refused dispatch release logical admission without fallback/retry; a new explicit open recovers')

  call s:fresh() | let old=s:open() | let revoked=g:open_owner.intent
  call cursor(2,1) | call wbx#attachment_open#check(g:open_owner,0)
  call assert_equal('messages.attachmentCancel',s:requests[-1].method)
  call assert_equal({'requestId':revoked.request},s:requests[-1].params)
  call assert_equal(1,revoked.revoked) | call assert_equal(['file','sink'],g:open_owner_stops)
  let requests=len(s:requests) | call wbx#attachment_open#cancel(g:open_owner) | call assert_equal(requests,len(s:requests))
  call cursor(1,1) | let current=s:open() | let serial=g:open_owner.serial
  call s:reply(old,{'result':v:null})
  call wbx#attachment_open#stream_failed(g:open_owner,revoked,'Retired failure')
  call wbx#attachment_open#handoff(g:open_owner,revoked)
  call assert_equal(serial,g:open_owner.serial) | call assert_equal(1,g:open_owner.busy)
  call assert_equal(0,s:invalid) | call s:reply(current,{'result':s:value()})
  call add(s:checks,'movement revokes before physical cleanup and cancels the exact request once; stale resolve/failure/handoff cannot release replacement work')

  call s:fresh() | let g:open_owner_sink_busy=1 | let requests=len(s:requests)
  call wbx#attachment_open#open(g:open_owner,'open','1') | call assert_equal(requests,len(s:requests))
  let g:open_owner_sink_busy=0 | let request=s:open() | let s:can_cancel=0
  call wbx#attachment_open#cancel(g:open_owner) | call assert_equal(requests+1,len(s:requests),'disconnected cancellation stays local')
  let generation=g:open_owner.generation | let serial=g:open_owner.serial
  call wbx#attachment_open#prepare(g:open_owner)
  call assert_equal(generation+1,g:open_owner.generation) | call assert_equal(serial+1,g:open_owner.serial)
  call add(s:checks,'physical busy/draining ownership blocks new action; offline cancellation does not start RPC and preparation advances existing fences only')

  call s:fresh() | let request=s:open() | let context=g:open_owner.intent
  call assert_true(wbx#attachment_open#context(g:open_owner,context))
  let g:wbx_tui.attachment_handlers={'.txt':{}}
  call wbx#attachment_open#check(g:open_owner,0)
  call assert_false(wbx#attachment_open#context(g:open_owner,context))
  call s:fresh() | let request=s:open() | let context=g:open_owner.intent
  let origin=win_getid() | wincmd p
  call assert_true(wbx#attachment_open#valid(g:open_owner,context),'terminal validity is intentionally independent of current focus')
  call win_gotoid(origin)
  call wbx#attachment_open#stop(g:open_owner)
  call assert_false(wbx#attachment_open#valid(g:open_owner,context))
  call assert_true(wbx#attachment_open#valid(g:open_owner,{}),'legacy validity contract remains compatible')
  call add(s:checks,'settings and source intent revoke pending work; background terminal validity uses generation/config/ownership rather than current focus')

  call s:fresh() | call add(s:capabilities,'attachment-chunks-v1') | let requests=len(s:requests)
  call wbx#attachment_open#open(g:open_owner,'open','1')
  call assert_equal(requests,len(s:requests),'sink preflight precedes remote resolve')
  let context=g:open_owner_preflight.context
  call assert_true(context is g:open_owner.intent)
  call wbx#attachment_open#stream_ready(g:open_owner,context,g:open_owner_preflight.params)
  let value=s:value() | let value.body.payload={'mode':'chunks','encoding':'base64','requestId':context.request,'transferId':repeat('f',32),
        \ 'chunkBytes':49152,'chunks':1,'encodedBytes':24,'sha256':sha256("Attachment body\n")}
  call s:reply(s:requests[-1],{'result':value})
  call assert_true(g:open_owner_resolved.context is context) | call assert_equal(1,g:open_owner.busy)
  call wbx#attachment_open#stream_result(g:open_owner,context,value,'')
  call assert_equal(1,g:open_owner_files[-1].stream) | call assert_false(has_key(g:open_owner_files[-1].file,'data'))
  call add(s:checks,'chunk preflight/context identity and metadata handoff stay separate from physical sink bytes, credit and commit ownership')

  call s:fresh() | let s:capabilities=['message-attachments','image-opening']
  let request=s:open() | call assert_equal('messages.attachmentOpen',request.method)
  call s:reply(request,{'result':{'id':repeat('a',64),'name':'sample.txt','mime':'text/plain','size':16,'text':v:true,'data':'QXR0YWNobWVudCBib2R5Cg=='}})
  call assert_equal(1,len(g:open_owner_files))
  call s:fresh() | let request=s:open() | let value=s:value() | let value.meta.id=repeat('b',64)
  call s:reply(request,{'result':value}) | call assert_equal(1,s:invalid) | call assert_equal([],g:open_owner_files)
  call add(s:checks,'legacy original dispatch remains available and wrong typed identity still fails protocol admission without opening or downgrading')
  call s:fresh()
  let s:message.attachments=[{'id':repeat('a',64)},{'id':repeat('b',64)}]
  let requests=len(s:requests)
  call wbx#attachment_open#open(g:open_owner,'open','')
  let Choice=g:OpenOwnerChoice
  call reverse(s:message.attachments)
  call call(Choice,[2]) | call assert_equal(requests,len(s:requests),'changed chooser projection cannot reinterpret the selected row')
  call wbx#attachment_open#open(g:open_owner,'open','')
  call call(g:OpenOwnerChoice,[2])
  call assert_equal(repeat('a',64),s:requests[-1].params.attachmentId)
  call add(s:checks,'chooser captures exact ordered files and native intent, then delegates a deliberate current choice without row-to-target substitution')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Loaded attachment source',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Loaded attachment source"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'scope':'real native view/settings/protocol primitives; controlled physical file/sink/image effects, inert application ports; no jobs/service'})],$WBX_EDITOR_RESULT)
qa!
