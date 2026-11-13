" Normal coordinator path, fake provider only. No real desktop or account calls.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
let g:wbx_notification_records = []
let s:visible = has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
let s:visible_extra = s:visible ? 0 : 1
if has('nvim')
  lua vim.notify = function(body, _, opts) local log = vim.g.wbx_notification_records; log[#log+1] = {body=body,title=opts.title}; vim.g.wbx_notification_records = log end
endif
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const rooms=['r','other'].map(id=>({id,title:'Synthetic '+id,type:'group',unread:false}));
  const base=Date.now()-100000; let sequence=0, revision=0;
  const msg=(id,text)=>({id,author:'Local',created:new Date(base+sequence++*1000).toISOString(),text});
  let state={revision,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),p=req.params||{},reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method})+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:['upcoming-meetings'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){state={...state,state:'ready',readStatus:'ready',rooms};publish();return reply(null);}
    if(req.method==='rooms.select'){state={...state,room:rooms.find(r=>r.id===p.roomId),ready:true,messages:[msg('initial','PRIVATE old history')]};publish();return reply(null);}
    if(req.method==='test.message'){state.messages=[...state.messages,msg(p.id,p.text||'PRIVATE incoming')];publish();return reply(null);}
    if(req.method==='test.publish'){state={...state,...p};publish();return reply(null);}
    if(req.method==='test.meeting'){
      const start=new Date(Date.now()+p.ahead*1000).toISOString();
      state.upcomingMeetings={state:'ready',observedAt:Date.now(),revision:revision+1,complete:true,coverage:'webex-current-series',requiredScope:'meeting:schedules_read',items:[{id:'m',title:'Synthetic imminent meeting',start,end:new Date(Date.now()+3600000).toISOString(),meetingType:'scheduledMeeting',meetingState:'scheduled',joinable:false,joinReason:'link-unavailable'}]};publish();return reply(null);
    }
    if(req.method==='messages.send'){
      write({jsonrpc:'2.0',method:'delivery',params:{requestId:p.requestId,roomId:p.roomId,status:'sent',message:'Synthetic local delivery',messageId:'own'}});
      state.messages=[...state.messages,msg('own',p.text)];publish();return reply(null);
    }
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'mark_read_on_open': 0, 'read_status': 1, 'notifications': {'preview': 0}, 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 7
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
let s:acks = 0
function! s:ack(response) abort
  let s:acks += 1
endfunction
function! s:publish(method, params) abort
  let expected = s:acks + 1
  call wbx#rpc(a:method, a:params, function('s:ack'))
  call WaitFor('s:acks == ' . expected)
endfunction
function! s:editors() abort
  return wbx#notifications#status().submitted.editor
