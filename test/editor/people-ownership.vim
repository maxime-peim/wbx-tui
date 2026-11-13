" Native People ownership matrix; real lists/people, inert state and held RPC.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=50 columns=120
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload','p')
call writefile(['function! wbx#state() abort','return deepcopy(g:people_state)','endfunction',
      \ 'function! wbx#supports(capability) abort','return 1','endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:people_requests,{"method":a:method,"params":deepcopy(a:params),"Callback":a:Callback})',
      \ 'return len(g:people_requests)','endfunction',
      \ 'function! wbx#_protocol_error() abort','throw "Unexpected invalid People response"','endfunction'],s:stub.'/autoload/wbx.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:people_requests=[] | let s:checks=[] | let s:drawn=[]
let s:room={'id':'peer','type':'direct','title':'Literal peer'}
let s:value={'capability':'ready','state':'fresh','presence':'active','customStatus':'unsupported',
      \ 'roomId':'peer','observedAt':localtime()*1000,'displayName':repeat('界',100).' % literal'}
let g:people_state={'revision':1,'state':'ready','ready':v:true,'mode':'live','room':s:room,'rooms':[s:room],
      \ 'messages':[],'peopleStatus':deepcopy(s:value),'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
command! WebexPeople call wbx#people#show()
command! WebexPeopleRefresh call wbx#people#refresh()
nnoremap <silent> Wp :WebexPeople<CR>
function! s:content() abort
  return [win_getid(),bufnr('%'),getline(1,'$'),undotree(),b:changedtick,bufname('%'),&buftype]
endfunction
function! s:update() abort
  let before=s:content()
  doautocmd User WbxState
  call assert_equal(before,s:content(),'passive publication cannot replace/focus native People text')
endfunction
function! s:release_name() abort
  " :file leaves a synthetic unloaded alternate-name placeholder. The list
  " helper correctly refuses that foreign buffer; explicitly release only this
  " fixture-created placeholder before requesting a separate generated view.
  let placeholder=bufnr('^wbx://people-details$')
  if placeholder<=0 | return | endif
  call assert_false(bufloaded(placeholder))
  call assert_equal('',getbufvar(placeholder,'wbx_list_kind',''))
  execute 'bwipeout '.placeholder
endfunction
try
  call setline(1,['Independent private draft','Second native line'])
  call feedkeys("i\<Esc>",'xt')
  let work=s:content() | let preserved=[]
  let mismatch=deepcopy(g:people_state) | let mismatch.peopleStatus.roomId='different'
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':mismatch}))
  for kind in ['edit','rename','type']
    for path in ['state','disconnect','reply','command']
      let g:people_state.state='ready' | let g:people_state.ready=v:true
      let g:people_state.peopleStatus=deepcopy(s:value)
      call feedkeys('Wp','xt')
      call assert_true(wbx#lists#clean(bufnr('%'),'people-details'))
      let owned=win_getid() | let buffer=bufnr('%')
      let reads=len(g:people_requests)
      WebexPeopleRefresh
      call assert_equal(reads+1,len(g:people_requests))
      let Pending=g:people_requests[-1].Callback
      if kind==# 'edit'
        setlocal modifiable
        call append(line('$'),'Retained annotation: '.path)
        setlocal nomodifiable nomodified
      elseif kind==# 'rename'
        execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.'.kind.'.'.path)
        call s:release_name()
      else
        setlocal buftype=
      endif
      " A deliberate native command starts at a normal-mode input boundary.
      " Passive unsynced-undo preservation is tested separately in people-details.
      if path==# 'command' | call feedkeys("\<Esc>",'xt') | endif
      let saved=s:content()
      if path==# 'state'
        let g:people_state.peopleStatus.presence='meeting'
        call s:update()
      elseif path==# 'disconnect'
        let g:people_state.state='idle' | let g:people_state.ready=v:false
        doautocmd User WbxDisconnected
        let reads=len(g:people_requests)
        WebexPeopleRefresh
        call assert_equal(reads,len(g:people_requests),'disconnect refuses refresh locally')
        let g:people_state.state='ready' | let g:people_state.ready=v:true
      elseif path==# 'reply'
        call call(Pending,[{'result':g:people_state.peopleStatus}])
      else
        WebexPeopleRefresh
        call assert_equal(reads+1,len(g:people_requests),'edited/renamed/type-promoted snapshot refuses explicit refresh')
        WebexPeople
        if kind==# 'rename'
          call assert_notequal(buffer,bufnr('%'),'an explicit command may create a new snapshot, never reclaim a renamed copy')
          call wbx#lists#close()
        endif
      endif
      call call(Pending,[{'result':g:people_state.peopleStatus}])
      call s:update()
      call assert_equal(saved,s:content(),kind.'/'.path.': preserve window, text/full undo, tick, name and type')
      call wbx#lists#close()
      call assert_equal(saved,s:content(),'q never closes a user-owned copy')
      if kind!=# 'rename'
        " Release the canonical name explicitly, without deleting the user copy.
        execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.retained.'.kind.'.'.path)
        call s:release_name()
      endif
      call add(preserved,{'buffer':buffer,'lines':getline(1,'$'),'tick':b:changedtick,'name':bufname('%'),'type':&buftype,
            \ 'visible':path==# 'state'})
      call wbx#lists#setup()
      call assert_equal('',maparg('r','n')) | call assert_equal('',maparg('q','n'))
      " Keep one visible copy per promotion kind throughout the matrix. Close
      " the other windows explicitly as the user, retaining every hidden buffer.
      if path!=# 'state' | close | endif
      call win_gotoid(work[0])
      call assert_equal(work,s:content(),'full independent draft remains untouched through every ownership boundary')
      wincmd =
      call add(s:checks,kind.'/'.path)
    endfor
  endfor
  WebexPeople
  let details=bufnr('%')
  WebexPeopleRefresh
  let Pending=g:people_requests[-1].Callback
  close
  call assert_equal(work,s:content())
  call call(Pending,[{'result':s:value}])
  call s:update()
  call assert_equal([],win_findbuf(details),'external close plus a late response cannot reopen details')
  WebexPeople
  let saved=s:content()
  call call(Pending,[{'result':s:value}])
  call assert_equal(saved,s:content(),'old response cannot replace an explicitly reopened snapshot')
  let g:people_state.localContext.sessionId=repeat('b',32)
  call s:update()
  let reads=len(g:people_requests)
  WebexPeopleRefresh
  call assert_equal(reads,len(g:people_requests),'a clean old-session snapshot cannot refresh the new session')
  WebexPeople
  WebexPeopleRefresh
  call assert_equal(reads+1,len(g:people_requests),'explicit local regeneration revalidates snapshot context')
  call wbx#lists#close()
  call add(s:checks,'external-close-late-response-reopen-and-session-replacement')

  let g:people_state.peopleStatus.roomId='wrong'
  WebexPeople
  call assert_notmatch('Person:',join(getline(1,'$'),"\n"),'mismatched peer fields are masked even with a stub state')
  WebexPeopleRefresh
  call assert_equal(reads+1,len(g:people_requests),'mismatched provider association cannot authorize lookup')
  call wbx#lists#close()
  let g:people_state.peopleStatus=deepcopy(s:value)
  let g:people_state.room={'id':'group','type':'group','title':'Not a person'}
  WebexPeople
  call assert_notmatch('Person:',join(getline(1,'$'),"\n"),'group inspection never carries a previous peer name')
  WebexPeopleRefresh
  call assert_equal(reads+1,len(g:people_requests))
  call wbx#lists#close()
  let g:people_state.room=s:room
  vertical new
  vertical resize 24
  WebexPeople
  let before=getline(1,'$') | let tick=b:changedtick
  vertical resize 24
  resize 4
  setlocal wrap linebreak
  call search('^Person:','w')
  normal! $
  call assert_true(col('.')>300,'narrow views retain the full Unicode field, not an ellipsis fallback')
  call search('^Presence','w')
  normal! zt
  redraw!
  if $WBX_EDITOR_SCREEN==# '1'
    let row=screenpos(win_getid(),line('.'),1).row
    let info=getwininfo(win_getid())[0]
    let text=join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
    call assert_match('Presence Active',text)
    call add(s:drawn,{'width':info.width,'text':trim(text)})
  endif
  call assert_equal(before,getline(1,'$'),'native resizing/reflow changes no generated text')
  call assert_equal(tick,b:changedtick)
  call assert_match('s old at display',join(before,' '),'age is explicit, never a live indicator')
  call wbx#lists#close()
  close
  call win_gotoid(work[0])
  call add(s:checks,'mismatch-group-and-narrow-unicode-native-view')
  for copy in preserved
    call assert_equal(copy.lines,getbufline(copy.buffer,1,'$'))
    call assert_equal(copy.tick,getbufvar(copy.buffer,'changedtick'))
    call assert_equal(copy.name,bufname(copy.buffer))
    call assert_equal(copy.type,getbufvar(copy.buffer,'&buftype'))
    if copy.visible | call assert_false(empty(win_findbuf(copy.buffer)),'released user windows remain visible unless explicitly closed by the fixture') | endif
  endfor
  call assert_equal(work,s:content())
  for request in g:people_requests
    call assert_equal('people.lookup',request.method)
    call assert_equal({},request.params,'snapshot metadata never becomes a provider target')
  endfor
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'requests':len(g:people_requests)})],$WBX_EDITOR_RESULT)
qa!
