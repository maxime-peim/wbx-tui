" Public Enter/activation with native hooks and controlled protocol responses.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:activation_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:activation_writes,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:activation_running=1','return 1','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:activation_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:activation_running=0 | let g:activation_writes=[]
let g:wbx_tui={'backend':['/bin/false'],'images':0,'people_status':0,'notifications':0,'read_status':1,
      \ 'persist_drafts':0,'spaces_cache':0,'upcoming_meetings':0,'mark_read_on_open':1,'folds':0,'statusline':0}
runtime plugin/wbx.vim
filetype plugin on
let s:checks=[] | let s:drawn=[] | let s:hook='' | let s:hook_count=0
let s:rooms=map(['A','B','C','D'],'{"id":v:val,"title":"Activation ".v:val,"type":"group","unread":v:true}')
function! s:requests(method) abort
  return filter(copy(g:activation_writes),'v:val.method ==# a:method')
endfunction
function! s:receipts(number) abort
  return has('nvim') || $WBX_EDITOR_SCREEN==# '1' ? a:number : 0
endfunction
function! s:reply(id, ...) abort
  call wbx#_receive(extend({'jsonrpc':'2.0','id':a:id},a:0 ? {'error':{'code':-1,'message':'Synthetic unknown receipt/selection'}} : {'result':v:null}))
