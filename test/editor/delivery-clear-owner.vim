" Exact local-clear policy with inert state/write faults and real native view/draft primitives.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui={'persist_drafts':0}
let s:state={'state':'ready','localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
let s:checks=[] | let s:drawn=[] | let s:events=[] | let s:notices=[]
let s:writes=0 | let s:blocked=0 | let s:mode=''
let s:textlock_seen=0
function! s:state() abort
  return s:state
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:render() abort
  call add(s:events,'render')
endfunction
function! s:write(buffer, lines) abort
  let s:writes+=1
  call assert_true(wbx#drafts#is_sent(a:buffer),'confirmed-sent marker precedes every attempted local write')
  call assert_equal([''],a:lines)
  if s:mode==# 'custom' | throw 'Synthetic non-editor write error' | endif
  if s:blocked>0
    let s:blocked-=1
    if s:mode==# 'vim' | let error=g:nonexistent_delivery_clear_fixture_variable | endif
    return s:mode==# 'lie' ? 1 : 0
  endif
  return wbx#view#write(a:buffer,a:lines,function('s:notify'))
endfunction
function! s:timers() abort
  return filter(timer_info(),'string(v:val.callback) =~# "wbx#delivery_clear#clear"')
endfunction
function! s:drain() abort
  let start=reltime()
  while !empty(s:timers()) && reltimefloat(reltime(start))<1 | sleep 5m | endwhile
  call assert_equal([],s:timers(),'bounded local retry settlement')
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
function! s:fresh() abort
  call s:drain()
  execute 'buffer '.s:composer
  execute 'file wbx://compose/A'
  setlocal buftype=nofile
  let b:wbx_kind='compose' | let b:wbx_room='A' | let b:wbx_parent='' | let b:wbx_format='plain'
  let b:wbx_quote_sources=[{'synthetic':'retained source proof'}] | let b:wbx_confirmed_sent={}
  let b:wbx_staged_upload={}
  call wbx#drafts#reply('A','')
  let s:state={'state':'ready','localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
  call setline(1,'Exact acknowledged native text') | call feedkeys("i\<Esc>",'xt')
  let s:writes=0 | let s:blocked=0 | let s:mode='' | let s:events=[] | let s:notices=[]
  return {'bufnr':bufnr('%'),'tick':b:changedtick,'roomId':'A','text':join(getline(1,'$'),"\n")}
endfunction
function! s:clear(pending, ...) abort
  call wbx#delivery_clear#clear(s:owner,a:pending,repeat('a',32),a:0 ? a:1 : 3)
endfunction
function! ClearOwnerExpression() abort
  call s:clear(s:expression_pending)
  let s:textlock_seen=getline(1)==# s:expression_pending.text && wbx#drafts#is_sent(bufnr('%')) && !empty(s:timers())
  return ''
endfunction
try
  enew | file clear-owner-independent.txt | call setline(1,'Independent native foreground')
  split
  let s:composer=wbx#workspace#buffer('wbx://compose/A','compose','A')
  execute 'buffer '.s:composer
  let cpo=&cpoptions
  let s:owner=wbx#delivery_clear#new({'State':function('s:state'),'Write':function('s:write'),
        \ 'Render':function('s:render'),'Notify':function('s:notify')})
  call assert_equal(cpo,&cpoptions) | call assert_equal(['ports'],keys(s:owner))
  let pending=s:fresh()
  call s:clear(pending)
  call assert_equal([''],getline(1,'$')) | call assert_equal([],b:wbx_quote_sources)
  call assert_equal(1,s:writes) | call assert_equal([],s:events,'initial success leaves redraw ordering to delivery caller')
  call assert_equal([],s:timers())
  call add(s:checks,'ordinary exact successful clear marks before write, removes quote proof and does not invent an initial redraw or timer')

  for kind in ['immediate','deferred','attachment']
    let pending=s:fresh()
    let pending.parentId='root' | let b:wbx_parent='root'
    execute 'file '.fnameescape(wbx#view#compose_name('A','root'))
    call wbx#drafts#reply('A','root')
    let s:blocked=kind==# 'deferred'
    if kind==# 'attachment'
      let pending.attachmentId=repeat('a',32) | let pending.draftId='reply-file'
      let b:wbx_staged_upload={'attachmentId':pending.attachmentId}
    endif
    call s:clear(pending)
    if kind==# 'deferred' | call assert_equal('root',wbx#drafts#reply('A')) | endif
    call s:drain()
    call assert_equal('',wbx#drafts#reply('A'),'only a successful local clear releases the matching reply target, including deferred clear')
  endfor
  call add(s:checks,'immediate, deferred and attachment reply clears reset the matching room thread without any focus action')

  for mode in ['', 'vim']
    let pending=s:fresh() | let s:blocked=1 | let s:mode=mode
    call s:clear(pending)
    call assert_equal('Exact acknowledged native text',getline(1)) | call assert_true(wbx#drafts#is_sent(bufnr('%')))
    call s:drain()
    call assert_equal(2,s:writes) | call assert_equal([''],getline(1,'$'))
    call assert_equal(['render'],s:events) | call assert_equal([],s:notices)
  endfor
  call add(s:checks,'transient refusal and native Vim exception recover through real 10ms local timers, with one redraw only on deferred success')

  let s:expression_pending=s:fresh()
  inoremap <silent><buffer><expr> <F6> ClearOwnerExpression()
  call feedkeys("A\<F6>\<Esc>",'xt')
  iunmap <buffer> <F6>
  call s:drain()
  call assert_true(s:textlock_seen,'real expression-mapping textlock blocks the original native write')
  call assert_equal(2,s:writes) | call assert_equal([''],getline(1,'$'))
  call assert_equal(['render'],s:events)
  call add(s:checks,'real native expression-mapping textlock defers local clearing until release, independent of unrelated application rendering')

  for guard in ['session','state','room','parent','format','revision','text','promotion','name','attachment','stale']
    let pending=s:fresh()
    if guard==# 'session' | let s:state.localContext.sessionId=repeat('b',32) | endif
    if guard==# 'state' | let s:state.state='failed' | endif
    if guard==# 'room' | let b:wbx_room='B' | endif
    if guard==# 'parent' | let b:wbx_parent='root' | endif
    if guard==# 'format' | let b:wbx_format='markdown' | endif
    if guard==# 'revision' | call setline(1,getline(1)) | endif
    if guard==# 'text' | let pending.text='Different acknowledged text at the same native revision' | endif
    if guard==# 'promotion' | setlocal buftype= | endif
    if guard==# 'name' | file clear-owner-promoted.txt | endif
    if guard==# 'attachment' | let b:wbx_staged_upload={'attachmentId':repeat('b',32)} | endif
    if guard==# 'stale' | let b:wbx_staged_upload={'stale':1} | endif
    let before=s:native() | let proof=deepcopy(b:wbx_quote_sources)
    call s:clear(pending)
    call assert_equal(0,s:writes,guard) | call assert_equal(before,s:native(),guard)
    call assert_equal(proof,b:wbx_quote_sources,guard) | call assert_equal({},b:wbx_confirmed_sent,guard)
    call assert_equal([],s:timers(),guard)
  endfor
  call add(s:checks,'independent session/readiness/ownership/room/parent/format/revision/text/attachment/staleness guards refuse before marking or writing')

  for guard in ['session','state','text','format','parent','attachment']
    let pending=s:fresh() | let s:blocked=1
    call s:clear(pending)
    if guard==# 'session' | let s:state=deepcopy(s:state) | let s:state.localContext.sessionId=repeat('b',32) | endif
    if guard==# 'state' | let s:state.state='idle' | endif
    if guard==# 'text' | call setline(1,'New native edit before deferred clear') | endif
    if guard==# 'format' | let b:wbx_format='markdown' | endif
    if guard==# 'parent' | let b:wbx_parent='new-root' | endif
    if guard==# 'attachment' | let b:wbx_staged_upload={'attachmentId':repeat('c',32)} | endif
    let before=s:native()
    call s:drain()
    call assert_equal(1,s:writes,guard) | call assert_equal(before,s:native(),guard)
    call assert_equal([],s:events,guard) | call assert_equal([],s:notices,guard)
  endfor
  call add(s:checks,'every deferred attempt rechecks current state and exact native evidence; changed session/new work silently wins without local write or redraw')

  for mode in ['', 'lie']
    let pending=s:fresh() | let s:blocked=99 | let s:mode=mode | let before=s:native()
    call s:clear(pending) | call s:drain()
    call assert_equal(4,s:writes,'original immediate + three deferred attempt budget')
    call assert_equal(before,s:native()) | call assert_true(wbx#drafts#is_sent(bufnr('%')))
    call assert_equal(1,len(s:notices)) | call assert_match('Message sent, but the editor could not clear',s:notices[0])
    call assert_equal([],s:events) | call assert_notequal([],b:wbx_quote_sources)
  endfor
  let pending=s:fresh() | let s:mode='custom' | let caught=0
  try | call s:clear(pending) | catch /^Synthetic non-editor write error$/ | let caught=1 | endtry
  call assert_equal(1,caught) | call assert_equal([],s:timers())
  call add(s:checks,'retry exhaustion and false success retain confirmed-sent proof; only native Vim errors are caught, with no service-retry path')

  let pending=s:fresh() | let pending.attachmentId=repeat('d',32) | let pending.draftId='clear-owner-draft'
  let b:wbx_staged_upload={'attachmentId':pending.attachmentId} | let b:wbx_attachment_revision=7
  let s:blocked=99 | let before=s:native()
  call s:clear(pending) | call s:drain()
  call assert_equal(1,s:writes,'attachment key forbids deferred clear even if upload cleanup follows')
  call assert_equal(before,s:native()) | call assert_true(wbx#drafts#is_sent(bufnr('%')))
  call assert_equal(7,b:wbx_confirmed_sent.attachmentRevision) | call assert_equal(1,len(s:notices))
  let pending=s:fresh() | let pending.attachmentId=repeat('d',32) | let pending.format='markdown'
  let b:wbx_staged_upload={'attachmentId':pending.attachmentId} | let b:wbx_format='markdown'
  call s:clear(pending) | call assert_equal([''],getline(1,'$'))
  call assert_equal(1,s:writes) | call assert_equal([],s:timers())
  call add(s:checks,'exact attachment/format clear can succeed immediately; blocked file clear keeps original no-retry rule and attachment-revision marker')

  let pending=s:fresh()
  wincmd p
  call feedkeys("i\<Esc>",'xt')
  let before=s:native()
  call s:clear(pending)
  call assert_equal(before,s:native(),'background clear never focuses or rewrites independent foreground undo/options')
  call assert_equal([''],getbufline(s:composer,1,'$')) | call assert_equal(1,s:writes)
  call add(s:checks,'background successful clear operates on the exact composer buffer without moving focus or touching foreground text/full undo')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Independent native foreground',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Independent native foreground"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call s:drain()
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'nativeTextlockObserved':s:textlock_seen,
      \ 'scope':'inert state/write faults, real native buffer/view/draft/attachment guards and timers; no application/transport/send owner'})],$WBX_EDITOR_RESULT)
qa!
