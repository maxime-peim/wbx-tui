" Accepted-state/renderer + actual local unread model; transport only is inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:provenance_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:provenance_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:provenance_starts += 1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:provenance_running = 0','call wbx#_exit(0)','endfunction'],s:stub . '/autoload/wbx/transport.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:provenance_running = 0 | let g:provenance_requests = [] | let g:provenance_starts = 0
let g:wbx_tui = {'backend':['/bin/false'],'images':0,'people_status':0,'notifications':0,
      \ 'upcoming_meetings':0,'persist_drafts':0,'folds':0,'mark_read_on_open':1}
runtime plugin/wbx.vim
filetype plugin on
syntax off
set t_Co=0
let s:checks = [] | let s:drawn = []
function! s:publish() abort
  let s:state.revision = wbx#state().revision+1
  if !wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':s:state}) | throw 'Invalid provenance fixture state' | endif
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
endfunction
function! s:row(id) abort
  call win_gotoid(s:spaces_window)
  let row = index(b:wbx_room_ids,a:id)+1
  call assert_true(row > 0,'exact loaded room row exists')
  call cursor(row,1)
endfunction
function! s:line(prefix) abort
  return get(filter(copy(getline(1,'$')),'stridx(v:val,a:prefix) == 0'),0,'')
endfunction
function! s:source() abort
  return [win_getid(),bufnr('%'),getcurpos(),getline(1,'$'),undotree(),b:changedtick,&breakat,
        \ deepcopy(get(b:,'wbx_unread_rows',[])),deepcopy(get(b:,'wbx_local_read_rows',[])),deepcopy(get(b:,'wbx_local_unread_rows',[]))]
endfunction
function! s:draw(case, server, local, emphasis) abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  let readout = {'case':a:case}
  for [key,prefix,expected] in [['server','Server state: ',a:server],['local','Local override: ',a:local],['emphasis','List emphasis: ',a:emphasis]]
    call cursor(search('^' . prefix,'nw'),1)
    normal! zt
    redraw!
    let info = getwininfo(win_getid())[0]
    let row = screenpos(win_getid(),line('.'),1).row
    call assert_true(row > 0)
    let text = join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
    call assert_match('^' . prefix . expected,text,a:case . ': ' . key . ' is readable without syntax/color')
    let readout[key] = trim(text) | let readout.width = info.width
  endfor
  call add(s:drawn,readout)
