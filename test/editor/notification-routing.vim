" Route through fake tools only; even discovery cannot reach a desktop daemon.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_notification_records = []
if has('nvim')
  lua vim.notify = function(body, _, opts) local log = vim.g.wbx_notification_records; log[#log+1] = {body=body,title=opts.title}; vim.g.wbx_notification_records = log end
endif
let s:bin = $WBX_EDITOR_RESULT . '.bin'
call mkdir(s:bin, '', 0700)
let s:tool =<< trim END
  import {appendFileSync} from 'node:fs';
  const [audit, behavior, literal, title, body] = process.argv.slice(2);
  appendFileSync(audit,JSON.stringify({behavior,literal,title,body,pid:process.pid})+'\n');
  if(behavior==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
  else if(behavior==='fail'){process.stderr.write('PRIVATE NOTIFIER ERROR');process.exit(1);}
END
call writefile(s:tool, $WBX_EDITOR_RESULT . '.tool.mjs')
let s:auto = ['#!' . $WBX_NODE, "const fs=require('node:fs');fs.appendFileSync(process.env.WBX_NOTIFICATION_AUDIT,JSON.stringify({argv:process.argv.slice(2)})+String.fromCharCode(10));"]
call writefile(s:auto, s:bin . '/notify-send')
call writefile(s:auto, s:bin . '/terminal-notifier')
call setfperm(s:bin . '/notify-send', 'rwx------')
call setfperm(s:bin . '/terminal-notifier', 'rwx------')
let $PATH = s:bin . ':' . $PATH
let $WBX_NOTIFICATION_AUDIT = $WBX_EDITOR_RESULT . '.auto'
let $DBUS_SESSION_BUS_ADDRESS = ''
let $DISPLAY = '' | let $WAYLAND_DISPLAY = ''
let g:wbx_tui = {}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 7
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:counts() abort
  return wbx#notifications#status().submitted
endfunction
function! s:args(behavior) abort
  return [$WBX_NODE, $WBX_EDITOR_RESULT . '.tool.mjs', $WBX_EDITOR_RESULT . '.tools', a:behavior, 'literal;$(never-run)']
endfunction
function! s:state(id, text, title) abort
  let stamp = a:id ==# 'baseline' ? '2026-11-11T12:00:00Z' : a:id ==# 'markup' ? '2026-11-11T12:00:01Z' : a:id ==# 'private' ? '2026-11-11T12:00:02Z' : '2026-11-11T12:00:03Z'
  return {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': a:title}, 'rooms': [],
        \ 'messages': [{'id': a:id, 'author': 'Synthetic', 'created': stamp, 'text': a:text}]}
endfunction
try
  WebexNotificationsTest
  call WaitFor('s:counts().editor == 1')
  call assert_false(wbx#transport#running(), 'the test command cannot start a backend or sign in')
  let g:wbx_tui.notifications = {'mode': 'hybrid', 'command': s:args('ok')}
  doautocmd FocusGained
  WebexNotificationsTest
  call WaitFor('s:counts().editor == 2')
  call assert_false(filereadable($WBX_EDITOR_RESULT . '.tools'))
  doautocmd FocusLost
  WebexNotificationsTest
  call WaitFor('s:counts().desktop == 1')
  let tool = json_decode(readfile($WBX_EDITOR_RESULT . '.tools')[0])
  call assert_equal('literal;$(never-run)', tool.literal)
  call assert_equal('Webex', tool.title)
  call assert_match('no Webex request', tool.body)
  call assert_equal('command', wbx#notifications#status().provider)
  let g:wbx_tui.notifications = {'mode': 'desktop', 'command': [s:bin . '/missing']}
  WebexNotificationsTest
  call WaitFor('s:counts().editor == 3')
  call assert_equal('desktop-unavailable-editor-fallback', wbx#notifications#status().reason)
  let g:wbx_tui.notifications.command = s:args('fail')
  WebexNotificationsTest
  call WaitFor('s:counts().editor == 4')
  call assert_equal('desktop-failed-editor-fallback', wbx#notifications#status().reason)
  call assert_notmatch('PRIVATE', string(wbx#notifications#status()))
  let g:wbx_tui.notifications = {'mode': 'desktop', 'preview': 0}
  WebexNotificationsTest
  call WaitFor('s:counts().desktop == 2')
  call assert_equal('terminal-notifier', wbx#notifications#status().provider)
  let $DBUS_SESSION_BUS_ADDRESS = 'unix:path=/synthetic-notification-only'
  call wbx#notifications#observe(s:state('baseline', 'PRIVATE old body', '<b>Room & literal;$(never-run)</b>'))
  call wbx#notifications#observe(s:state('markup', 'PRIVATE new body', '<b>Room & literal;$(never-run)</b>'))
  call WaitFor('s:counts().desktop == 3')
  let args = json_decode(readfile($WBX_NOTIFICATION_AUDIT)[-1]).argv
  call assert_equal('notify-send', wbx#notifications#status().provider)
  call assert_equal('--', args[-3])
  call assert_match('&lt;b&gt;Room &amp; literal;$(never-run)&lt;/b&gt;', args[-2])
  call assert_equal('New message', args[-1], 'explicit preview=false keeps desktop message bodies private')
  let g:wbx_tui.notifications.titles = 0
  call wbx#notifications#observe(s:state('private', 'PRIVATE new body', 'PRIVATE TITLE'))
  call WaitFor('s:counts().desktop == 4')
  let args = json_decode(readfile($WBX_NOTIFICATION_AUDIT)[-1]).argv
  call assert_equal('Webex', args[-2])
  call assert_equal('New message', args[-1])
  let g:wbx_tui.notifications.preview = 1
  call wbx#notifications#observe(s:state('preview', "<b>Preview</b>\n" . nr2char(27) . '[31m', 'Title'))
  call WaitFor('s:counts().desktop == 5')
  let args = json_decode(readfile($WBX_NOTIFICATION_AUDIT)[-1]).argv
  call assert_match('&lt;b&gt;Preview&lt;/b&gt;', args[-1])
  call assert_notmatch('New message', args[-1], 'desktop previews do not add a generic message label')
  call assert_notmatch('[\x00-\x1f]', args[-1])
  let before_muted = s:counts()
  let muted_state = s:state('queued-muted','PRIVATE muted message','Muted room')
  call wbx#notifications#observe(muted_state)
  let muted_state.room.notifications = v:false
  call wbx#notifications#observe(muted_state)
  let muted_state.room.notifications = v:true
  call wbx#notifications#observe(muted_state)
  sleep 300m
  call assert_equal(before_muted,s:counts(),'mute consumes queued alerts even if unmuted before their delivery timer')
  let g:wbx_tui.notifications = {'mode': 'desktop', 'command': s:args('hang')}
  WebexNotificationsTest
  call WaitFor('wbx#notifications#status().active')
  WebexNotificationsTest
  call WaitFor('s:counts().editor == 5')
  if has('nvim') | call assert_true(wbx#notifications#status().active, 'timeout retains native admission until the killed job actually exits') | endif
  let g:wbx_tui.notifications.mode = 'editor'
  call WaitFor('!wbx#notifications#status().active && s:counts().editor == 6')
  WebexNotificationsTest
  call wbx#notifications#stop()
  sleep 300m
  call assert_equal(6, s:counts().editor, 'stop cancels delayed delivery')
  WebexNotificationsMute 1
  WebexNotificationsTest
  call assert_true(wbx#notifications#status().muted)
  WebexNotificationsResume
  let g:wbx_tui.notifications = {'mode': 'desktop', 'command': 'unsafe shell string'}
  WebexNotificationsTest
  call assert_true(wbx#notifications#status().invalid)
  for invalid in [{'mode': {'PRIVATE': 'not an enum'}}, {'preview': {}}, {'messages': 'PRIVATE'}, {'meeting_minutes': [31]}, {'command': ["bad\ncommand"]}]
    let g:wbx_tui.notifications = invalid
    call assert_true(wbx#notifications#status().invalid)
    call assert_false(wbx#notifications#status().enabled)
    call assert_notmatch('PRIVATE', string(wbx#notifications#status()), 'invalid settings cannot enter health or state processing')
  endfor
  let g:wbx_tui.notifications = {'mode': 'editor'}
  for i in range(1, 20) | WebexNotificationsTest | endfor
  call assert_equal(16, wbx#notifications#status().queued, 'pending bursts are bounded')
  call WaitFor('s:counts().editor == 7')
  sleep 1100m
  call assert_equal(7, s:counts().editor, '12/minute admission cap drops the remaining burst')
  call assert_true(s:counts().dropped >= 5)
  WebexNotificationsMute 1
  WebexNotificationsResume
  if has('nvim')
    lua << trim LUA
      require('wbx-tui').setup({notifications={mode='editor',titles=false}})
      assert(vim.g.wbx_tui.notifications.titles == false, 'Lua forwards notification options without changing vim.notify')
      local previous = vim.notify
      vim.notify = function() error('PRIVATE notifier error') end
      assert(require('wbx-tui.notifications').show({title='Webex',body='Synthetic'}) == false)
      vim.notify = previous
    LUA
  endif
  call assert_false(wbx#transport#running(), 'routing and local timers never start provider work')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#notifications#stop()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
