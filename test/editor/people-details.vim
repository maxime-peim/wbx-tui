" Real coordinator + native lists + passive presence; only transport is inert.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:details_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:details_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','let g:details_starts+=1','throw "Unexpected backend start"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:details_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:details_running=0 | let g:details_requests=[] | let g:details_starts=0
let g:people_injected=0
let g:wbx_tui={'backend':['/bin/false'],'images':0,'notifications':0,'read_status':0,'spaces_cache':0,
      \ 'upcoming_meetings':0,'persist_drafts':0,'folds':0,'mark_read_on_open':1}
runtime plugin/wbx.vim
filetype plugin on
syntax off
set t_Co=0
let s:checks=[] | let s:drawn=[]
function! s:native() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),getcurpos(),winsaveview(),&breakat]
endfunction
function! s:text() abort
  return join(getline(1,'$'),"\n")
endfunction
function! s:publish() abort
  let s:state.revision=wbx#state().revision+1
  if !wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':s:state}) | throw 'Invalid People fixture state' | endif
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':deepcopy(s:state)})
endfunction
function! s:reply(request, value) abort
  call wbx#_receive({'jsonrpc':'2.0','id':a:request.id,'result':deepcopy(a:value)})
endfunction
function! s:overlays() abort
  return has('nvim') ? filter(nvim_list_wins(),'!empty(nvim_win_get_config(v:val).relative)') : popup_list()
endfunction
function! s:draw(case, expected) abort
  if $WBX_EDITOR_SCREEN!=# '1' | return | endif
  call cursor(search('^\%(Presence\|Updating presence\)','nw'),1)
  normal! zt
  redraw!
  let info=getwininfo(win_getid())[0]
  let row=screenpos(win_getid(),line('.'),1).row
  call assert_true(row>0)
  let text=join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
  call assert_match(a:expected,text,a:case.': presence is actual native text with syntax off')
  call add(s:drawn,{'case':a:case,'text':trim(text),'width':info.width})