endfunction
try
  call assert_equal('editor', wbx#notifications#status().mode)
  call assert_true(wbx#notifications#status().enabled, 'notifications are enabled without setup overrides')
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 2')
  call cursor(index(b:wbx_room_ids, 'r') + 1, 1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  let history = win_getid()
  let draft = wbx#buffers().drafts.r
  WebexCompose
  call setline(1, 'Unsent draft survives notifications')
  let compose = win_getid()
  let tick = b:changedtick
  let view = winsaveview()
  sleep 350m
  call assert_equal(0, s:editors(), 'startup rooms/history do not alert')
  call s:publish('test.message', {'id': 'first'})
  call s:publish('test.message', {'id': 'second'})
  call WaitFor('s:editors() == 1')
  if has('nvim')
    call assert_equal('2 new messages', g:wbx_notification_records[0].body)
    call assert_notmatch('PRIVATE', string(g:wbx_notification_records))
  endif
  call assert_equal(compose, win_getid())
  call assert_equal(tick, b:changedtick)
  call assert_equal(view, winsaveview())
  call assert_equal(['Unsent draft survives notifications'], getbufline(draft, 1, '$'))
  call s:publish('test.publish', {})
  sleep 300m
  call assert_equal(1, s:editors(), 'unchanged polling is quiet')
  WebexSend
  call WaitFor('!get(wbx#state(), "sending", 0) && len(wbx#state().messages) == 4')
  sleep 300m
  call assert_equal(1, s:editors(), 'exact successful own-send identity is excluded')
  call setline(1, 'Second retained draft')
  call win_gotoid(history)
  setlocal nofoldenable
  normal! G
  call s:publish('test.message', {'id': 'visible'})
  sleep 300m
  call assert_equal(1 + s:visible_extra, s:editors(), s:visible ? 'focused latest visible body is quiet' : 'undrawn Vim cannot suppress an alert using nonexistent visibility evidence')
  call win_gotoid(compose)
  call s:publish('test.publish', {'rooms': [{'id': 'r', 'title': 'Synthetic r', 'type': 'group', 'unread': v:false}, {'id': 'other', 'title': 'Synthetic other', 'type': 'group', 'unread': v:true}]})
  call WaitFor('s:editors() == 2 + s:visible_extra')
  if has('nvim') | call assert_equal('Space became unread (unread sync)', g:wbx_notification_records[-1].body) | endif
  call s:publish('test.meeting', {'ahead': 300})
  call WaitFor('s:editors() == 3 + s:visible_extra')
  if has('nvim') | call assert_match('Meeting starts in 5 min', g:wbx_notification_records[-1].body) | endif
  call s:publish('test.publish', {})
  sleep 300m
  call assert_equal(3 + s:visible_extra, s:editors(), 'meeting polls cannot duplicate a phase')
  call s:publish('test.meeting', {'ahead': 0})
  call WaitFor('s:editors() == 4 + s:visible_extra')
  if has('nvim') | call assert_equal('Meeting starts now', g:wbx_notification_records[-1].body) | endif
  WebexNotificationsMute 1
  call s:publish('test.message', {'id': 'muted'})
  sleep 300m
  call assert_equal(4 + s:visible_extra, s:editors())
  WebexNotificationsResume
  call s:publish('test.publish', {})
  sleep 300m
  call assert_equal(4 + s:visible_extra, s:editors(), 'resume does not replay messages')
  call s:publish('test.meeting', {'ahead': 1})
  call s:publish('test.publish', {'upcomingMeetings': {'state': 'ready', 'revision': 100, 'complete': v:true, 'coverage': 'webex-current-series', 'requiredScope': 'meeting:schedules_read', 'observedAt': localtime() * 1000, 'items': []}})
  sleep 1300m
  call assert_equal(4 + s:visible_extra, s:editors(), 'cancelled occurrence is removed from the pending notification queue')
  let g:wbx_tui.notifications = v:false
  call s:publish('test.message', {'id': 'disabled'})
  sleep 300m
  call assert_equal(4 + s:visible_extra, s:editors())
  let g:wbx_tui.notifications = {'preview': 1}
  call s:publish('test.message', {'id': 'preview-first', 'text': 'First coalesced excerpt'})
  call s:publish('test.message', {'id': 'preview', 'text': "Preview\n" . nr2char(27) . '[31m literal;$(never-run)'})
  call WaitFor('s:editors() == 5 + s:visible_extra')
  if has('nvim')
    call assert_equal('Preview [31m literal;$(never-run)', g:wbx_notification_records[-1].body, 'coalesced previews show only the excerpt, without a generated label or count')
    call assert_match('literal;$(never-run)', g:wbx_notification_records[-1].body)
    call assert_notmatch('[\x00-\x1f]', g:wbx_notification_records[-1].body)
  endif
  call s:publish('test.message', {'id': 'disconnect-pending'})
  WebexDisconnect
  sleep 400m
  call assert_equal(5 + s:visible_extra, s:editors(), 'disconnect cancels pending dispatch and late ready snapshots')
  call assert_equal(['Second retained draft'], getbufline(draft, 1, '$'))
  let methods = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal(1, count(methods, 'messages.send'), 'only the explicit synthetic send test posted')
  call assert_equal(0, count(methods, 'rooms.read'))
  call assert_equal(0, count(methods, 'meeting.joinUpcoming'))
  call assert_equal(0, count(methods, 'meeting.start'))
  call assert_equal(0, count(methods, 'meetings.upcoming'), 'notifications do not add provider polling')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'positive_visibility': s:visible ? 'visible-body alert suppression exercised' : 'NOT RUN: undrawn Vim; fail-closed alert delivery exercised'})], $WBX_EDITOR_RESULT)
qa!
