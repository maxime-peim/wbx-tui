" Actual state/RPC coordinator and renderer; inert transport, no account/network.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:catalogue_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:catalogue_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:catalogue_starts += 1','throw "Unexpected start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:catalogue_running = 0','call wbx#_exit(0)','endfunction'],s:stub . '/autoload/wbx/transport.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:catalogue_running = 1 | let g:catalogue_requests = [] | let g:catalogue_starts = 0
let g:wbx_tui = {'backend':['/bin/false'],'spaces_cache':0,'read_status':0,'people_status':0,
      \ 'notifications':0,'images':0,'upcoming_meetings':0,'persist_drafts':0,'mark_read_on_open':1}
runtime plugin/wbx.vim
filetype plugin on
syntax off
set t_Co=0
let s:checks = [] | let s:drawn = []
function! s:text() abort
  return join(getbufline(s:spaces,1,'$'),"\n")
endfunction
function! s:publish() abort
  let s:state.revision = wbx#state().revision+1
  if !wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':s:state}) | throw 'Invalid catalogue fixture state' | endif
  let native = [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat]
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
  call assert_equal(native,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat],'background catalogue transition preserves foreground native work')
endfunction
function! s:check(case, expected, absence) abort
  call assert_match(a:expected,s:text(),a:case)
  call assert_equal(a:absence,s:text() =~# '\[No spaces found\]',a:case . ': absence requires successful exhausted discovery')
  if $WBX_EDITOR_SCREEN ==# '1'
    let origin = win_getid()
    call win_gotoid(s:spaces_window)
    call cursor(search(a:expected,'nw'),1)
    normal! zt
    redraw!
    let info = getwininfo(win_getid())[0]
    let row = screenpos(win_getid(),line('.'),1).row
    let text = join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
    call assert_match(a:expected,text,a:case . ': category is drawn with syntax off')
    call add(s:drawn,{'case':a:case,'line':trim(text),'absence':a:absence})
    call win_gotoid(origin)
  endif
  call add(s:checks,a:case)
endfunction
function! s:refresh() abort
  let origin = win_getid() | let before = len(g:catalogue_requests)
  call win_gotoid(s:spaces_window)
  WebexRefresh
  call assert_equal(before+1,len(g:catalogue_requests),'only explicit native refresh starts one read')
  call assert_equal('rooms.list',g:catalogue_requests[-1].method)
  call assert_equal({},g:catalogue_requests[-1].params)
  call wbx#_receive({'jsonrpc':'2.0','id':g:catalogue_requests[-1].id,'result':v:null})
  call win_gotoid(origin)
endfunction
try
  let base = {'revision':0,'state':'ready','mode':'live','ready':v:false,'room':v:null,'rooms':[],'messages':[]}
  for value in ['unverified','loading','ready','failed']
    call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':extend(copy(base),{'roomsStatus':value})}))
  endfor
  for value in [v:null,v:true,0,[],{},'verified','READY','failed | quit']
    call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':extend(copy(base),{'roomsStatus':value})}),'catalogue status is a closed optional presentation enum')
  endfor
  call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':base}),'old backend state is accepted, without inventing verification')
  call wbx#buffers()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'),[])
  let s:state = extend(copy(base),{'revision':1,'roomsStatus':'unverified','spacesCache':{'state':'off'}})
  call call(function('<SNR>' . sid . '_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':[]}}])
  let s:spaces = wbx#buffers().rooms | let s:spaces_window = win_findbuf(s:spaces)[0]
  call win_execute(s:spaces_window,'vertical resize 80')
  botright 5new | file independent-catalogue-work.txt
  call setline(1,'Unsent native work') | call feedkeys("i\<Esc>",'xt')
  call append(1,'Unsynced foreground work')
  call assert_equal(0,undotree().synced)
  call s:check('unverified-cache-off','Spaces not yet verified',0)
  call append(line('$'),'Unsynced work at pending publication')
  call assert_equal(0,undotree().synced)
  let s:state.roomsStatus = 'loading' | let s:state.loadingRooms = v:true | call s:publish()
  call s:check('pending-cache-off','Loading spaces',0)
  let s:state.roomsStatus = 'failed' | let s:state.loadingRooms = v:false | call s:publish()
  call s:check('failed-cache-off','Spaces discovery failed',0)
  call assert_equal([],g:catalogue_requests,'failure/render/snapshot never automatically retries discovery')
  call s:refresh()
  let s:state.roomsStatus = 'loading' | let s:state.loadingRooms = v:true | call s:publish()
  call s:check('explicit-retry-pending','Loading spaces',0)
  let s:state.roomsStatus = 'ready' | let s:state.loadingRooms = v:false | call s:publish()
  call s:check('verified-empty-cache-off','No spaces found',1)
  let s:state.roomsStatus = 'failed' | call s:publish()
  call s:check('failed-after-empty','Spaces discovery failed',0)
  call s:refresh()
  let s:state.roomsStatus = 'ready'
  let s:state.rooms = [{'id':'exact-room','title':'Verified room','type':'group'}]
  call s:publish()
  call s:check('verified-nonempty','Verified room',0)
  call assert_true(index(getbufvar(s:spaces,'wbx_room_ids'),'exact-room') > 0)
  let s:state.roomsStatus = 'failed' | call s:publish()
  call s:check('failed-refresh-retains-rows','Spaces refresh failed',0)
  call assert_true(index(getbufvar(s:spaces,'wbx_room_ids'),'exact-room') > 0)
  let s:state.roomsStatus = 'ready' | let s:state.rooms = [] | let s:state.moreRooms = v:true | call s:publish()
  call s:check('empty-page-not-exhausted','No spaces loaded',0)
  let s:state.moreRooms = v:false | call remove(s:state,'roomsStatus') | call s:publish()
  call s:check('legacy-without-evidence','Spaces not yet verified',0)
  let s:state.spacesCache = {'state':'miss','verified':v:false} | call s:publish()
  call s:check('cache-on-unverified','Spaces not yet verified',0)
  let s:state.spacesCache = {'state':'ready','verified':v:true} | call s:publish()
  call s:check('legacy-cache-verified-empty','No spaces found',1)
  let s:state.roomsStatus = 'failed' | call s:publish()
  call s:check('failed-outranks-old-cache-evidence','Spaces discovery failed',0)
  let s:state.spacesCache = {'state':'stale','verified':v:false,'observedAt':1,'reason':'refresh-failed'}
  let s:state.rooms = [{'id':'cached-room','title':'Cached room','type':'group','cached':v:true}]
  call s:publish()
  call s:check('cached-failure-is-not-empty','Spaces refresh failed',0)
  call assert_match('browse only',s:text())
  let s:state.rooms = [] | let s:state.roomsStatus = 'ready'
  let s:state.spacesCache = {'state':'miss','verified':v:false} | call s:publish()
  call s:check('cache-gate-not-yet-released','Spaces not yet verified',0)
  let s:state.spacesCache = {'state':'ready','verified':v:true} | call s:publish()
  call s:check('verified-empty-after-cache-release','No spaces found',1)
  let g:catalogue_running = 0 | call wbx#_exit(0)
  call assert_notmatch('No spaces found',s:text(),'disconnection cannot leave a current absence claim')
  call win_execute(s:spaces_window,'setlocal modifiable | call append(line("$"),"Native catalogue annotation")')
  let retained = json_decode(trim(win_execute(s:spaces_window,'echo json_encode([getline(1,"$"),undotree(),b:changedtick])')))
  let s:state.roomsStatus = 'failed' | call s:publish()
  call assert_equal(retained,json_decode(trim(win_execute(s:spaces_window,'echo json_encode([getline(1,"$"),undotree(),b:changedtick])'))),'status updates cannot overwrite annotated Spaces text/full undo')
  call add(s:checks,'annotated-spaces-preserved')
  call assert_equal(2,len(g:catalogue_requests))
  call assert_equal(0,g:catalogue_starts)
  call assert_equal(v:null,wbx#state().room)
  call assert_equal({'read':0,'unread':0,'tracked':0},wbx#unread#status())
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
let g:catalogue_running = 0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'requests':map(copy(g:catalogue_requests),'v:val.method'),'backendStarts':g:catalogue_starts})],$WBX_EDITOR_RESULT)
qa!
