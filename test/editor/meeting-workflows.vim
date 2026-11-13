" Native meeting choices with synthetic owner ACKs only; no tmux/browser/devices.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  let revision = 0, state = { revision, state: 'idle', mode: 'demo', rooms: [], room: null, messages: [], ready: false };
  let meeting = { active: true, ready: true, session: 'wbx-synthetic', display: 'kitty', attach: [], panes: { version: 1, revision: 1, layouts: ['gallery', 'speaker'], sources: [
    {id:'video',label:'Revision-bound video slot',kind:'video',available:true,generation:1},
    {id:'share',label:'Received share',kind:'share',available:false}] } };
  const write = v => process.stdout.write(JSON.stringify(v) + '\n');
  const publish = () => { state.revision = ++revision; write({ jsonrpc:'2.0', method:'state', params:state }); };
  createInterface({ input:process.stdin }).on('line', line => {
    const req = JSON.parse(line), p = req.params || {}, reply = result => write({jsonrpc:'2.0', id:req.id, result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT, JSON.stringify(req) + '\n');
    if (req.method === 'hello') return reply({version:1, capabilities:['meeting-tmux','meeting-panes-v1'], state, meeting});
    if (req.method === 'session.start') { publish(); reply(null); return; }
    if (req.method === 'meeting.pane') return reply({ session:p.session, revision:p.intent.revision, action:p.intent.action, status:'applied' });
    if (req.method === 'shutdown') { reply(null); process.exit(0); }
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs'], 'images': 0, 'notifications': 0, 'people_status': 0}
runtime autoload/wbx/meeting.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/meeting.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\nlet g:meeting_choices = deepcopy(a:lines)\nif get(g:, 'meeting_replace', 0)\nlet g:meeting_replace = 0\nlet value = wbx#meeting_state()\nlet value.panes.revision += 1\ncall wbx#_receive({'jsonrpc':'2.0','method':'meeting','params':value})\nendif\ncall call(a:Callback, [get(g:, 'meeting_choice', 1)])\nendfunction"
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:requests(method) abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method')
endfunction
try
  WebexDemo
  call s:wait('get(wbx#meeting_state(), "ready", 0)')
  call assert_equal('idle', wbx#state().state, 'meeting controls independent of messaging readiness')
  enew
  file unrelated-native-work.txt
  call feedkeys("iNative unsent work\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let original = [win_getid(), bufnr('%'), getline(1, '$'), undotree()]
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'sources','sources':[
        \ {'id':'video','label':'Received video slot','kind':'video','available':v:true,'generation':1},
        \ {'id':'share','label':'Received share','kind':'share','available':v:false}]}})
  call feedkeys("\\WmP", 'xt')
  call s:wait('len(s:requests("meeting.pane")) == 1')
  call assert_equal({'session':'wbx-synthetic','intent':{'revision':1,'action':'source.set','source':'video'}}, s:requests('meeting.pane')[0].params)
  call assert_match('NOT complete attendees/self/lobby', join(g:meeting_choices, ' '))
  call assert_match('Revision-bound video slot', join(g:meeting_choices, ' '), 'choices use the revision-paired roster, not independently arriving old media events')
  call assert_notmatch('Received video slot', join(g:meeting_choices, ' '))
  let g:meeting_choice = 2
  call feedkeys("\\WmP", 'xt')
  call assert_equal(1, len(s:requests('meeting.pane')), 'unavailable source choice makes zero requests')
  call feedkeys("\\WmL", 'xt')
  call s:wait('len(s:requests("meeting.pane")) == 2')
  call assert_equal('speaker', s:requests('meeting.pane')[-1].params.intent.layout)
  call assert_match('NOT active-speaker following', join(g:meeting_choices, ' '))
  let g:meeting_replace = 1
  call feedkeys("\\WmL", 'xt')
  call assert_equal(2, len(s:requests('meeting.pane')), 'changed roster/layout revision revokes old modal choices')
  call feedkeys("\\WmR", 'xt')
  call s:wait('len(s:requests("meeting.control")) == 1')
  call assert_equal({'action':'auth.refresh'}, s:requests('meeting.control')[0].params)
  call assert_equal([], s:requests('auth.refresh'), 'meeting and messaging auth are distinct')
  call assert_equal(original, [win_getid(), bufnr('%'), getline(1, '$'), undotree()], 'presentation menus preserve native text/full undo/focus')
  call assert_match('mic:unknown.*cam:unknown.*share:unknown.*Rx:unknown.*controls:ready', wbx#status(), 'missing observations are never off')
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting.event','params':{'type':'send-state','kind':'microphone','state':'on','requestId':1}})
  call assert_match('mic:on', wbx#status())
  let meeting = wbx#meeting_state() | let meeting.ready = v:false
  call wbx#_receive({'jsonrpc':'2.0','method':'meeting','params':meeting})
  call assert_match('STALE/UNKNOWN.*mic:unknown.*controls:unavailable', wbx#status())
  call feedkeys("\\WmP\\WmL\\WmR", 'xt')
  sleep 20m
  call assert_equal(2, len(s:requests('meeting.pane')))
  call assert_equal(1, len(s:requests('meeting.control')), 'missing controls never reconnect/rejoin or expand grants')
  WebexMeetingReconnect
  call s:wait('len(s:requests("meeting.reconnect")) == 1')
  call assert_equal({'session':'wbx-synthetic'}, s:requests('meeting.reconnect')[0].params)
  call assert_equal([], s:requests('meeting.start'), 'explicit recovery cannot join or replace an owner')
  call assert_equal(1, len(s:requests('meeting.control')), 'recovery does not replay old toggles/auth')
  WebexMeetingStatus
  call assert_match('bounded slots.*NOT complete attendee/self/lobby', join(getline(1, '$'), ' '))
  call assert_match('NOT SENT', join(getline(1, '$'), ' '))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})], $WBX_EDITOR_RESULT)
qa!