endfunction
function! s:show(expected, case) abort
  call feedkeys("\<Esc>",'xt')
  let origin=s:native() | let requests=len(g:details_requests)
  WebexPeople
  call assert_equal('wbx://people-details',bufname('%'))
  if bufname('%')!=# 'wbx://people-details' | throw 'People details must be a navigable native buffer, not a popup or echo' | endif
  call assert_true(wbx#lists#clean(bufnr('%'),'people-details'))
  call assert_equal('nofile',&buftype) | call assert_false(&modifiable)
  call assert_match(a:expected,s:text())
  call assert_equal([],s:overlays(),'People inspection/updates never create an overlay')
  call assert_equal('',maparg('<CR>','n'))
  call feedkeys("\<CR>",'xt')
  silent! write
  WebexMarkRead
  call assert_equal(requests,len(g:details_requests),'inspection, Enter/write and a summary are never provider/receipt authority')
  call s:draw(a:case,a:expected)
  call wbx#lists#close()
  call assert_equal(origin,s:native(),'q returns to exact native origin, retaining text/full undo/view/options')
  call add(s:checks,a:case)
endfunction
try
  let s:value={'capability':'ready','state':'fresh','presence':'active','customStatus':'unsupported',
        \ 'roomId':'A','observedAt':localtime()*1000,'displayName':'100% literal | let g:people_injected=1',
        \ 'lastActivity':'2026-11-17T12:00:00.000Z'}
  call assert_true(wbx#protocol#people(s:value))
  for patch in [{'token':'private'},{'personId':'peer'},{'presence':'offline'},{'customStatus':'CUSTOM'},
        \ {'observedAt':'123'},{'displayName':"unsafe\nname"},{'displayName':nr2char(0x202e).'unsafe'},
        \ {'displayName':nr2char(0x9b).'unsafe'},{'capability':[]},{'requiredScope':{}},
        \ {'lastActivity':'2026-02-30T00:00:00.000Z'},{'state':'unavailable'}]
    call assert_false(wbx#protocol#people(extend(copy(s:value),patch)),'closed safe People data contract remains enforced')
  endfor
  call setline(1,['Independent unsent text','Second native line'])
  call feedkeys("i\<Esc>",'xt')
  call s:show('Presence off','cold-offline-inspection-is-local')
  call assert_equal(0,g:details_starts)
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>'.sid.'_layout'),[])
  let s:room={'id':'A','type':'direct','title':'Selected peer A'}
  let s:state={'revision':1,'state':'ready','mode':'live','ready':v:true,'sending':v:false,
        \ 'rooms':[s:room,{'id':'B','type':'direct','title':'Peer B'}],'room':s:room,
        \ 'messages':[{'id':'message','author':'Author','text':'Full native history endpoint','created':'2026-11-17T12:00:00Z'}],
        \ 'historyLatest':v:true,'peopleStatus':deepcopy(s:value),
        \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
  let g:details_running=1
  call call(function('<SNR>'.sid.'_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','people-status','local-context-v1']}}])
  let s:history=wbx#buffers().history | let s:history_window=win_findbuf(s:history)[0]
  call assert_match('Presence Active',join(getbufline(s:history,1,'$'),"\n"),'passive status stays automatically visible without an inspection command')
  call assert_equal('WbxPresenceActive',wbx#people#badge(s:room).group)
  call assert_equal(1,len(s:overlays()),'selected-DM summary is automatically visible as a compact float')
  botright 6new | file independent-people-work.txt
  let s:work=win_getid()
  call setline(1,['Unsent native work','Retain the complete undo tree'])
  call feedkeys("i\<Esc>",'xt')
  call append(1,'Unsynced background publication')
  let native=s:native()
  let s:state.peopleStatus.presence='meeting' | call s:publish()
  call assert_equal(native,s:native(),'passive updates preserve unrelated unsynced full undo/focus')
  call assert_match('In a meeting',join(getbufline(s:history,1,'$'),"\n"))
  call assert_equal('📹',trim(wbx#people#badge(s:room).cue),'meeting presence uses a video-camera glyph, not a calendar')
  call assert_notmatch('Camera on\|camera enabled',join(getbufline(s:history,1,'$'),"\n"),'generic meeting presence is not camera-state evidence')
  call assert_equal(0,len(g:details_requests),'default passive presentation emits no extra lookup')
  call s:show('Presence In a meeting','fresh-selected-peer')
  call assert_equal(0,g:people_injected)
  let s:state.peopleStatus.state='stale' | call s:publish()
  call s:show('Presence STALE','stale-state-is-text')
  let s:state.peopleStatus={'capability':'ready','state':'unknown','presence':'unknown',
        \ 'customStatus':'unsupported','roomId':'A','reason':'not-shared'}
  call s:publish() | call s:show('Presence unknown\c','undisclosed-is-not-offline')
  let s:state.peopleStatus={'capability':'ready','state':'loading','presence':'unknown','customStatus':'unsupported','roomId':'A'}
  call s:publish() | call s:show('Updating presence','loading-snapshot-does-not-fetch')
  let s:state.peopleStatus={'capability':'scope-required','state':'unavailable','presence':'unknown',
        \ 'customStatus':'unsupported','roomId':'A','requiredScope':'spark:people_read'}
  call s:publish() | call s:show('Presence unavailable','missing-grant-is-not-probed')
  let requests=len(g:details_requests)
  WebexPeopleRefresh
  call assert_equal(requests,len(g:details_requests),'known missing grant is refused locally')
  let s:state.peopleStatus=deepcopy(s:value)
  let s:state.peopleStatus.displayName=repeat('界',100).' | literal %'
  call s:publish()
  let g:wbx_tui.people_status=0 | call wbx#redraw()
  call s:show('Presence off','explicit-opt-out-masks-cached-people-data')
  WebexPeople
  call assert_notmatch('Person:\|Last Webex activity:\|Observed locally:',s:text(),'opt-out cannot disclose retained People fields')
  WebexPeopleRefresh
  call assert_equal(requests,len(g:details_requests),'opt-out blocks explicit refresh too')
  call assert_equal({},wbx#people#badge(s:room))
  call assert_notmatch('Presence Active',join(getbufline(s:history,1,'$'),"\n"))
  call wbx#lists#close()
  let g:wbx_tui.people_status=1 | call wbx#redraw()
  WebexPeople
  call assert_match(s:state.peopleStatus.displayName,s:text(),'full Unicode name is not popup-truncated')
  call search('^Person:','w')
  normal! $
  call assert_true(col('.')>100,'native motions reach the complete field')
  call assert_equal(requests,len(g:details_requests),'native navigation and search remain local')
  let snapshot=[win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick]
  WebexPeopleRefresh
  call assert_equal(requests+1,len(g:details_requests))
  let pending=g:details_requests[-1]
  call assert_equal('people.lookup',pending.method)
  call assert_equal({},pending.params,'the selected-DM owner chooses the provider target, never snapshot fields')
  let s:state.peopleStatus.presence='inactive' | call s:publish()
  call s:reply(pending,s:state.peopleStatus)
  call assert_equal(snapshot,[win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick],'state and refresh callbacks never repaint/focus the inspection snapshot')
  call feedkeys('r','xt')
  call assert_match('Presence Inactive',s:text(),'r only refreshes the local published snapshot')
  call assert_equal(requests+1,len(g:details_requests))
  WebexPeopleRefresh
  let pending=g:details_requests[-1]
  call wbx#lists#close()
  let origin=s:native()
  call s:reply(pending,s:state.peopleStatus)
  call assert_equal(origin,s:native(),'late refresh response cannot reopen a dismissed snapshot')
  call assert_equal([],s:overlays())
  call add(s:checks,'explicit-refresh-is-separate-and-callbacks-are-inert')

  WebexPeople
  WebexPeopleRefresh
  let old_peer=g:details_requests[-1]
  let snapshot=[bufnr('%'),getline(1,'$'),undotree(),b:changedtick]
  let s:state.room=deepcopy(s:state.rooms[1])
  let s:state.peopleStatus.roomId='B' | let s:state.peopleStatus.displayName='Selected peer B'
  call s:publish()
  let requests=len(g:details_requests)
  call s:reply(old_peer,s:value)
  WebexPeopleRefresh
  call assert_equal(requests,len(g:details_requests),'an A snapshot never refreshes a different selected peer B')
  call assert_equal(snapshot,[bufnr('%'),getline(1,'$'),undotree(),b:changedtick])
  call wbx#lists#close()
  call s:show('Presence Inactive','reopening-inspects-current-selected-peer')
  let saved=win_getid()
  tabnew
  call setline(1,'Independent other-tab native work') | call feedkeys("i\<Esc>",'xt')
  let other=s:native()
  WebexPeople
  call assert_equal(other[0],get(w:,'wbx_list_origin',{}).window)
  call wbx#lists#close()
  call assert_equal(other,s:native(),'inspection returns to exact other-tab origin without tab theft')
  tabclose
  call assert_equal(saved,win_getid())
  call add(s:checks,'window-local-returns-are-independent-across-tabs')

  WebexPeople
  WebexPeopleRefresh
  let pending=g:details_requests[-1]
  let snapshot=s:native()
  let g:details_running=0
  call wbx#_exit(0)
  call assert_equal(snapshot,s:native(),'disconnect cannot close or rewrite a readable snapshot')
  let requests=len(g:details_requests)
  WebexPeopleRefresh
  call s:reply(pending,s:value)
  call assert_equal(requests,len(g:details_requests),'disconnect and late reply cannot restart or look up a peer')
  call assert_equal(snapshot,s:native())
  call wbx#lists#close()
  call s:show('not connected','disconnected-snapshot-is-local-and-masked')
  let g:details_running=1
  call call(function('<SNR>'.sid.'_hello'),[{'result':{'version':1,'state':deepcopy(s:state),
        \ 'meeting':{'active':v:false,'ready':v:false},'capabilities':['messaging','people-status','local-context-v1']}}])
  call add(s:checks,'disconnect-and-late-provider-response-preserve-native-snapshot')

  let g:wbx_tui.mappings=0
  WebexPeople
  call assert_equal('',maparg('r','n')) | call assert_equal('',maparg('q','n'))
  let g:wbx_tui.mappings=1 | call wbx#lists#setup()
  nnoremap <buffer> r :let g:people_local_map=1<CR>
  call wbx#lists#setup()
  call assert_match('people_local_map',maparg('r','n'),'mapping conflicts remain user-owned')
  silent! nunmap <buffer> r
  call wbx#lists#setup()
  setlocal modifiable
  call append(line('$'),'My retained People annotation')
  setlocal nomodified
  let annotation=[bufnr('%'),getline(1,'$'),undotree(),b:changedtick]
  call s:publish()
  WebexPeople
  WebexPeopleRefresh
  call wbx#lists#close()
  call assert_equal(annotation,[bufnr('%'),getline(1,'$'),undotree(),b:changedtick],'annotated views/full undo cannot be repainted, refreshed or closed')
  setlocal buftype=
  let promoted=[bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&buftype]
  WebexPeople
  WebexPeopleRefresh
  call assert_equal(promoted,[bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&buftype])
  call assert_equal('',maparg('r','n'))
  call assert_equal(requests,len(g:details_requests),'annotations/promotions never trigger a provider request')
  call add(s:checks,'mapping-opt-outs-conflicts-annotations-and-promotions-retained')
  call assert_equal(0,g:details_starts)
  call assert_equal(0,g:people_injected)
  for request in g:details_requests
    call assert_equal('people.lookup',request.method,'only deliberate explicit presence refreshes are admitted')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
let g:details_running=0
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'requests':map(copy(g:details_requests),'v:val.method'),'backendStarts':g:details_starts})],$WBX_EDITOR_RESULT)
qa!
