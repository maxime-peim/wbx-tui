" Real native setup/mapping owner with inert application effects; no plugin/backend.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
setglobal foldmethod=indent foldlevel=99 foldtext=
let maplocalleader=';'
let g:wbx_tui={'images':0,'folds':1,'mappings':1,'read_status':1,'send_with_ctrl_s':1,'statusline':0}
let s:checks=[] | let s:drawn=[] | let s:events=[] | let s:hooks=[] | let s:effects=[]
function! s:render() abort
  call add(s:effects,'render')
endfunction
function! s:enter() abort
  call add(s:effects,'enter')
endfunction
function! s:leave() abort
  call add(s:effects,'leave')
endfunction
function! s:draft() abort
  call add(s:effects,'draft')
endfunction
function! s:event(name, data) abort
  " Keep exact maparg snapshots in native assertions, not JSON: Neovim's
  " lhsraw fields can contain native non-UTF-8 keycodes.
  call add(s:events,{'name':a:name,'data':copy(a:data),'maps':len(get(b:,'wbx_default_maps',[]))})
endfunction
let s:ports={'Render':function('s:render'),'EnterWindow':function('s:enter'),'LeaveWindow':function('s:leave'),
      \ 'Draft':function('s:draft'),'Event':function('s:event')}
function! s:apply() abort
  call wbx#buffer_setup#apply(s:ports)
endfunction
function! s:probe() abort
  return [getline(1,'$'),undotree(),b:changedtick,getcurpos(),winsaveview()]
endfunction
function! s:hook() abort
  call add(s:hooks,{'buffer':bufnr('%'),'kind':b:wbx_kind,'initialized':get(b:,'wbx_initialized',0),
        \ 'options':[&l:wrap,&l:linebreak,&l:conceallevel,&l:foldmethod]})
  if b:wbx_kind==# 'history'
    setlocal nowrap nolinebreak conceallevel=0 foldmethod=manual
    nnoremap <buffer> i :let g:setup_history_hook=1<CR>
  elseif bufname('%')=~# 'setup-promote'
    call setline(1,'Hook-promoted native work')
    setlocal buftype=
  elseif bufname('%')=~# 'setup-redirect'
    execute 'buffer '.s:foreign
  elseif bufname('%')=~# 'setup-user'
    nnoremap <buffer> <C-s> :let g:setup_user_save=1<CR>
    inoremap <buffer> <C-s> <C-o>:let g:setup_user_save=2<CR>
  endif
endfunction
augroup wbx_setup_owner_hooks
  autocmd!
  autocmd FileType wbx-history,wbx-compose call s:hook()