endfunction
function! s:publish(room, ...) abort
  let state={'revision':wbx#state().revision+1,'state':'ready','mode':'demo','readStatus':'ready','ready':v:true,'loading':v:false,
        \ 'rooms':deepcopy(s:rooms),'room':copy(s:rooms[index(['A','B','C','D'],a:room)]),
        \ 'messages':map(range(1,3),'{"id":a:room."-".v:val,"author":"Synthetic","created":"","text":"Activation ".a:room." body ".v:val}')}
  if a:0 | call extend(state,a:1) | endif
  let envelope={'jsonrpc':'2.0','method':'state','params':state}
  call assert_true(wbx#protocol#valid(envelope)) | call wbx#_receive(envelope)
endfunction
function! s:enter(room) abort
  WebexSpaces
  call cursor(index(b:wbx_room_ids,a:room)+1,1)
  call feedkeys("\<CR>",'xt')
endfunction
function! s:reload(room) abort
  WebexSpaces
  let id=wbx#select(a:room,1,1,1)
  call s:publish(a:room) | call s:reply(id)
endfunction
function! s:hook() abort
  if empty(s:hook) || bufnr('%')!=wbx#buffers().history | return | endif
  let mode=s:hook | let s:hook='' | let s:hook_count+=1
  if mode==# 'redirect'
    call win_gotoid(s:foreign_window)
  elseif mode==# 'promote'
    setlocal buftype=
  elseif mode==# 'annotate'
    setlocal modifiable
    call setline(1,'History annotation retained by FileType hook')
  endif
endfunction
function! s:probe() abort
  return [bufnr('%'),getline(1,'$'),undotree(),b:changedtick,winsaveview(),getcurpos()]
endfunction
try
  WebexDemo
  call wbx#_receive({'jsonrpc':'2.0','id':g:activation_writes[0].id,'result':{'version':1,
        \ 'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','same-space-resume']}})
  call s:reply(g:activation_writes[-1].id) | call s:publish('A')
  call s:enter('A')
  " Already-ready Enter is a local resume, never fresh receipt consent.
  call assert_equal(0,len(s:requests('rooms.read')))
  call s:reload('A')
  let reads=s:requests('rooms.read') | call assert_equal(s:receipts(1),len(reads))
  if !empty(reads) | call s:reply(reads[-1].id,1) | endif
  call s:reload('A')
  call assert_equal(s:receipts(1),len(s:requests('rooms.read')),'failed/unknown automatic endpoint is not retried by explicit reopening')
  normal! gg
  let cursor=getcurpos() | let request_count=len(g:activation_writes)
  call s:enter('A')
  call assert_equal(cursor,getcurpos()) | call assert_equal(request_count,len(g:activation_writes),'resume has no selection or receipt request')
  normal! Gzb
  WebexMarkRead
  let reads=s:requests('rooms.read') | call assert_equal(s:receipts(2),len(reads))
  if !empty(reads) | call s:reply(reads[-1].id) | endif
  call assert_true(wbx#state().rooms[0].unread,'ACK does not invent authoritative read state')
  call add(s:checks,'ordinary ready Enter/resume preserves view; failed automatic receipt stays deduplicated and explicit manual recovery works')

  botright 6new | file activation-foreign.txt
  call setline(1,'Independent hook foreground')
  call feedkeys("\<Esc>",'xt') | call append(1,'Unsynced hook work')
  let s:foreign_window=win_getid()
  WebexSpaces
  " Deliberately leaving a buffer natively synchronizes its undo block. Capture
  " after that user navigation, before hooks/activation can touch the foreground.
  call win_execute(s:foreign_window,'let g:activation_native = '.expand('<SID>').'probe()')
  let native=g:activation_native
  for scenario in ['bufenter','filetype-redirect','filetype-promote','filetype-annotate']
    let history=wbx#buffers().history
    if scenario!=# 'bufenter'
      call setbufvar(history,'wbx_initialized',0)
      call setbufvar(history,'&filetype','')
    endif
    WebexSpaces
    let id=wbx#select('B',1,1,1) | call s:publish('B')
    let s:hook=scenario==# 'filetype-promote' ? 'promote' : scenario==# 'filetype-annotate' ? 'annotate' : 'redirect'
    augroup activation_test_hooks
      autocmd!
      if scenario==# 'bufenter'
        autocmd BufEnter * call s:hook()
      else
        autocmd FileType wbx-history call s:hook()
      endif
    augroup END
    let request_count=len(s:requests('rooms.read')) | let hooks=s:hook_count
    call s:reply(id)
    call assert_equal(hooks+1,s:hook_count,scenario.': actual native hook ran')
    call assert_equal(request_count,len(s:requests('rooms.read')),scenario.': redirected/promoted/annotated activation does not acknowledge')
    if scenario==# 'bufenter' || scenario==# 'filetype-redirect'
      call assert_equal(s:foreign_window,win_getid()) | call assert_equal(native,s:probe())
    endif
    if scenario==# 'filetype-promote' | call assert_equal('',getbufvar(history,'&buftype')) | endif
    if scenario==# 'filetype-annotate' | call assert_equal('History annotation retained by FileType hook',getbufline(history,1)[0]) | endif
    augroup activation_test_hooks | autocmd! | augroup END
    " Test-owned promotion/annotation restored only to exercise a fresh explicit retry.
    call setbufvar(history,'&buftype','nofile')
    call setbufvar(history,'wbx_kind','history')
    call setbufvar(history,'wbx_render_tick',getbufvar(history,'changedtick'))
  endfor
  call add(s:checks,'real BufEnter/FileType redirection, promotion and annotation prevent receipt/focus theft while foreground text/full undo stays exact')
  call s:reload('B')
  let reads=s:requests('rooms.read')
  call assert_equal(s:receipts(3),len(reads),'fresh explicit activation recovers after hooks are removed')
  if !empty(reads) | call s:reply(reads[-1].id) | endif
  call assert_equal(wbx#buffers().history,bufnr('%'))
  call assert_equal('B',b:wbx_history_room)
  call add(s:checks,'ordinary explicit retry after hook removal opens complete history and the exact newest endpoint')

  call s:enter('C') | let old=g:activation_writes[-1].id
  call s:enter('B') | let historywin=win_getid() | let request_count=len(g:activation_writes)
  call s:reply(old,1)
  call assert_equal(request_count,len(g:activation_writes)) | call assert_equal(historywin,win_getid())
  call assert_equal('B',b:wbx_history_room)
  call s:enter('D') | let failed=g:activation_writes[-1].id
  call s:reply(failed,1) | call assert_equal(wbx#buffers().rooms,bufnr('%'))
  call s:enter('D') | let retry=g:activation_writes[-1].id
  call s:reply(failed) | call s:publish('D') | call s:reply(retry)
  call assert_equal(wbx#buffers().history,bufnr('%')) | call assert_equal('D',b:wbx_history_room)
  let reads=s:requests('rooms.read') | call assert_equal(s:receipts(4),len(reads))
  if !empty(reads) | call assert_equal({'roomId':'D','messageId':'D-3'},reads[-1].params) | call s:reply(reads[-1].id) | endif
  call add(s:checks,'late success/error cannot revive canceled activation; failed selection recovers only through a new matching intent')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let rows=[] | let info=getwininfo(win_getid())[0]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Activation D body 3',join(rows,"\n")) | call add(s:drawn,filter(rows,'v:val =~# "Activation D body"'))
  endif
  for request in g:activation_writes
    call assert_true(index(['hello','session.start','rooms.select','rooms.read'],request.method)>=0,'Enter/setup/write never sends or mutates')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:activation_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'hook_count':s:hook_count,
      \ 'positive_receipts':s:receipts(4),'receipts':map(s:requests('rooms.read'),'v:val.params'),
      \ 'scope':'ordinary public Enter/reload/manual-read with real native hooks and inert protocol transport; no service'})],$WBX_EDITOR_RESULT)
qa!
