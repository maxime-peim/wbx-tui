" Public image loading/reuse/recovery with real view/snapshot/render/RPC owners; inert transport only.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:image_flow_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:image_flow_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:image_flow_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:image_flow_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:image_flow_running=1 | let g:image_flow_requests=[]
let g:wbx_tui={'images':0,'notifications':0,'people_status':0,'read_status':0,'upcoming_meetings':0,
      \ 'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:session='a' | let s:message='one' | let s:preview=0 | let s:checks=[] | let s:drawn=[]
let s:image={'id':repeat('a',64),'state':'ready','width':1,'height':1,'lines':repeat([repeat('⣿',40)],12),
      \ 'png':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='}
function! s:state() abort
  let room={'id':'room','title':'Image request room','type':'group'}
  let image=s:preview ? filter(copy(s:image),'index(["width","height"],v:key)<0') : {'id':s:image.id,'state':'pending'}
  return {'revision':get(wbx#state(),'revision',-1)+1,'state':'ready','mode':'demo','ready':v:true,'rooms':[room],'room':room,
        \ 'messages':[{'id':s:message,'text':'Public image source','author':'Synthetic','created':'','images':[image],
        \ 'attachments':[{'id':s:image.id}]}],'localContext':{'sessionId':repeat(s:session,32),'coverage':'session-only'}}
endfunction
function! s:publish() abort
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':s:state()})
endfunction
function! s:hello(...) abort
  let value={'version':1,'state':s:state(),'meeting':{'active':v:false,'ready':v:false},
        \ 'capabilities':['message-images','image-opening','message-attachments','local-context-v1']}
  if a:0 | call wbx#_receive({'jsonrpc':'2.0','id':a:1,'result':value})
  else | call call(s:Hello,[{'result':value}]) | endif
endfunction
function! s:history() abort
  call win_gotoid(s:window)
  execute 'buffer '.s:history
  call cursor(b:wbx_message_blocks[0].body,1)
  normal! zt
  redraw!
endfunction
function! s:reply(request, result) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':a:result})
endfunction
function! s:requests(method) abort
  return filter(copy(g:image_flow_requests),'v:val.method==# a:method')
endfunction
function! s:open() abort
  let requests=len(s:requests('messages.imageOpen'))
  WebexImage 1
  call assert_equal(requests+1,len(s:requests('messages.imageOpen')))
  return s:requests('messages.imageOpen')[-1]
endfunction
function! s:finish(request) abort
  call s:reply(a:request,s:image)
  call assert_equal('image',get(b:,'wbx_kind',''))
  call assert_equal(s:image,b:wbx_view_image)
  call assert_equal(s:message,b:wbx_image_source.message)
  call assert_equal('room',b:wbx_image_source.room)
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
try
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  let s:Hello=function('<SNR>'.sid.'_hello')
  call call(function('<SNR>'.sid.'_layout'),[]) | call s:hello()
  let s:history=wbx#buffers().history | let s:window=win_findbuf(s:history)[0]
  call s:history()
  call wbx#_images_visible() | call assert_equal([],g:image_flow_requests,'explicit opt-out causes zero automatic reads')
  call remove(g:wbx_tui,'images')
  call s:publish()
  " Scroll the actual pending-image row into the native viewport.
  call cursor(b:wbx_image_pending[0].row,1)
  normal! zt
  redraw!
  call wbx#_images_visible() | let preview=g:image_flow_requests[-1]
  call assert_equal('messages.images',preview.method)
  let s:preview=1 | call s:publish() | call s:reply(preview,[filter(copy(s:image),'index(["width","height"],v:key)<0')])
  let g:wbx_tui.images=0
  call assert_false(empty(b:wbx_image_placements),'accepted preview state renders ordinary history image')
  call assert_equal(s:image.id,b:wbx_image_placements[0].id)
  call add(s:checks,'default-on visible preview loads through accepted state and renders without explicit opening; opt-out performs zero automatic reads')

  let request=s:open() | call s:finish(request)
  let before=s:native() | let source=copy(b:wbx_image_source) | let requests=len(g:image_flow_requests)
  WebexImage 1
  call assert_equal(requests,len(g:image_flow_requests)) | call assert_equal(before,s:native())
  call s:history() | WebexImage 1
  call assert_equal(requests,len(g:image_flow_requests)) | call assert_equal(source,b:wbx_image_source)
  let s:message='two' | call s:publish() | call s:history()
  let request=s:open() | call s:finish(request)
  call assert_equal('two',b:wbx_image_source.message)
  call add(s:checks,'ordinary explicit open and same-source history/viewer reuse are zero-fetch; identical image IDs from another message require their own read/source stamp')

  " Edited image buffers remain native user work, including all undo.
  setlocal modifiable
  call setline(1,'Retained image annotation') | call feedkeys("i\<Esc>",'xt')
  let annotated=bufnr('%') | let annotation_window=win_getid() | let annotation=undotree()
  call s:history()
  let requests=len(g:image_flow_requests)
  WebexImage 1
  call assert_equal(requests,len(g:image_flow_requests),'same-source native annotation conflict never causes a needless refetch')
  call assert_equal('history',b:wbx_kind)
  call assert_equal('Retained image annotation',getbufline(annotated,1)[0])
  call win_execute(annotation_window,'let w:image_flow_undo=undotree()')
  call assert_equal(annotation,getwinvar(annotation_window,'image_flow_undo'))
  call win_execute(annotation_window,'file '.fnameescape($WBX_EDITOR_RESULT.'.retained-image.txt'))
  let request=s:open()
  call wbx#_receive({'jsonrpc':'2.0','id':request.id,'error':{'code':-32002,'message':'Synthetic image failure'}})
  let requests=len(g:image_flow_requests) | sleep 60m | call assert_equal(requests,len(g:image_flow_requests),'no automatic open retry')
  let request=s:open() | call s:finish(request)
  call add(s:checks,'annotations/full undo are never reused or overwritten; local view conflict and RPC failure permit later explicit recovery after deliberate promotion')

  call s:history() | let s:message='three' | let s:preview=0 | call s:publish()
  let old=s:open() | let s:session='b' | call s:publish()
  let current=s:open() | let requests=len(s:requests('messages.imageOpen'))
  call s:reply(old,s:image)
  call assert_equal('history',b:wbx_kind)
  WebexImage 1
  call assert_equal(requests,len(s:requests('messages.imageOpen')),'late old image cannot release new read')
  call s:finish(current)
  " Local viewer reuse is deliberately allowed even after its source session ends.
  let s:session='c' | call s:publish() | let requests=len(g:image_flow_requests)
  WebexImage 1 | call assert_equal(requests,len(g:image_flow_requests))
  call s:history() | let request=s:open() | call s:finish(request)
  call add(s:checks,'same-ID session replacement rejects old data and preserves newer busy admission; viewer-local snapshots remain usable but history requires current generation')

  call s:history() | let s:message='four' | let s:preview=0 | call s:publish()
  let g:wbx_tui.images='auto' | call s:publish()
  call cursor(b:wbx_image_pending[0].row,1) | normal! zt
  redraw!
  call wbx#_images_visible() | let old=g:image_flow_requests[-1]
  call assert_equal('messages.images',old.method) | let g:wbx_tui.images=0
  let s:session='d' | call s:publish() | let current=s:open()
  call s:reply(old,[])
  let requests=len(s:requests('messages.imageOpen'))
  WebexImage 1 | call assert_equal(requests,len(s:requests('messages.imageOpen')))
  call s:finish(current)
  call s:history() | let s:message='five' | let s:preview=1 | call s:publish()
  " Unified legacy attachment fallback uses the same reservation and exact stamps.
  WebexAttachment 1 | let fallback=g:image_flow_requests[-1]
  call assert_equal('messages.imageOpen',fallback.method)
  let requests=len(s:requests('messages.imageOpen'))
  WebexImage 1 | call assert_equal(requests,len(s:requests('messages.imageOpen')))
  call s:finish(fallback)
  call s:history() | let requests=len(g:image_flow_requests) | WebexAttachment 1
  call assert_equal(requests,len(g:image_flow_requests),'same-source fallback reuse requires no second fetch')
  call add(s:checks,'late preview callback cannot release a replacement open; unified legacy attachment fallback shares image admission and stamps reusable exact-source snapshots')

  call s:history() | let s:message='six' | call s:publish()
  let request=s:open() | let bad=copy(s:image) | let bad.id=repeat('b',64)
  call s:reply(request,bad) | call assert_false(g:image_flow_running)
  let s:session='e'
  WebexDemo
  let hello=g:image_flow_requests[-1] | call assert_equal('hello',hello.method)
  call s:hello(hello.id) | call s:reply(g:image_flow_requests[-1],v:null)
  call s:history() | let request=s:open() | call s:finish(request)
  call assert_equal('Retained image annotation',getbufline(annotated,1)[0])
  call add(s:checks,'wrong image identity follows protocol disconnect without opening; explicit reconnect/new open recovers and independent annotation remains intact')
  call assert_equal([],filter(copy(g:image_flow_requests),'index(["messages.images","messages.imageOpen","hello","session.start"],v:val.method)<0'))
  if $WBX_EDITOR_SCREEN==# '1'
    normal! ggzt
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
    endfor
    call assert_match('Image · 1×1 pixels',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Image ·"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:image_flow_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'methods':map(copy(g:image_flow_requests),'v:val.method'),
      \ 'scope':'public native image/attachment commands and real view/render/RPC/protocol owners; inert physical transport only'})],$WBX_EDITOR_RESULT)
qa!
