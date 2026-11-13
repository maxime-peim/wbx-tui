" Workspace ownership with inert projection/setup/draft ports; no plugin or backend startup.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:checks=[] | let s:drawn=[] | let s:renders=0 | let s:drafts=[]
function! s:geometry() abort
  return {'rooms':26,'compose':5}
endfunction
function! s:statusline() abort
  return 0
endfunction
function! s:setup() abort
  call wbx#workspace#window_enter(s:owner)
endfunction
function! s:render() abort
  let s:renders+=1
endfunction
function! s:draft(blank) abort
  call add(s:drafts,a:blank)
  return wbx#workspace#buffer('wbx://compose/owner-test','compose','owner-test')
endfunction
function! s:text() abort
  return [bufnr('%'),getline(1,'$'),undotree(),b:changedtick]
endfunction
try
  let before_cpo=&cpoptions
  let s:owner=wbx#workspace#new({'Setup':function('s:setup'),'Render':function('s:render'),
        \ 'Geometry':function('s:geometry'),'Statusline':function('s:statusline'),'Draft':function('s:draft')})
  call assert_equal(before_cpo,&cpoptions)
  call assert_equal({'rooms':0,'history':0,'meeting':0},wbx#workspace#buffers(s:owner))
  call setline(1,'Independent workspace owner work')
  let original=bufnr('%') | let origin=win_getid() | let origin_tab=tabpagenr()
  call wbx#workspace#open(s:owner)
  call assert_equal(3,winnr('$'))
  call assert_notequal(origin_tab,tabpagenr())
  let buffers=wbx#workspace#buffers(s:owner)
  call assert_true(wbx#view#owned(buffers.rooms,'rooms') && wbx#view#owned(buffers.history,'history'))
  let detached=wbx#workspace#buffers(s:owner) | let detached.history=-1
  call assert_equal(buffers.history,wbx#workspace#id(s:owner,'history'))
  call assert_equal([1],s:drafts)
  call assert_equal(['Independent workspace owner work'],getbufline(original,1,'$'))
  call add(s:checks,'first open owns exactly the managed projections, not the foreign origin')

  let draft=wbx#workspace#composer_window()
  call win_gotoid(draft)
  call setline(1,'Native draft survives explicit reopen')
  call feedkeys("\<Esc>",'xt')
  call append(1,'Unsynced native undo')
  let before=s:text()
  call wbx#workspace#open(s:owner)
  call assert_equal(draft,win_getid())
  call assert_equal(before,s:text())
  call assert_equal(3,winnr('$'))
  call assert_equal([1],s:drafts,'reopen reuses the existing owned composer')
  call add(s:checks,'same-tab reopen preserves focus and full unsynced draft undo')

  call wbx#workspace#show(buffers.history)
  setlocal modifiable
  call setline(1,'Promoted history is independent work')
  call wbx#workspace#rename_pre(s:owner)
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.promoted-history.txt')
  setlocal buftype=
  call wbx#workspace#rename_post(s:owner)
  " Explicit promotion/reopen may leave the window. Capture the completed
  " native edit command; unsynced same-window reopen is checked separately.
  call feedkeys("\<Esc>",'xt')
  let promoted=bufnr('%') | let promoted_text=s:text() | let promoted_window=win_getid()
  call wbx#workspace#open(s:owner)
  call assert_equal(promoted_window,win_getid(),'explicit repair preserves a foreign same-tab origin')
  call assert_equal(promoted_text,s:text())
  call assert_notequal(promoted,wbx#workspace#id(s:owner,'history'))
  call assert_true(wbx#view#owned(wbx#workspace#id(s:owner,'history'),'history'))
  call add(s:checks,'promotion releases ownership; missing projection repair never adopts the promoted file')

  let history=wbx#workspace#id(s:owner,'history')
  call wbx#workspace#show(history)
  setlocal modifiable
  call setline(1,'Reserved-name foreign work')
  setlocal buftype=
  let collision=s:text() | let rejected=0
  try
    call wbx#workspace#ensure(s:owner,'history')
  catch /^Webex buffer name is occupied by other work/
    let rejected=1
  endtry
  call assert_equal(1,rejected)
  call assert_equal(collision,s:text())
  call add(s:checks,'reserved-name collisions preserve text/undo instead of adopting foreign buffers')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let row=screenpos(win_getid(),1,1).row | let col=getwininfo(win_getid())[0].wincol
    let text=join(map(range(col,col+winwidth(0)-1),'screenstring(row,v:val)'),'')
    call assert_match('Reserved-name foreign work',text)
    call add(s:drawn,trim(text))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'renders':s:renders,'draft_requests':s:drafts,'scope':'inert feature ports; no backend, media, send or receipt work'})],$WBX_EDITOR_RESULT)
qa!
