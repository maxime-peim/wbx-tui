" Native default-on/opt-out/capability negotiation and routing, fake RPC only.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_notification_records = []
if has('nvim')
  lua vim.notify = function(body, _, opts) local log=vim.g.wbx_notification_records;log[#log+1]={body=body,title=opts.title};vim.g.wbx_notification_records=log end
endif
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const senders=process.argv[2]==='senders', modern=senders||process.argv[2]==='modern', excerpt='Hello from another space <tag> & literal;$(never-run)';
  const rooms=[{id:'other',title:'Other',type:'group',unread:false}];
  let revision=0,state={revision,state:'idle',mode:'demo',ready:false,rooms:[],messages:[],room:null};
  const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),p=req.params||{},reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify(req)+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:[...(modern?['notification-previews']:[]),...(senders?['sender-names-v1']:[])],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){
      state={...state,state:'ready',readStatus:'ready',rooms,...(p.senderNames?{senderNames:true}:{}),messageEvents:{state:'live',received:0,items:[],...(p.notificationPreview?{preview:true}:{}),...(p.senderNames&&p.notificationPreview?{senderNames:true}:{})}};publish();reply(null);
      return setTimeout(()=>{state.messageEvents.received=1;state.messageEvents.items=[{id:'new',roomId:'other',created:new Date().toISOString(),observedAt:Date.now(),self:false,...(p.notificationPreview?{preview:excerpt}:{}),...(p.senderNames&&p.notificationPreview?{senderName:'Alice'}:{})}];publish();},60);
    }
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
function! WaitFor(expression) abort
  let start=reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: '.a:expression
endfunction
try
  let g:wbx_tui = {}
  call assert_true(wbx#notifications#status().preview, 'message excerpts are enabled by default')
  call assert_true(wbx#notifications#status().sender_names, 'sender names default on with explicit privacy opt-out')
  for case in [{'modern': 1}, {'preview': 0, 'modern': 1}, {'preview': 1, 'modern': 1}, {'modern': 0}, {'preview': 1, 'modern': 0},
        \ {'modern': 1, 'sender_names': 1}, {'modern': 1, 'senders': 1, 'sender_names': 1}, {'modern': 1, 'senders': 1, 'sender_names': 1, 'preview': 0},
        \ {'modern': 1, 'senders': 1, 'sender_names': 1, 'read_status': 0},
        \ {'modern': 1, 'senders': 1}, {'modern': 1, 'senders': 1, 'sender_names': 0}]
    let g:wbx_tui = {'read_status': 1, 'mark_read_on_open': 0, 'upcoming_meetings': 0,
          \ 'notifications': {'mode': 'editor'},
          \ 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs', get(case, 'senders', 0) ? 'senders' : case.modern ? 'modern' : 'legacy']}
    if has_key(case, 'preview') | let g:wbx_tui.notifications.preview = case.preview | endif
    if has_key(case, 'sender_names') | let g:wbx_tui.notifications.sender_names = case.sender_names | endif
    let g:wbx_tui.read_status = get(case, 'read_status', 1)
    let expected = wbx#notifications#status().submitted.editor + 1
    WebexDemo
    call WaitFor('wbx#notifications#status().submitted.editor == ' . expected)
    let starts = filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "session.start"')
    let consent = get(case, 'read_status', 1) && get(case, 'preview', 1) && case.modern
    let names = get(case, 'preview', 1) && get(case, 'senders', 0) && get(case, 'sender_names', 1)
    call assert_equal(consent, get(starts[-1].params, 'notificationPreview', 0) ? 1 : 0, 'excerpt consent is explicit and stripped for older backends')
    call assert_equal(consent, has_key(wbx#state().messageEvents.items[0], 'preview') ? 1 : 0)
    call assert_equal(names, get(starts[-1].params, 'senderNames', 0) ? 1 : 0, 'name consent follows defaults/opt-outs and is stripped for older backends')
    call assert_equal(names && consent, has_key(wbx#state().messageEvents.items[0], 'senderName') ? 1 : 0)
    if has('nvim')
      call assert_equal(consent ? (names ? 'Alice: ' : '') . 'Hello from another space <tag> & literal;$(never-run)' : 'New message', g:wbx_notification_records[-1].body, 'only independently consented names prefix the excerpt')
    endif
    call assert_notmatch('Hello from another', string(wbx#notifications#status()), 'health never includes excerpts')
    call wbx#shutdown()
  endfor
  let methods=map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal(0, count(methods, 'rooms.read'))
  call assert_equal(0, count(methods, 'messages.send'))
  call assert_equal(0, count(methods, 'messages.list'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