endfunction
function! s:inspect(id, server, local, emphasis, case) abort
  call s:row(a:id)
  " A user invokes Ex from a native input boundary. Don't compare the renderer's
  " still-open scripted undo block against Vim's normal window-leave sync.
  call feedkeys("\<Esc>",'xt')
  let source = s:source() | let state = wbx#state() | let counts = wbx#unread#status()
  let requests = len(g:provenance_requests)
  let action = filter(wbx#commands#catalogue(),'v:val.command ==# "WebexUnreadStatus"')[0]
  call assert_true(action.available,'local provenance needs no backend capability or selected/open destination')
  call assert_equal('',action.key,'new inspection has no default key family')
  WebexUnreadStatus
  call assert_equal('wbx://unread-status',bufname('%'))
  call assert_true(wbx#lists#clean(bufnr('%'),'unread-status'))
  call assert_false(&modifiable)
  call assert_equal('nofile',&buftype)
  call assert_match('Room ID: ' . a:id,join(getline(1,'$'),"\n"),'the highlighted row is inspected, not the open destination')
  call assert_match('^Server state: ' . a:server,s:line('Server state:'))
  call assert_match('^Local override: ' . a:local,s:line('Local override:'))
  call assert_match('^List emphasis: ' . a:emphasis,s:line('List emphasis:'))
  call assert_match('snapshot',join(getline(1,'$'),"\n"))
  call assert_notmatch('[[:cntrl:]\x7f-\x9f\u202e]',s:line('Title:'),'title is bounded inert text, not controls/directional overrides')
  call assert_match('not a read receipt',join(getline(1,'$'),"\n"))
  call assert_equal('',maparg('<CR>','n'),'inspection has no Enter-to-open or acknowledgement mapping')
  if a:case ==# 'fresh-unread'
    WebexMarkRead
    call assert_equal(requests,len(g:provenance_requests),'a fresh-looking snapshot is still not a receipt-eligible history endpoint')
  endif
  call feedkeys("\<CR>",'xt')
  silent! write
  call assert_equal(requests,len(g:provenance_requests),'Enter/write never select, fetch, acknowledge or send')
  call assert_equal(state,wbx#state(),'inspection never changes accepted server or selected-destination state')
  call assert_equal(counts,wbx#unread#status(),'inspection cannot mark a space locally read')
  call s:draw(a:case,matchstr(a:server,'UNREAD\|READ\|UNKNOWN'),matchstr(a:local,'^\w\+'),a:emphasis)
  call wbx#lists#close()
  call assert_equal(source,s:source(),'exact Spaces origin/cursor/text/full undo and unread row metadata survive')
  call assert_equal(requests,len(g:provenance_requests))
  call add(s:checks,a:case)
endfunction
try
  let before = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  WebexUnreadStatus
  call assert_equal(before,[win_getid(),bufnr('%'),getline(1,'$'),undotree()],'cold wrong-context inspection is an inert refusal')
  call assert_equal(0,g:provenance_starts)
  call wbx#buffers()
  let sid = filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'),[])
  let at = '2026-11-17T12:00:00.000Z'
  let s:state = {'revision':1,'state':'ready','mode':'live','ready':v:true,'sending':v:false,'readStatus':'ready',
        \ 'rooms':[{'id':'unread','title':'Same title','type':'group','unread':v:true,'unreadActivity':at},
        \          {'id':'read','title':'Same title','type':'group','unread':v:false,'unreadActivity':at},
        \          {'id':'unknown','title':'UNREAD READ ● cached','type':'group'}],
        \ 'room':{'id':'read','title':'Same title','type':'group','unread':v:false},'messages':[]}
  let g:provenance_running = 1
  call call(function('<SNR>' . sid . '_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':[]}}])
  let s:spaces = wbx#buffers().rooms
  let s:spaces_window = win_findbuf(s:spaces)[0]
  botright 5new | file independent-provenance-work.txt
  let work = win_getid()
  call setline(1,'Unsent independent work') | call feedkeys("i\<Esc>",'xt')
  let native = [getline(1,'$'),undotree(),b:changedtick]
  call s:inspect('unread','UNREAD.*fresh at capture','none','unread','fresh-unread')
  call s:inspect('read','READ.*fresh at capture','none','not emphasized','fresh-read')
  call s:inspect('unknown','UNKNOWN','none','unknown','unknown-is-not-read')
  let g:provenance_injected = 0
  let s:state.rooms[2].title = 'Unknown | let g:provenance_injected=1 ' . nr2char(27) . nr2char(0x202e)
  call s:publish()
  call s:inspect('unknown','UNKNOWN','none','unknown','sanitized-title-is-not-state-or-Ex')
  call assert_equal(0,g:provenance_injected)
  call assert_equal('read',wbx#state().room.id,'browsing unread/unknown never changes the open destination')

  let s:state.rooms[0].unreadStale = v:true
  let s:state.rooms[1].unreadStale = v:true
  call s:publish()
  call s:inspect('unread','UNREAD.*stale','none','unread','stale-unread')
  call s:inspect('read','READ.*stale','none','not emphasized','stale-read')
  call remove(s:state.rooms[0],'unreadStale') | call remove(s:state.rooms[1],'unreadStale')
  for health in ['failed','connecting','off']
    let s:state.readStatus = health | call s:publish()
    call s:inspect('unread','UNREAD.*stale','none','unread',health . '-retains-historical-unread')
    call s:inspect('unknown','UNKNOWN','none','unknown',health . '-cannot-infer-read')
  endfor
  let s:state.readStatus = 'ready' | call s:publish()

  " Seed the real display model with a prior open; inspection itself never opens.
  let seed = deepcopy(s:state) | let seed.room = deepcopy(seed.rooms[0])
  let seed.messages = [{'id':'old','author':'Author','created':at,'text':'Seeded prior local display'}]
  call wbx#unread#open(seed) | call wbx#redraw()
  call s:inspect('unread','UNREAD.*fresh at capture','read.*session-only','not emphasized','local-read-is-not-server-read')
  call assert_true(wbx#state().rooms[0].unread)
  let seed.room = deepcopy(seed.rooms[2])
  call wbx#unread#open(seed) | call wbx#redraw()
  call s:inspect('unknown','UNKNOWN','read.*session-only','not emphasized','local-read-cannot-confirm-unknown-server')
  let s:state.rooms[0].unread = v:false | call s:publish()
  call wbx#unread#reset()
  let seed = deepcopy(s:state) | let seed.room = deepcopy(seed.rooms[0])
  let seed.messages = [{'id':'old','author':'Author','created':at,'text':'Seeded prior local display'}]
  call wbx#unread#open(seed)
  call add(seed.messages,{'id':'new','author':'Author','created':'2026-11-17T12:01:00.000Z','text':'New local activity ahead of server observation'})
  call wbx#unread#observe(seed) | call wbx#redraw()
  call s:inspect('unread','READ.*fresh at capture','unread.*session-only','unread','local-unread-can-lead-server-read')

  " Pure detached selectors and snapshots never become receipt/action authority.
  call s:row('unread')
  let context = wbx#room_unread_context()
  let context.room.unread = v:true | let context.room.id = 'forged'
  call assert_equal(v:false,wbx#state().rooms[0].unread)
  call assert_equal('unread',wbx#room_unread_context().room.id)
  let before = s:source() | let requests = len(g:provenance_requests)
  let b:wbx_room_ids[line('.')-1] = 'read'
  WebexUnreadStatus
  call assert_equal(s:spaces,bufnr('%'),'inconsistent row identity is not reinterpreted through a title')
  call assert_equal(requests,len(g:provenance_requests))
  let b:wbx_room_ids[line('.')-1] = 'unread'
  call cursor(1,1)
  WebexUnreadStatus
  call assert_equal(s:spaces,bufnr('%'),'header is not a room and never falls back to the open destination')
  call add(s:checks,'detached selector / forged row / header have no action authority')
  let section = repeat('a',24)
  let s:state.sections = {'revision':1,'persistence':'session',
        \ 'items':[{'id':section,'name':'Local group','collapsed':v:false,'rooms':['unread','unknown']}]}
  call s:publish()
  call s:inspect('unread','READ.*fresh at capture','unread.*session-only','unread','grouped-row-identity-is-not-title')
  call s:row('unread')
  call cursor(index(b:wbx_row_ids,json_encode(['section',section]))+1,1)
  WebexUnreadStatus
  call assert_equal(s:spaces,bufnr('%'),'section headings are not room targets')
  call cursor(line('$'),1)
  WebexUnreadStatus
  call assert_equal(s:spaces,bufnr('%'),'footer is not a room target')
  call add(s:checks,'grouped section/footer rows never fall back to selected space')

  call wbx#unread#reset()
  call s:row('unknown')
  WebexUnreadStatus
  let snapshot = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  let s:state.rooms[2].unread = v:true | call s:publish()
  call assert_equal(snapshot,[win_getid(),bufnr('%'),getline(1,'$'),undotree()],'accepted updates never auto-repaint or focus an open snapshot')
  call wbx#lists#close()
  call s:inspect('unknown','UNREAD.*fresh at capture','none','unread','explicit-reopen-refreshes-local-snapshot')

  " Cached metadata can retain only historical flags, never freshness/membership.
  let s:state.room = v:null | let s:state.ready = v:false
  for room in s:state.rooms | let room.cached = v:true | let room.unreadStale = v:true | endfor
  let s:state.spacesCache = {'state':'stale','verified':v:false,'observedAt':1}
  call s:publish()
  call s:inspect('unread','READ.*stale','none','not emphasized','cached-read-is-historical')
  call s:inspect('unknown','UNREAD.*stale','none','unread','cached-unread-is-historical')
  let g:provenance_running = 0
  call wbx#_exit(0)
  call s:inspect('unknown','UNREAD.*stale','none','unread','disconnected-retained-row-does-not-reconnect')

  " Exact origins are window-local; annotations/promotions remain ordinary work.
  call s:row('unknown')
  execute 'tab sbuffer ' . s:spaces
  let original_spaces_window = s:spaces_window | let s:spaces_window = win_getid()
  call s:inspect('unread','READ.*stale','none','not emphasized','independent-tab-origin-return')
  tabclose
  let s:spaces_window = original_spaces_window
  call s:row('unread')
  let g:wbx_tui.mappings = 0
  WebexUnreadStatus
  call assert_equal('',maparg('q','n'),'mapping opt-out is retained')
  let g:wbx_tui.mappings = 1 | call wbx#lists#setup()
  setlocal modifiable
  call append(line('$'),'Native annotation in summary')
  let annotated_buffer = bufnr('%') | let annotation = [getline(1,'$'),undotree()]
  call win_gotoid(s:spaces_window)
  let focus = win_getid()
  WebexUnreadStatus
  call assert_equal(focus,win_getid(),'annotations prevent regeneration without focus theft')
  call assert_equal(annotation[0],getbufline(annotated_buffer,1,'$'))
  call win_gotoid(win_findbuf(annotated_buffer)[0]) | setlocal buftype=
  let promoted = [bufnr('%'),getline(1,'$'),undotree(),&buftype]
  WebexUnreadStatus
  call assert_equal(promoted,[bufnr('%'),getline(1,'$'),undotree(),&buftype])
  call s:row('unread')
  setlocal modifiable
  call append(line('$'),'Spaces annotation')
  let annotated = s:source()
  WebexUnreadStatus
  call assert_equal(annotated,s:source(),'edited Spaces rows cannot be inspected through stale metadata')
  setlocal buftype=
  WebexUnreadStatus
  call assert_equal('',&buftype)
  call win_gotoid(work)
  call assert_equal(native,[getline(1,'$'),undotree(),b:changedtick],'all inspection paths preserve unrelated text/full undo')
  call assert_equal([],g:provenance_requests,'the complete fixture issues zero select/fetch/read/send RPCs')
  call assert_equal(0,g:provenance_starts)
  call add(s:checks,'independent native text/full undo, mapping opt-outs and annotated/promoted views remain protected')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
let g:provenance_running = 0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'requests':g:provenance_requests,'backendStarts':g:provenance_starts})],$WBX_EDITOR_RESULT)
qa!
