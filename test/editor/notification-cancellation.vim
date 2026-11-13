" Cancel intent, not ownership: a draining fake notifier must never overlap.
set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:tool =<< trim END
  import {appendFileSync,existsSync,readFileSync} from 'node:fs';
  const [audit,release]=process.argv.slice(2);
  process.on('SIGTERM',()=>{});
  let overlap=false;
  if(existsSync(audit))for(const line of readFileSync(audit,'utf8').trim().split('\n')){
    try{process.kill(JSON.parse(line).pid,0);overlap=true;}catch{}
  }
  appendFileSync(audit,JSON.stringify({pid:process.pid,overlap})+'\n');
  setInterval(()=>{if(existsSync(release))process.exit(0);},10);
END
call writefile(s:tool, $WBX_EDITOR_RESULT . '.tool.mjs')
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
try
  for scenario in ['stop', 'source-loss', 'mute']
    let audit = $WBX_EDITOR_RESULT . '.' . scenario
    let release = audit . '.release'
    let g:wbx_tui = {'notifications': {'mode': 'desktop', 'command': [$WBX_NODE, $WBX_EDITOR_RESULT . '.tool.mjs', audit, release]}}
    let s:before = wbx#notifications#status().submitted
    let s:audit = audit
    call wbx#notifications#start()
    WebexNotificationsTest
    call WaitFor('filereadable(s:audit)')
    if scenario ==# 'stop'
      call wbx#notifications#stop()
      call wbx#notifications#start()
    elseif scenario ==# 'source-loss'
      call wbx#notifications#observe({'state': 'idle'})
      call wbx#notifications#start()
    else
      WebexNotificationsMute 1
      WebexNotificationsResume
    endif
    call assert_true(wbx#notifications#status().active, scenario . ': cancellation retains native admission until exit')
    WebexNotificationsTest
    sleep 1150m
    if has('nvim')
      call assert_equal(1, len(readfile(audit)), scenario . ': a stubborn canceled notifier cannot overlap a new test')
    endif
    call writefile(['release'], release)
    call WaitFor('!wbx#notifications#status().active && wbx#notifications#status().submitted.desktop == s:before.desktop + 1')
    call assert_equal(s:before.editor, wbx#notifications#status().submitted.editor, 'cancellation must not fall back or replay')
    for record in readfile(audit)
      call assert_false(json_decode(record).overlap, scenario . ': no simultaneous fake notifiers')
    endfor
    call assert_equal(0, wbx#notifications#status().queued)
  endfor
  call assert_false(wbx#transport#running())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#notifications#stop()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
