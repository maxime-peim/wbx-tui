" Presentation-only coalescing with real native textlock/view writes and inert lifetime ports.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui={'images':0,'persist_drafts':0}
let s:checks=[] | let s:drawn=[] | let s:notices=[] | let s:context=['a','ready',0]
let s:renders=0 | let s:interrupted=0 | let s:next='Initial projection' | let s:mode='' | let s:error=''
let s:replace_interrupt=0 | let s:expression_mode='' | let s:observed=0 | let s:verified_textlock=0
function! s:context() abort
  return copy(s:context)
endfunction
function! s:notify(text) abort
  call add(s:notices,a:text)
endfunction
function! s:render() abort
  let s:renders+=1
  if s:mode==# 'native-other' | let failure=g:nonexistent_render_request_fixture_value | endif
  if !empty(s:error) | throw s:error | endif
  call wbx#view#write(s:surface,[s:next],function('s:notify'))
endfunction
function! s:interrupted() abort
  let s:interrupted+=1
  call wbx#render#interrupted(s:renderer)
  if s:replace_interrupt
    let s:replace_interrupt=0
    let s:context=['replacement','ready',0]
    call wbx#render_request#render(s:owner)
  endif
endfunction
function! s:drain() abort
  let start=reltime()
  while s:owner.timer>=0 && reltimefloat(reltime(start))<1 | sleep 5m | endwhile
  call assert_equal(-1,s:owner.timer)
endfunction
function! RenderRequestExpression() abort
  let renders=s:renders
  call wbx#render_request#render(s:owner)
  call wbx#render_request#render(s:owner)
  call wbx#render_request#render(s:owner)
  let s:observed=s:owner.timer>=0 && s:renders==renders+1
        \ && !getbufvar(s:surface,'&modifiable') && !wbx#view#edited(s:surface)
  if s:expression_mode==# 'context'
    let s:context=['new','ready',0]
  elseif s:expression_mode==# 'exhaust'
    while s:owner.timer>=0
      let entry=timer_info(s:owner.timer)[0]
      call timer_stop(entry.id)
      call call(entry.callback,[entry.id])
    endwhile
  elseif s:expression_mode==# 'replace'
    let old=timer_info(s:owner.timer)[0]
    call wbx#render_request#cancel(s:owner)
    let s:context=['new','ready',0]
    call wbx#render_request#render(s:owner)
    let timer=s:owner.timer
    call call(old.callback,[old.id])
    call assert_equal(timer,s:owner.timer,'stale callback cannot release replacement request')
  endif
  return ''
endfunction
function! s:locked() abort
  inoremap <silent><buffer><expr> <F6> RenderRequestExpression()
  call feedkeys("A\<F6>\<Esc>",'xt')
  iunmap <buffer> <F6>
endfunction
function! s:native() abort
  return [bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview(),&breakat]
endfunction
try
  enew | file request-owner-native.txt | call setline(1,'Independent request foreground')
  call feedkeys("i\<Esc>",'xt')
  let s:surface=wbx#workspace#buffer('wbx://spaces','rooms')
  let s:renderer=wbx#render#new({})
  let cpo=&cpoptions
  let s:owner=wbx#render_request#new({'Context':function('s:context'),'Render':function('s:render'),
        \ 'Interrupted':function('s:interrupted'),'Notify':function('s:notify')})
  call assert_equal(cpo,&cpoptions)
  let before=s:native()
  call wbx#render_request#render(s:owner)
  call assert_equal(1,s:renders) | call assert_equal(-1,s:owner.timer)
  call assert_equal({},s:owner.work) | call assert_equal(before,s:native())
  call add(s:checks,'unlocked request renders synchronously with no retained work or timer and no foreground edits/focus change')

  let s:next='Latest projection after lock'
  let s:renderer.status=['possibly interrupted'] | let s:renderer.drafts=12
  call s:locked()
  call assert_true(s:observed,'actual E565 coalesces three requests into one timer and restores projection writability')
  let s:verified_textlock=s:observed
  call assert_equal([],s:renderer.status) | call assert_equal(-1,s:renderer.drafts)
  let s:next='CURRENT projection after unlock'
  let before=s:native()
  call s:drain()
  call assert_equal(['CURRENT projection after unlock'],getbufline(s:surface,1,'$'))
  call assert_equal(before,s:native()) | call assert_equal(1,s:interrupted)
  call assert_false(getbufvar(s:surface,'&modifiable')) | call assert_false(wbx#view#edited(s:surface))
  call add(s:checks,'real native E565 defers presentation only, coalesces requests, invalidates signatures and renders current rather than captured projection')

  let s:next='Retired session must not render' | let s:expression_mode='context'
  call s:locked()
  let renders=s:renders
  call s:drain()
  call assert_equal(renders,s:renders) | call assert_equal(['CURRENT projection after unlock'],getbufline(s:surface,1,'$'))
  let s:expression_mode='replace' | let s:next='Replacement current projection'
  call s:locked() | call s:drain()
  call assert_equal(['Replacement current projection'],getbufline(s:surface,1,'$'))
  call add(s:checks,'changed lifetime retires queued work; canceled callback cannot alter a newer timer even when reused in the same owner')

  let s:expression_mode='exhaust' | let s:next='Locked through bounded attempts'
  let renders=s:renders
  call s:locked()
  call assert_equal(renders+4,s:renders) | call assert_equal(-1,s:owner.timer)
  call assert_equal({},s:owner.work) | call assert_equal(1,len(s:notices))
  call assert_match('no send was retried',s:notices[-1])
  let s:expression_mode=''
  call wbx#render_request#render(s:owner)
  call assert_equal(['Locked through bounded attempts'],getbufline(s:surface,1,'$'))
  call add(s:checks,'continued native lock exhausts four presentation attempts with one warning; later explicit redraw recovers without action replay')

  let s:next='Reentrant replacement presentation' | let s:replace_interrupt=1
  call s:locked() | call s:drain()
  call assert_equal(['Reentrant replacement presentation'],getbufline(s:surface,1,'$'))
  call assert_equal(-1,s:owner.timer) | call assert_equal({},s:owner.work)
  call add(s:checks,'interruption hooks can replace the request without the older attempt overwriting or duplicating its timer')

  let s:error='Synthetic non-textlock rendering error' | let caught=0
  try | call wbx#render_request#render(s:owner) | catch /^Synthetic non-textlock rendering error$/ | let caught=1 | endtry
  call assert_equal(1,caught) | call assert_equal(-1,s:owner.timer) | call assert_equal({},s:owner.work)
  let s:error=''
  let s:mode='native-other' | let caught=0
  try | call wbx#render_request#render(s:owner) | catch /^Vim.*:E121:/ | let caught=1 | endtry
  call assert_equal(1,caught) | call assert_equal(-1,s:owner.timer) | call assert_equal({},s:owner.work)
  let s:mode=''
  call assert_equal(['ports','timer','work'],sort(keys(s:owner)))
  call add(s:checks,'non-E565 errors propagate with no stranded work; owner has one timer/request and no ACK/session-state registry')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'),''))
    endfor
    call assert_match('Independent request foreground',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Independent request foreground"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call wbx#render_request#cancel(s:owner)
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'realTextlockObserved':s:verified_textlock,
      \ 'scope':'real native E565/projection writes and timers; inert current-context/render ports, no delivery/send/transport owner'})],$WBX_EDITOR_RESULT)
qa!
