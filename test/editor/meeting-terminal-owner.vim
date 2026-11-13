" Real isolated tmux CLIENT jobs/generations; inert backend, no media owner/service/devices.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
execute 'source '.fnameescape($WBX_EDITOR_ROOT.'/autoload/wbx/transport.vim')
let s:stub=$WBX_EDITOR_RESULT.'.stub'
call mkdir(s:stub.'/autoload/wbx','p')
call writefile(['function! wbx#transport#running() abort','return g:meeting_terminal_running','endfunction',
      \ 'function! wbx#transport#write(wire) abort','call add(g:meeting_terminal_requests,json_decode(a:wire))','endfunction',
      \ 'function! wbx#transport#start(command) abort','throw "Backend forbidden"','endfunction',
      \ 'function! wbx#transport#stop() abort','let g:meeting_terminal_running=0','call wbx#_exit(0)','endfunction'],s:stub.'/autoload/wbx/transport.vim')
execute 'source '.fnameescape(s:stub.'/autoload/wbx/transport.vim')
execute 'set rtp^='.fnameescape(s:stub)
let g:meeting_terminal_running=1 | let g:meeting_terminal_requests=[]
let g:wbx_tui={'images':0,'notifications':0,'people_status':0,'read_status':0,'upcoming_meetings':0,
      \ 'spaces_cache':0,'persist_drafts':0,'mark_read_on_open':0,'folds':0,'statusline':0}
runtime plugin/wbx.vim
let s:socket=$WBX_EDITOR_RESULT.'.sock' | let s:checks=[] | let s:drawn=[] | let s:session='wbx-native-a'
function! s:tmux(args) abort
  let command=['tmux','-S',s:socket]+a:args
  let out=system(join(map(command,'shellescape(v:val)'),' '))
  return {'out':trim(out),'code':v:shell_error}
endfunction
function! s:attached(session) abort
  let value=s:tmux(['display-message','-p','-t',a:session,'#{session_attached}'])
  return value.code==0 ? value.out : 'unavailable'
endfunction
function! s:wait(expression) abort
  let start=reltime()
  while !eval(a:expression) && reltimefloat(reltime(start))<4 | sleep 5m | endwhile
  if !eval(a:expression) | throw 'Timeout: '.a:expression | endif
endfunction
function! s:meeting() abort
  return {'active':v:true,'ready':v:true,'session':s:session,'display':'editor',
        \ 'attach':['tmux','-S',s:socket,'attach-session','-t',s:session]}
endfunction
function! s:publish() abort
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting','params':s:meeting()})
endfunction
function! s:native() abort
  return [bufnr('%'),getline(1,'$'),undotree(),b:changedtick,&breakat]
endfunction
try
  call assert_true(executable('tmux'),'installed tmux required; no dependency installation')
  let result=s:tmux(['-f','/dev/null','new-session','-d','-s','wbx-native-a','sleep 60'])
  call assert_equal(0,result.code,result.out)
  let result=s:tmux(['new-session','-d','-s','wbx-native-b','sleep 60']) | call assert_equal(0,result.code,result.out)
  let owners=s:tmux(['list-panes','-a','-F','#{session_name}:#{pane_pid}']).out
  call wbx#buffers()
  let sid=filter(getscriptinfo(),'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>'.sid.'_hello'),[{'result':{'version':1,
        \ 'state':{'revision':0,'state':'idle','mode':'demo','ready':v:false,'rooms':[],'room':v:null,'messages':[]},
        \ 'meeting':s:meeting(),'capabilities':['meeting-tmux']}}])
  enew | file meeting-terminal-independent.txt
  call setline(1,'Independent native terminal work') | call feedkeys("i\<Esc>",'xt')
  let native=s:native() | let window=win_getid()
  call s:publish()
  call s:wait('&buftype==# "terminal" && s:attached("wbx-native-a")==# "1"')
  let terminal=bufnr('%')
  call win_gotoid(window)
  let focus=win_getid() | call s:publish()
  call assert_equal(focus,win_getid(),'same-state notifications do not steal native focus')
  call assert_equal('1',s:attached('wbx-native-a'))
  call assert_equal(terminal,winbufnr(win_findbuf(terminal)[0]))
  call assert_equal(native,s:native())
  call add(s:checks,'actual tmux client attaches once and repeated readiness preserves hidden-tab native focus/text/full undo')

  WebexMeetingEditor
  call assert_equal(terminal,bufnr('%'))
  let transport=filter(getscriptinfo(),'v:val.name ==# $WBX_EDITOR_ROOT."/autoload/wbx/transport.vim"')[0].sid
  let old=getscriptinfo({'sid':transport})[0].variables.terminal_generation
  WebexMeetingDetach
  call s:wait('s:attached("wbx-native-a")==# "0"')
  call s:publish() | call assert_equal('0',s:attached('wbx-native-a'))
  WebexMeetingEditor | call s:publish()
  call s:wait('&buftype==# "terminal" && s:attached("wbx-native-a")==# "1"')
  let current=bufnr('%')
  call call(function('<SNR>'.transport.'_terminal_exit'),[old])
  call assert_equal(current,bufnr('%')) | call assert_equal('1',s:attached('wbx-native-a'))
  call add(s:checks,'explicit detach stops only the real client; deliberate reattach creates a fresh generation and a retired exit callback cannot close it')

  let s:session='wbx-native-b' | call s:publish()
  call s:wait('s:attached("wbx-native-a")==# "0" && s:attached("wbx-native-b")==# "1"')
  bwipeout!
  call s:wait('s:attached("wbx-native-b")==# "0"')
  call s:publish() | call assert_equal('0',s:attached('wbx-native-b'),'closed native view is not automatically recreated')
  call win_gotoid(window)
  call assert_equal(native,s:native())
  call assert_equal(owners,s:tmux(['list-panes','-a','-F','#{session_name}:#{pane_pid}']).out)
  let g:meeting_terminal_running=0 | call wbx#shutdown()
  call assert_equal(0,s:tmux(['has-session','-t','wbx-native-a']).code)
  call assert_equal(0,s:tmux(['has-session','-t','wbx-native-b']).code)
  call add(s:checks,'meeting replacement switches only clients; closing/shutdown leave both isolated owner processes alive and native work intact')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
    endfor
    call assert_match('Independent native terminal work',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Independent native terminal work"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
finally
  let g:meeting_terminal_running=0
  call wbx#shutdown()
  " This fixture created this exact private socket; never touches a user server.
  let cleanup=s:tmux(['kill-server'])
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'scope':'actual isolated tmux client/terminal generations; inert backend and sleep-only owner panes, no media/service/devices'})],$WBX_EDITOR_RESULT)
qa!
