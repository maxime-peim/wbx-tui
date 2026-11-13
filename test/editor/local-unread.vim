" Explicit open display and non-selected activity notifications, fake RPC only.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
filetype plugin on
syntax enable
let g:wbx_notification_records = []
if has('nvim')
  lua vim.notify = function(body, _, opts) local log=vim.g.wbx_notification_records;log[#log+1]={body=body,title=opts.title};vim.g.wbx_notification_records=log end
endif
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const at='2026-11-11T12:00:00.000Z';
  let revision=0, fail=false;
  const rooms=['a','b','c'].map(id=>({id,title:'Synthetic '+id,type:'group',unread:true,unreadActivity:at,lastActivity:at}));
  let state={revision,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),p=req.params||{},reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method})+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:['same-space-resume'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){state={...state,state:'ready',readStatus:'ready',rooms};publish();return reply(null);}
    if(req.method==='test.fail'){fail=true;return reply(null);}
    if(req.method==='rooms.select'){
      if(fail){fail=false;return write({jsonrpc:'2.0',id:req.id,error:{code:-1,message:'Synthetic open failure'}});}
      return setTimeout(()=>{state={...state,room:state.rooms.find(r=>r.id===p.roomId),ready:true,historyLatest:true,messages:[{id:'message-'+p.roomId,author:'Synthetic',created:at,text:'Original body'}]};publish();reply(null);},60);
    }
    if(req.method==='test.publish'){state={...state,...p};if(state.room)state.room=state.rooms.find(r=>r.id===state.room.id)||state.room;publish();return reply(null);}
    if(req.method==='session.stop'){state={...state,state:'idle',ready:false,room:null,messages:[]};publish();return reply(null);}
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'read_status': 1, 'mark_read_on_open': 0, 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
call setline(1, 'Unrelated work')
let s:ordinary = win_getid()
function! WaitFor(expression) abort
  let start=reltime()
  while reltimefloat(reltime(start)) < 7
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
let s:acks=0
function! s:ack(response) abort
  let s:acks+=1
endfunction
function! s:publish(params) abort
  let expected=s:acks+1
  call wbx#rpc('test.publish', a:params, function('s:ack'))
  call WaitFor('s:acks == '.expected)
endfunction
function! s:unread(id) abort
  let buffer=wbx#buffers().rooms
  return index(getbufvar(buffer,'wbx_unread_rows'),index(getbufvar(buffer,'wbx_room_ids'),a:id)+1)>=0
endfunction
function! s:open(id) abort
  call win_gotoid(s:explorer)
  call cursor(index(b:wbx_room_ids,a:id)+1,1)
  execute "normal \<CR>"
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && wbx#state().room.id ==# "' . a:id . '"')
endfunction
try
  WebexDemo
  call WaitFor('len(wbx#state().rooms)==3')
  let s:explorer=win_getid()
  call assert_true(s:unread('a'))
  call s:open('a')
  call assert_false(s:unread('a'), 'opening clears local emphasis with mark_read_on_open disabled')
  call assert_true(wbx#state().rooms[0].unread, 'authoritative unread=true is preserved separately')
  call assert_match('locally read', wbx#status())
  let room_tick=getbufvar(wbx#buffers().rooms,'changedtick')
  let reader=win_getid()
  let view=winsaveview()
  call s:publish({})
  call assert_false(s:unread('a'), 'an unchanged SDK snapshot does not restore the old unread flag')
  call assert_equal(room_tick,getbufvar(wbx#buffers().rooms,'changedtick'))
  call assert_equal(view,winsaveview())
  call assert_equal(reader,win_getid())
  let rooms=wbx#state().rooms
  for item in rooms | let item.unreadStale=v:true | endfor
  call s:publish({'rooms':rooms,'readStatus':'failed'})
  call assert_false(s:unread('a'))
  normal R
  call assert_false(s:unread('a'), 'a refused receipt cannot undo local read display')
  call wbx#select('b',0)
  call WaitFor('wbx#state().room.id ==# "b"')
  call assert_true(s:unread('b'), 'focus-neutral selection is not a successful explicit open')
  call s:open('b')
  call assert_false(s:unread('b'), 'resuming the loaded space also clears locally during an outage')
  WebexCompose
  let draft=bufnr('%')
  call setline(1,'Retained draft')
  let draft_tick=b:changedtick
  let focus=win_getid()
  let rooms=wbx#state().rooms
  for item in rooms | let item.unreadStale=v:false | endfor
  call s:publish({'rooms':rooms,'readStatus':'ready'})
  sleep 300m
  call assert_equal(0,wbx#notifications#status().submitted.editor,'SDK recovery establishes a notification baseline')
  let rooms[0].unreadActivity='2026-11-11T12:01:00.000Z'
  call s:publish({'rooms':rooms})
  call WaitFor('wbx#notifications#status().submitted.editor==1')
  call assert_true(s:unread('a'),'new SDK activity restores unread in a different, already-unread space')
  call assert_equal('b',wbx#state().room.id,'the notification never opens its target space')
  call assert_equal(focus,win_getid())
  call assert_equal(draft_tick,getbufvar(draft,'changedtick'))
  if has('nvim')
    call assert_equal('Webex · Synthetic a',g:wbx_notification_records[-1].title)
    call assert_equal('New unread activity (unread sync)',g:wbx_notification_records[-1].body)
  endif
  call s:publish({})
  sleep 300m
  call assert_equal(1,wbx#notifications#status().submitted.editor,'same timestamp cannot repeat an alert')
  call s:open('a')
  call assert_false(s:unread('a'))
  call wbx#select('b',0)
  call WaitFor('wbx#state().room.id ==# "b"')
  let rooms=wbx#state().rooms
  let rooms[0].lastActivity='2027-01-01T00:00:00.000Z'
  call s:publish({'rooms':rooms})
  sleep 300m
  call assert_false(s:unread('a'),'REST ordering metadata cannot invalidate a local read')
  call assert_equal(1,wbx#notifications#status().submitted.editor)
  let rooms[0].unreadActivity='2026-11-11T12:02:00.000Z'
  call s:publish({'rooms':rooms})
  call WaitFor('wbx#notifications#status().submitted.editor==2')
  call assert_true(s:unread('a'),'each fresh SDK advance can alert even while unread stays true')
  let s:expected=s:acks+1
  call wbx#rpc('test.fail',{},function('s:ack'))
  call WaitFor('s:acks == s:expected')
  call win_gotoid(s:explorer)
  call cursor(index(b:wbx_room_ids,'c')+1,1)
  execute "normal \<CR>"
  sleep 100m
  call assert_true(s:unread('c'),'failed selection cannot clear a room')
  execute "normal \<CR>"
  call win_gotoid(s:ordinary)
  sleep 150m
  call assert_true(s:unread('c'),'cancelled focus cannot clear a room')
  call assert_equal(s:ordinary,win_getid())
  let state=wbx#state()
  let state.rooms[0].unreadActivity='not-a-timestamp'
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':state}))
  call assert_equal(['Retained draft'],getbufline(draft,1,'$'))
  WebexDisconnect
  call WaitFor('wbx#state().state ==# "idle"')
  call assert_equal(0,wbx#unread#status().tracked)
  let methods=map(readfile($WBX_EDITOR_AUDIT),'json_decode(v:val).method')
  call assert_equal(0,count(methods,'rooms.read'),'local presentation and non-selected alerts never issue receipts')
  call assert_equal(0,count(methods,'messages.send'))
  call assert_equal(0,count(methods,'messages.list'),'notifications never fetch unselected histories')
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
