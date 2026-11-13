" Native all-visible relevance projection with an inert synthetic worker.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime test/editor/helpers/presence.vim
syntax on
runtime plugin/wbx.vim
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const rooms=Array.from({length:14},(_,i)=>({id:'visible-'+i,title:'Person '+i,type:'direct'}));
  let revision=0,state={revision,state:'idle',mode:'demo',room:null,rooms:[],messages:[],ready:false};
  const write=x=>process.stdout.write(JSON.stringify(x)+'\n');
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method,...req.params})+'\n');
    if(req.method==='hello')return reply({version:1,peopleSpaces:['visible-v1'],peopleViewport:['paged-v1'],
      capabilities:['people-status','local-context-v1'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){
      state={...state,state:'ready',rooms,localContext:{sessionId:'a'.repeat(32),coverage:'session-only'},
        peopleStatus:{capability:'ready',state:'unknown',presence:'unknown',customStatus:'unsupported',reason:'not-selected'}};
    } else if(req.method==='people.viewport'){
      state.peopleViewport=req.params.roomIds.map(roomId=>({roomId,capability:'ready',state:'fresh',
        presence:'active',customStatus:'unsupported',observedAt:Date.now()}));
    } else if(req.method==='shutdown'){reply(null);return process.exit(0);}
    else return reply(null);
    state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'people_status': 1, 'read_status': 0, 'spaces_cache': 0, 'notifications': 0,
      \ 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 4 | sleep 10m | endwhile
  if !eval(a:expression) | throw 'Timeout: ' . a:expression | endif
endfunction
try
  WebexDemo
  call s:wait('len(get(wbx#state(), "peopleViewport", [])) == 14')
  call assert_equal(v:null, wbx#state().room, 'visible presence never opens a DM')
  call assert_equal([], wbx#state().messages)
  for id in ['visible-0', 'visible-8', 'visible-13']
    let cue = filter(WbxTestPresence(bufnr('%')), 'v:val.lnum == index(b:wbx_room_ids, id) + 1')[0]
    call assert_equal('WbxPresenceActive', cue.group, 'all visible cues keep their observations: ' . id)
  endfor
  let state = wbx#state()
  call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':state}))
  let state.peopleViewport[0].roomId = 'never-listed'
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':state}))
  let requests = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal(0, count(requests, 'people.spaces'), 'new clients do not silently retain the eight-row relevance cap')
  call assert_equal(0, count(requests, 'rooms.select'))
  let g:wbx_tui.people_status = 0
  call wbx#people#spaces_schedule()
  call s:wait('empty(get(wbx#state(), "peopleViewport", []))')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})], $WBX_EDITOR_RESULT)
qa!