augroup END
try
  set cpoptions+=C
  let cpo=&cpoptions | let breakat=&breakat
  call setline(1,'Independent setup work')
  call feedkeys("\<Esc>",'xt')
  let s:foreign=bufnr('%') | let foreign=s:probe()
  let history=wbx#workspace#buffer('wbx://history','history')
  execute 'buffer '.history
  call s:apply()
  call assert_equal(cpo,&cpoptions)
  call assert_equal([1,1,2,'expr'],s:hooks[-1].options,'defaults and first-window folds precede FileType')
  call assert_equal(1,s:hooks[-1].initialized)
  call assert_equal([0,0,0,'manual'],[&l:wrap,&l:linebreak,&l:conceallevel,&l:foldmethod])
  call assert_match('setup_history_hook',maparg('i','n'))
  call assert_false(empty(maparg('R','n',0,1)),'enabled read-status default is installed only on history')
  call assert_equal(1,len(s:events)) | call assert_equal('WbxBuffer',s:events[-1].name)
  call assert_true(s:events[-1].maps>0,'buffer event follows default mapping installation')
  call setline(1,['Native setup annotation','Second','Third','Fourth','Fifth','Sixth'])
  call feedkeys("\<Esc>",'xt') | call append(6,'Unsynced setup edit')
  2,4fold
  let before=s:probe() | let maps=deepcopy(b:wbx_default_maps) | let hook_count=len(s:hooks)
  for i in range(10) | call s:apply() | endfor
  call assert_equal(before,s:probe()) | call assert_equal(maps,b:wbx_default_maps)
  call assert_equal(hook_count,len(s:hooks)) | call assert_equal(1,len(s:events))
  call assert_equal([0,0,0,'manual'],[&l:wrap,&l:linebreak,&l:conceallevel,&l:foldmethod])
  call assert_equal(breakat,&breakat)
  call add(s:checks,'native defaults precede FileType; repeated setup preserves hooks, overrides and full unsynced annotation undo')

  let draft=wbx#workspace#buffer('wbx://compose/setup-user','compose','setup-user')
  execute 'buffer '.draft
  call s:apply()
  call assert_equal(0,s:hooks[-1].options[2],'composer is literal before FileType')
  call assert_match('setup_user_save=1',maparg('<C-s>','n'))
  call assert_match('setup_user_save=2',maparg('<C-s>','i'))
  call assert_equal(2,len(b:wbx_default_maps),'only normal send/cancel defaults belong to setup')
  call assert_equal({},maparg('<CR>','i',0,1))
  nnoremap <buffer> ;s :let g:setup_later_save=1<CR>
  let user=maparg(';s','n',0,1)
  let maplocalleader=','
  call setline(1,'Draft text and undo belong to the user')
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.promoted.txt')
  setlocal buftype=
  let before=s:probe() | let event_count=len(s:events)
  call s:apply() | call s:apply()
  call assert_equal(before,s:probe())
  call assert_equal(user,maparg(';s','n',0,1),'later user override survives promotion')
  call assert_equal({},maparg(';R','n',0,1),'release uses the original expanded localleader')
  call assert_match('setup_user_save=1',maparg('<C-s>','n'))
  call assert_match('setup_user_save=2',maparg('<C-s>','i'))
  call assert_false(exists('b:wbx_kind') || exists('b:wbx_default_maps') || exists('b:wbx_initialized'))
  call assert_equal(event_count,len(s:events))
  call add(s:checks,'FileType and later user maps win; promotion removes only exact owned defaults despite localleader changes')

  let promoted=wbx#workspace#buffer('wbx://compose/setup-promote','compose','setup-promote')
  execute 'buffer '.promoted
  let event_count=len(s:events)
  call s:apply()
  call assert_equal(['Hook-promoted native work'],getline(1,'$'))
  call assert_false(exists('b:wbx_kind') || exists('b:wbx_initialized'))
  call assert_false(get(maparg('<C-s>','n',0,1),'buffer',0)) | call assert_false(get(maparg('<C-s>','i',0,1),'buffer',0))
  call assert_equal(event_count,len(s:events),'FileType promotion never emits an owned-buffer event')
  let redirected=wbx#workspace#buffer('wbx://compose/setup-redirect','compose','setup-redirect')
  execute 'buffer '.redirected
  call s:apply()
  call assert_equal(s:foreign,bufnr('%')) | call assert_equal(foreign,s:probe())
  call assert_equal(event_count,len(s:events),'FileType redirection never installs defaults/events on the foreign origin')
  call assert_false(get(maparg('<C-s>','n',0,1),'buffer',0))
  call add(s:checks,'FileType promotion/redirection cannot install send mappings or publish an owned-buffer event after ownership changes')

  let g:wbx_tui.mappings=0
  execute 'buffer '.wbx#workspace#buffer('wbx://compose/setup-optout','compose','setup-optout')
  call s:apply()
  call assert_equal([],b:wbx_default_maps) | call assert_false(get(maparg('<C-s>','n',0,1),'buffer',0))
  let g:wbx_tui.mappings=1
  call s:apply() | call assert_equal([],b:wbx_default_maps,'later setup does not silently reinitialize an opted-out buffer')
  let g:wbx_tui.send_with_ctrl_s=0
  execute 'buffer '.wbx#workspace#buffer('wbx://compose/setup-noctrl','compose','setup-noctrl')
  call s:apply()
  call assert_equal(2,len(b:wbx_default_maps)) | call assert_false(get(maparg('<C-s>','n',0,1),'buffer',0))
  call assert_false(get(maparg('<C-s>','i',0,1),'buffer',0),'a native global Ctrl-S binding is not an owned buffer default')
  call add(s:checks,'mapping and Ctrl-S opt-outs apply on initial setup without inventing re-entry resets')

  execute 'buffer '.history
  let b:wbx_history_room='setup-history'
  let b:wbx_message_rows=[1] | let b:wbx_quote_rows=[] | let b:wbx_reply_rows=[]
  let b:wbx_message_blocks=[{'id':'setup-message','start':1,'body':2,'end':3}]
  execute 'file '.fnameescape($WBX_EDITOR_RESULT.'.history.txt')
  setlocal buftype=
  let before=s:probe()
  call s:apply()
  call assert_equal(before,s:probe())
  call assert_false(exists('b:wbx_message_rows') || exists('b:wbx_message_blocks') || exists('b:wbx_history_room'))
  call assert_match('setup_history_hook',maparg('i','n'))
  call assert_equal({},maparg('R','n',0,1))
  call add(s:checks,'history promotion releases syntax/action metadata and owned mappings without discarding text, undo or user maps')
  enew
  file wbx://loaded-thread
  setlocal buftype=nofile bufhidden=hide
  let b:wbx_list_kind='thread'
  let view=wbx#history#render([{'id':'thread-message','author':'Synthetic','created':'','text':'Independent thread presentation'}],0)
  call setline(1,view.lines)
  setlocal nomodified
  let b:wbx_list_tick=b:changedtick
  call wbx#history#present(view)
  let before=s:probe() | let blocks=deepcopy(b:wbx_message_blocks) | let event_count=len(s:events)
  call s:apply() | call s:apply()
  call assert_equal(before,s:probe()) | call assert_equal(blocks,b:wbx_message_blocks)
  call assert_true(wbx#history#presentation())
  call assert_false(exists('b:wbx_kind') || exists('b:wbx_history_room'))
  call assert_false(get(maparg('<C-s>','n',0,1),'buffer',0)) | call assert_equal(event_count,len(s:events))
  call add(s:checks,'clean thread-list re-entry retains presentation boundaries without acquiring main-history actions or buffer events')
  call assert_equal([],filter(getscriptinfo(),'v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx.vim" || v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx/transport.vim"'))
  if $WBX_EDITOR_SCREEN==# '1'
    execute 'buffer '.history
    normal! gg
    redraw!
    let row=screenpos(win_getid(),1,1).row | let col=getwininfo(win_getid())[0].wincol
    let text=join(map(range(col,col+winwidth(0)-1),'screenstring(row,v:val)'),'')
    call assert_match('Native setup annotation',text) | call add(s:drawn,trim(text))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,'events':s:events,'hooks':s:hooks,'scope':'inert render/window/draft/event effects; real native FileType, buffer ownership and mapping lifecycle; no application/backend'})],$WBX_EDITOR_RESULT)
qa!
