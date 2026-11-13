" Real native viewport signaling against an inert synthetic worker.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime test/editor/helpers/presence.vim
runtime plugin/wbx.vim
syntax on
let s:backend =<< trim END
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  const rooms = [{id:'group',title:'A group',type:'group'}, ...Array.from({length:14},(_,i)=>({id:'direct-'+i,title:'Person '+i,type:'direct'}))];
  let revision=0, state={revision,state:'idle',mode:'demo',room:null,rooms:[],messages:[],ready:false};
  const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  const status=id=>({capability:'ready',state:id==='direct-4'?'unknown':'fresh',presence:['active','DoNotDisturb','call','inactive','unknown'][Number(id.split('-')[1])%5],
    customStatus:'unsupported',roomId:id,observedAt:Date.now()});
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line), p=req.params||{}, reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method,...p})+'\n');
    if(req.method==='hello')return reply({version:1,peopleSpaces:['visible-v1'],capabilities:['people-status','local-context-v1'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){
      state={...state,state:'ready',rooms,localContext:{sessionId:'a'.repeat(32),coverage:'session-only'},
        peopleStatus:{capability:'ready',state:'unknown',presence:'unknown',customStatus:'unsupported',reason:'not-selected'}};
      publish();return reply(null);
    }
    if(req.method==='people.spaces'){state.peopleSpaces=p.roomIds.map(status);publish();return reply(null);}
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    if(req.method==='session.stop'){state={...state,state:'idle',rooms:[],peopleSpaces:[]};delete state.localContext;publish();}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo': 1, 'people_status': 1, 'read_status': 0, 'spaces_cache': 0, 'notifications': 0,
      \ 'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs']}
function! s:wait(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:requests() abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# "people.spaces"')
endfunction
try
  WebexDemo
  call s:wait('len(get(wbx#state(), "peopleSpaces", [])) == 8')
  let spaces = bufnr('%')
  let window = win_getid()
  call assert_equal(v:null, wbx#state().room, 'visible presence does not select/open a DM')
  call assert_equal([], wbx#state().messages, 'visible presence does not fetch history')
  call assert_equal(map(range(0, 7), '"direct-" . v:val'), s:requests()[-1].roomIds)
  for [id, group] in [['direct-0', 'WbxPresenceActive'], ['direct-1', 'WbxPresenceBusy'], ['direct-4', 'WbxPresenceUnknown']]
    let cue = filter(WbxTestPresence(spaces), 'v:val.lnum == index(b:wbx_room_ids, id) + 1')[0]
    call assert_equal(group, cue.group, 'cue follows exact peer status, never a guessed Busy state')
  endfor
  let valid = wbx#state()
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': valid}))
  let hello = {'version': 1, 'capabilities': ['people-status', 'local-context-v1'], 'peopleSpaces': ['visible-v1'],
        \ 'state': valid, 'meeting': {'active': v:false, 'ready': v:false}}
  call assert_true(wbx#protocol#hello(hello))
  let old_hello = deepcopy(hello) | call remove(old_hello, 'peopleSpaces')
  call assert_true(wbx#protocol#hello(old_hello), 'legacy hello without the submode stays valid')
  for patch in [{'peopleSpaces': 'visible-v1'}, {'peopleSpaces': ['future']}, {'capabilities': ['people-status']}]
    call assert_false(wbx#protocol#hello(extend(deepcopy(hello), patch)))
  endfor
  for change in ['duplicate', 'group', 'unlisted', 'secret', 'oversized']
    let bad = deepcopy(valid)
    if change ==# 'duplicate'
      call add(bad.peopleSpaces, deepcopy(bad.peopleSpaces[0]))
    elseif change ==# 'group'
      let bad.peopleSpaces[0].roomId = 'group'
    elseif change ==# 'unlisted'
      let bad.peopleSpaces[0].roomId = 'never-listed'
    elseif change ==# 'secret'
      let bad.peopleSpaces[0].personId = 'PRIVATE-ID'
    else
      let bad.peopleSpaces = repeat([bad.peopleSpaces[0]], 9)
    endif
    call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': bad}), change)
  endfor
  redraw!
  sleep 250m
  let request_count = len(s:requests())
  let reported = deepcopy(s:requests()[-1].roomIds)
  doautocmd CursorMoved
  sleep 250m
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call assert_equal(request_count, len(s:requests()), 'an unchanged drawn viewport adds no relevance RPC')
  elseif len(s:requests()) != request_count
    " Silent Ex can recompute its undrawn botline; it must still only report a
    " genuinely different set, never repeatedly probe the same rows.
    call assert_notequal(reported, s:requests()[-1].roomIds)
  endif
  call cursor(index(b:wbx_room_ids, 'direct-13') + 1, 1)
  doautocmd CursorMoved
  call s:wait('index(s:requests()[-1].roomIds, "direct-13") >= 0')
  call assert_true(len(s:requests()[-1].roomIds) <= 8, 'moving in the list replaces one bounded set, not a scan')
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call assert_equal(8, len(s:requests()[-1].roomIds), 'drawn/virtual view reports the full visible bounded set')
  endif
  call assert_equal(window, win_getid())
  call assert_equal(spaces, bufnr('%'))
  " Give the hide/restore case its own native top-of-list viewport. Silent Ex
  " can otherwise retain botline=last-1 while the cursor/topline is last.
  normal! ggzt
  redraw!
  tabnew
  call s:wait('empty(s:requests()[-1].roomIds)')
  tabprevious
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call s:wait('!empty(s:requests()[-1].roomIds)')
  else
    let geometry = getwininfo(window)[0]
    call assert_true(geometry.botline < geometry.topline, 'silent Ex has no valid restored drawn viewport')
    sleep 250m
    call assert_equal([], s:requests()[-1].roomIds, 'an invalid undrawn viewport never invents visible peers')
  endif
  call assert_equal(window, win_getid(), 'hidden/visible transitions never open or focus a conversation')
  let g:wbx_tui.people_status = 0
  call wbx#people#spaces_schedule()
  call s:wait('empty(s:requests()[-1].roomIds)')
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call s:wait('empty(get(b:, "wbx_presence_rows", []))')
  endif
  let g:wbx_tui.people_status = 1
  call wbx#people#spaces_schedule()
  if has('nvim') || $WBX_EDITOR_SCREEN ==# '1'
    call s:wait('!empty(s:requests()[-1].roomIds)')
  endif
  setlocal modifiable
  call setline(1, 'My annotated spaces view')
  setlocal nomodified nomodifiable
  let retained = [win_getid(), b:changedtick, getline(1, '$'), undotree()]
  doautocmd TextChanged
  call s:wait('empty(s:requests()[-1].roomIds)')
  call assert_equal(retained, [win_getid(), b:changedtick, getline(1, '$'), undotree()],
        \ 'an annotated nofile view stops relevance without replacement, undo synchronization or focus work')
  let requests = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  for method in ['rooms.select', 'messages.list', 'messages.send', 'rooms.read', 'people.lookup']
    call assert_equal(0, count(requests, method), 'list presence never invokes ' . method)
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
  call add(v:errors, 'Synthetic viewport diagnostics: ' . json_encode({'windows': getwininfo(),
        \ 'requests': s:requests(), 'buffer': bufnr('%'), 'name': bufname('%'), 'tick': b:changedtick,
        \ 'render': get(b:, 'wbx_render_tick', -1)}))
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
