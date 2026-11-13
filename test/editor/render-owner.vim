" Real presentation primitives and inert application ports. No plugin/backend.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
" Image placement's existing deferred visibility hook is an application effect.
" Keep that effect inert too, without loading the real coordinator.
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload','p')
call writefile(['function! wbx#_images_visible() abort','endfunction',
      \ 'function! wbx#state() abort','return deepcopy(g:render_owner_state)','endfunction'],s:stub.'/autoload/wbx.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:wbx_tui={'images':0,'people_status':0,'persist_drafts':0,'folds':0,'statusline':0}
let s:checks=[] | let s:drawn=[] | let s:notices=[] | let s:compose_calls=0
let s:uncertain=0 | let s:pending=0
let s:refuse=0 | let s:status_value={'state':'ready'}
function! s:status() abort
  return copy(s:status_value)
endfunction
function! s:destination(buffer) abort
  return {'id':'render-room'}
endfunction
function! s:compose(room) abort
  let s:compose_calls+=1
  return s:refuse ? 0 : s:draft
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:uncertain(room) abort
  return s:uncertain
endfunction
function! s:pending(room) abort
  return s:pending
endfunction
function! s:probe() abort
  return [getline(1,'$'),undotree(),b:changedtick,winsaveview(),getcurpos()]
endfunction
function! s:apply() abort
  return wbx#render#apply(s:owner,s:state,s:buffers,s:connection)
endfunction
try
  let cpo=&cpoptions
  let s:owner=wbx#render#new({'Status':function('s:status'),'Destination':function('s:destination'),
        \ 'Compose':function('s:compose'),'Notify':function('s:notify'),'Uncertain':function('s:uncertain'),'Pending':function('s:pending')})
  call assert_equal(cpo,&cpoptions)
  " Allocation is a caller responsibility, never a renderer effect.
  let s:buffers={'rooms':wbx#workspace#buffer('wbx://spaces','rooms'),'history':wbx#workspace#buffer('wbx://history','history')}
  let s:draft=wbx#workspace#buffer('wbx://compose/render-room','compose','render-room')
  let s:state={'state':'ready','mode':'demo','ready':v:true,'roomsStatus':'ready',
        \ 'rooms':[{'id':'render-room','title':'Renderer room','type':'group','unread':v:true}],
        \ 'room':{'id':'render-room','title':'Renderer room','type':'group'},
        \ 'messages':[{'id':'m1','author':'Synthetic','created':'','text':'Body from renderer'}]}
  let g:render_owner_state=s:state
  let s:connection={'disconnected':0,'hint':''}
  let input=deepcopy(s:state) | let handles=copy(s:buffers)
  execute 'buffer '.s:buffers.rooms
  call assert_equal(1,s:apply())
  call assert_equal(input,s:state) | call assert_equal(handles,s:buffers)
  call assert_equal(['','','render-room'],getbufvar(s:buffers.rooms,'wbx_room_ids')[:2])
  call assert_equal('render-room',getbufvar(s:buffers.history,'wbx_history_room'))
  call assert_equal('m1',getbufvar(s:buffers.history,'wbx_message_blocks')[0].id)
  call assert_false(wbx#render#drafts_changed(s:owner))
  call add(s:checks,'inert application ports render detached inputs and exact row/message metadata without state or handle ownership')

  execute 'buffer '.s:buffers.history
  let before=s:probe()
  for i in range(12) | call s:apply() | endfor
  call assert_equal(before,s:probe())
  call assert_equal({'history':0,'images':0,'status':0},b:wbx_render_work)
  call assert_equal(0,wbx#render#status(s:owner))
  call add(s:checks,'quiet rendering preserves full undo/view/tick and performs zero history/image/status work')

  let s:connection={'disconnected':1,'hint':'[Disconnected · drafts retained]'}
  call s:apply()
  call assert_match('Disconnected · drafts retained',join(getline(1,'$'),"\n"))
  let s:connection={'disconnected':0,'hint':''}
  let s:uncertain=1 | let s:pending=1
  call s:apply()
  call assert_match('Delivery uncertain',join(getline(1,'$'),"\n"))
  call assert_match('Sending…',join(getline(1,'$'),"\n"))
  let s:uncertain=0 | let s:pending=0
  call s:apply()
  call assert_notmatch('Disconnected\|Delivery uncertain\|Sending…',join(getline(1,'$'),"\n"))
  call assert_match('Body from renderer',join(getline(1,'$'),"\n"))
  call add(s:checks,'connection and delivery banners use caller evidence without acquiring uncertainty or transport state')

  let signature=deepcopy(s:owner.status)
  let s:refuse=1 | let s:status_value={'state':'changed'}
  call assert_equal(0,s:apply(),'unavailable composer preserves the existing early-return scheduling seam')
  call assert_equal(signature,s:owner.status)
  let s:refuse=0
  call assert_equal(1,s:apply())
  call assert_equal(1,getbufvar(s:buffers.history,'wbx_render_work').status)
  call add(s:checks,'composer refusal skips completion effects and later recovery updates the redraw signature')

  setlocal modifiable
  call setline(1,'Native renderer annotation')
  let before=s:probe() | let blocks=deepcopy(b:wbx_message_blocks)
  let s:state.messages=[{'id':'m2','author':'New','created':'','text':'Newest after annotation'}]
  call s:apply() | call s:apply()
  call assert_equal(before,s:probe()) | call assert_equal(blocks,b:wbx_message_blocks)
  call assert_equal(1,len(s:notices),'annotation warning is emitted once')
  let history=bufnr('%')
  execute 'bunload! '.history
  let s:state.messages[0].text='Newest while annotation unloaded'
  call s:apply()
  call assert_false(bufloaded(history),'passive render cannot reload annotation buffers')
  call assert_equal(blocks,getbufvar(history,'wbx_message_blocks'))
  call add(s:checks,'annotated or unloaded surfaces retain native work and old metadata together')

  " Do not let the fixture accidentally gain application/transport behavior.
  call assert_equal([],filter(getscriptinfo(),'v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx.vim" || v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx/transport.vim"'))
  if $WBX_EDITOR_SCREEN==# '1'
    execute 'buffer '.s:buffers.rooms
    redraw!
    let row=screenpos(win_getid(),1,1).row | let col=getwininfo(win_getid())[0].wincol
    let text=join(map(range(col,col+winwidth(0)-1),'screenstring(row,v:val)'),'')
    call assert_match('Webex spaces',text) | call add(s:drawn,trim(text))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'compose_calls':s:compose_calls,
      \ 'notices':len(s:notices),'scope':'real renderer/view primitives; inert status/destination/draft/delivery ports; no application or backend'})],$WBX_EDITOR_RESULT)
qa!
