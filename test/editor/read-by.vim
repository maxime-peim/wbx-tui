" Actual native read-by flow against an inert delayed worker; no SDK/network.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=55 columns=140
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  let revision=0,mode='ok',watching=false;
  const rooms=[{id:'read-room',title:'Reader fixture',type:'group',unread:true},{id:'other-room',title:'Person fixture',type:'direct',unread:true}];
  const messages=Array.from({length:40},(_,i)=>({id:'read-'+i,author:'Synthetic',created:'2026-11-19T08:00:00.000Z',text:'Body '+i}));
  let state={revision,state:'idle',mode:'demo',ready:false,room:null,rooms:[],messages:[],
    readStatus:'ready',reactionSource:{epoch:1,revision:0,degraded:false}};
  const write=x=>process.stdout.write(JSON.stringify(x)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),p=req.params||{},reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method,...p})+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:['messaging','local-context-v1','message-actions-v1'],
      messageReaders:process.env.WBX_READ_BY_LEGACY==='1'?['watermark-v1']:['watermark-v1','seen-events-v1'],
      messageReactions:['pinned-internal-v1'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start'){
      state={...state,state:'ready',rooms,localContext:{sessionId:'a'.repeat(32),coverage:'session-only'}};
      publish();return reply(null);
    }
    if(req.method==='rooms.select'){
      state={...state,room:rooms.find(r=>r.id===p.roomId),messages:[],ready:false};publish();
      setTimeout(()=>{state={...state,messages:p.roomId==='read-room'?messages:messages.map(m=>({...m,id:'other-'+m.id})),ready:true};publish();reply(null);},20);
      return;
    }
    if(req.method==='fixture.mode'){mode=p.mode;return reply(null);}
    if(req.method==='fixture.source'){
      state.reactionSource.epoch++;publish();return reply(null);
    }
    if(req.method==='fixture.redraw'){publish();return reply(null);}
    if(req.method==='fixture.seen'){
      if(watching) for(let i=0;i<(p.count||1);i++) write({jsonrpc:'2.0',method:'messages.readersChanged',
        params:{roomId:state.room.id,sessionId:state.localContext.sessionId,sourceEpoch:state.reactionSource.epoch,
          sourceRevision:state.reactionSource.revision,...p.patch}});
      return reply(null);
    }
    if(req.method==='fixture.edit'){
      state.messages[0].text='Changed source body';publish();return reply(null);
    }
    if(req.method==='messages.readBy'){
      if(p.watch===true)watching=true;
      const current=mode;
      if(current==='denied')return write({jsonrpc:'2.0',id:req.id,error:{code:-32034,message:'Read receipts unavailable.'}});
      const result={roomId:p.roomId,messageId:p.messageId,coverage:'space-read-watermark',
        observedAt:Date.now()-(current==='old'?300001:0),partial:current==='partial',
        readers:current==='empty'?[]:p.roomId==='other-room'?[{personId:'reader-person',...(current==='unnamed'?{}:{name:current==='pushed'?'Direct Updated':'Direct Person'})}]:
          [{personId:'reader-alice',name:current==='unicode'?'読者の長い名前読者の長い名前読者の長い名前':'Alice Example'},
          current==='partial'?{personId:'reader-unknown'}:{personId:'reader-bob',name:current==='pushed'?'Casey Updated':'Bob Chen'}]};
      setTimeout(()=>reply(result),current==='fast'?0:140);return;
    }
    if(req.method==='shutdown'){reply(null);return process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend,$WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'demo':1,'backend':[$WBX_NODE,$WBX_EDITOR_RESULT . '.backend.mjs'],'read_status':1,'reactions':0,
      \ 'people_status':0,'sender_names':0,'spaces_cache':0,'images':0,'notifications':0,'upcoming_meetings':0,'mark_read_on_open':1}
runtime plugin/wbx.vim
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 4 | sleep 10m | endwhile
  if !eval(a:expression) | throw 'Timeout: ' . a:expression | endif
endfunction
function! s:ack(response) abort
  let g:read_by_ack = 1
endfunction
function! s:mode(mode) abort
  let g:read_by_ack = 0
  call wbx#rpc('fixture.mode',{'mode':a:mode},function('s:ack'))
  call s:wait('g:read_by_ack')
endfunction
function! s:hint(params) abort
  let g:read_by_ack = 0
  call wbx#rpc('fixture.seen',a:params,function('s:ack'))
  call s:wait('g:read_by_ack')
endfunction
function! s:choose(index) abort
  let block = b:wbx_message_blocks[a:index]
  call cursor(block.body,1)
  normal! zR
  return block
endfunction
function! s:requests() abort
  return filter(map(readfile($WBX_EDITOR_AUDIT),'json_decode(v:val)'),'v:val.method ==# "messages.readBy"')
endfunction
function! s:open(index) abort
  call s:choose(a:index)
  WebexReadBy
  call s:wait('!wbx#read_by#busy()')
  call assert_equal(s:history,bufnr('%'),'inspection never opens or focuses a separate list')
  call assert_equal(b:wbx_message_blocks[a:index].id,get(s:badge(),'messageId',''))
  if get(s:badge(),'foldable',0) && !s:badge().expanded | WebexReadByToggle | endif
endfunction
function! s:badge() abort
  return get(getbufvar(s:history,'wbx_reaction_decorations',{}),"\nread-by",{})
endfunction
function! s:screen() abort
  let rows = []
  for row in range(1,&lines)
    call add(rows,join(map(range(1,&columns),'screenstring(row,v:val)'),''))
  endfor
  return join(rows,"\n")
endfunction
function! s:idle() abort
endfunction
function! s:drawn() abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  let view = winsaveview()
  if s:badge().expanded | WebexReadByToggle | endif
  normal! Gzt
  redraw!
  call assert_match('Read by 2 \[+\]',s:screen(),'collapsed group count is actually drawn')
  call assert_notmatch('Alice Example\|Bob Chen',s:screen(),'collapsed reader names are not drawn')
  WebexReadByToggle
  normal! Gzt
  redraw!
  call assert_match('Alice Example',s:screen(),'expanded reader names are actually drawn at the end of the feed')
  call assert_match('Bob Chen',s:screen())
  let info = getwininfo(win_getid())[0]
  let first = info.wincol+get(info,'textoff',0)
  let row = screenpos(win_getid(),line('$'),1).row+2
  let drawn = join(map(range(first,info.wincol+info.width-1),'screenstring(row,v:val)'),'')
  let names = 'Alice Example'
  call assert_equal(names,trim(drawn),'centered names occupy their own footer row')
  call assert_true(abs(match(drawn,'\S')-(info.width-get(info,'textoff',0)-strdisplaywidth(names))/2) <= 1,'visible names are centered in the history text area')
  call winrestview(view)
endfunction
try
  let hint = {'jsonrpc':'2.0','method':'messages.readersChanged','params':{'roomId':'read-room','sessionId':repeat('a',32),'sourceEpoch':1,'sourceRevision':0}}
  call assert_true(wbx#protocol#valid(hint))
  for patch in [{'personId':'PRIVATE'},{'readers':[]},{'sessionId':'bad'},{'sourceEpoch':-1},{'sourceRevision':'0'}]
    call assert_false(wbx#protocol#valid(extend(deepcopy(hint),{'params':extend(copy(hint.params),patch)})),'live hints have a closed, identity-free shape')
  endfor
  WebexDemo
  call s:wait('get(wbx#state(),"state","") ==# "ready"')
  call wbx#rpc('rooms.select',{'roomId':'read-room'})
  call s:wait('get(wbx#state(),"ready",0) && len(getbufvar(wbx#buffers().history,"wbx_message_blocks",[])) == 40')
  let s:history = wbx#buffers().history
  WebexCompose
  call setline(1,'Unsent draft while readers load')
  let opening_draft = [win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree()]
  call s:wait('!wbx#read_by#busy() && !empty(s:badge())')
  call assert_equal(opening_draft,[win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree()],'automatic read survives cursor/focus changes without touching the composer')
  call win_gotoid(win_findbuf(s:history)[0])
  call s:wait('!wbx#read_by#busy() && !empty(s:badge())')
  call assert_equal(1,len(s:requests()),'opening a room fetches one read-through snapshot')
  call assert_equal('read-39',s:requests()[0].messageId,'automatic inspection targets the latest loaded message, not the cursor')
  call assert_equal(['Read by 2 [+]'],s:badge().lines,'group readers start folded')
  call assert_notmatch('Body 39\|Alice Example\|Bob Chen',s:badge().text,'the compact footer repeats no message or reader list')
  call feedkeys("\<Esc>",'xt')
  let fold_requests = len(s:requests())
  let fold_native = [win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree(),getcurpos(),winsaveview(),&l:foldmethod]
  call assert_match('wbx#commands#invoke',maparg(get(g:,'mapleader','\') . 'WaV','n'))
  call feedkeys(get(g:,'mapleader','\') . 'WaV','xt')
  call assert_true(s:badge().expanded)
  call assert_match('Alice Example.*Bob Chen',s:badge().text,'expanding discloses names without repeating the message')
  call assert_notmatch('Body 39',s:badge().text)
  call assert_equal(fold_requests,len(s:requests()),'folding is entirely local, without a read or receipt')
  call assert_equal(fold_native,[win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree(),getcurpos(),winsaveview(),&l:foldmethod],'reader disclosure preserves native work, cursor and message-fold options')
  if $WBX_READ_BY_LEGACY !=# '1'
    call assert_true(s:requests()[0].watch,'new clients opt into negotiated reader hints')
    WebexCompose
    let live_draft = [win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree(),winsaveview()]
    let s:live_reads = len(s:requests())
    call s:mode('pushed') | call s:hint({'count':100})
    call assert_match('stale',s:badge().text,'a hint marks old evidence stale, never adds an unverified reader')
    sleep 150m
    call assert_equal(s:live_reads,len(s:requests()),'a burst coalesces before starting any read')
    call s:wait('len(s:requests()) == s:live_reads+1 && wbx#read_by#busy()')
    call win_execute(win_findbuf(s:history)[0],'WebexReadByToggle')
    call assert_false(s:badge().expanded,'a reader list can be folded during an admitted live read')
    call s:wait('len(s:requests()) == s:live_reads+1 && !wbx#read_by#busy()')
    call assert_false(s:badge().expanded,'a delayed live result preserves the newest fold choice')
    call assert_notmatch('Casey Updated',s:badge().text,'live updates cannot unfold a group reader list')
    call win_execute(win_findbuf(s:history)[0],'WebexReadByToggle')
    call assert_match('Casey Updated',s:badge().text,'live query replaces reader names without a command')
    call assert_equal('read-39',s:requests()[-1].messageId,'live reads retain the exact footer message, not the composer/cursor')
    call assert_equal(live_draft,[win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree(),winsaveview()],'live update preserves draft/full undo/focus/view')
    sleep 1100m
    call assert_equal(s:live_reads+1,len(s:requests()),'no timer polls after a settled event-driven refresh')
    for patch in [{'sessionId':repeat('b',32)},{'roomId':'other-room'},{'sourceEpoch':999},{'sourceRevision':999}]
      call s:hint({'patch':patch})
    endfor
    sleep 1100m
    call assert_equal(s:live_reads+1,len(s:requests()),'foreign session/room/source hints cannot fetch or change the footer')
    call s:mode('denied') | call s:hint({})
    call s:wait('len(s:requests()) == s:live_reads+2 && !wbx#read_by#busy()')
    call assert_match('stale.*Casey Updated',s:badge().text,'a failed live refresh retains disclosed readers as stale')
    sleep 1100m
    call assert_equal(s:live_reads+2,len(s:requests()),'failed live reads never start a retry/polling loop')
    call win_gotoid(win_findbuf(s:history)[0])
    call s:mode('ok')
  else
    call assert_false(has_key(s:requests()[0],'watch'),'legacy backends receive the original read-only request shape')
  endif
  call s:choose(0)
  call assert_match('WebexReadBy',maparg('<leader>Wav','n'))
  call assert_match('WebexRemoveMember',maparg('<leader>Wnr','n'),'member removal keeps its original key')
  call feedkeys("\<Esc>",'xt')
  setlocal foldmethod=manual
  10,20fold
  call cursor(b:wbx_message_blocks[0].body,1)
  let native = [getline(1,'$'),b:changedtick,undotree(),getcurpos(),winsaveview(),&l:foldmethod,foldclosed(10),foldclosedend(10)]
  let s:start_reads = len(s:requests())
  WebexReadBy
  call assert_match('read-by: loading',wbx#buffer_status(),'foreground feedback is immediate and window-local')
  call s:wait('len(s:requests()) == s:start_reads+1')
  let request_count = len(s:requests())
  WebexReadBy
  call s:wait('!wbx#read_by#busy()')
  call assert_equal(request_count > 0 ? request_count : 1,len(s:requests()),'repeated invocation does not admit another request')
  call assert_equal('read-0',s:badge().messageId,'the exact inspected message stays bound in metadata')
  call assert_equal(['Read by 2 [+]'],s:badge().lines,'a newly inspected message has its own collapsed reader list')
  WebexReadByToggle
  call assert_match('Alice Example.*Bob Chen',s:badge().text)
  call assert_notmatch('Body 0',s:badge().text,'the message is never repeated in expanded reader details')
  call assert_notmatch('reader-alice\|reader-bob',s:badge().text,'visible footer contains no person IDs')
  call assert_equal(line('$')+1,s:badge().row,'reader names follow the entire feed, not a message reaction row')
  call assert_equal(-1,bufnr('wbx://read-by'),'no reader-list buffer is created')
  call assert_equal(native,[getline(1,'$'),b:changedtick,undotree(),getcurpos(),winsaveview(),&l:foldmethod,foldclosed(10),foldclosedend(10)],'footer preserves native text, undo, folds, focus and reading position')
  call s:drawn()
  call wbx#reaction_history#suspend(function('s:idle'))
  let g:wbx_tui.reactions = 1
  call wbx#reaction_history#accept({'roomId':'read-room','messageId':'read-0','observedAt':localtime()*1000,'partial':v:true,
        \ 'unknown':v:false,'groups':[{'reaction':'heart','label':'Heart','count':1,'mine':v:true}]})
  call assert_match('(you)',b:wbx_reaction_decorations['read-0'].text,'reader footer preserves own-reaction identification')
  call assert_notmatch('Read by',b:wbx_reaction_decorations['read-0'].text,'readers are no longer appended to reaction chips')
  call s:drawn()
  vsplit
  vertical resize 20
  call wbx#read_by#check()
  call assert_true(len(s:badge().lines) > 3,'narrow splits wrap names without clipping')
  call assert_match('Alice Example',join(s:badge().lines,' '),'narrow layout does not truncate names')
  for chunks in s:badge().chunks | call assert_true(strdisplaywidth(chunks[0][0]) <= 20) | endfor
  call s:mode('unicode') | call s:open(0)
  call assert_match('読者',s:badge().text,'wide Unicode names remain intact')
  for chunks in s:badge().chunks | call assert_true(strdisplaywidth(chunks[0][0]) <= 20,'Unicode wrapping uses display cells, not bytes') | endfor
  close
  call s:mode('ok') | call s:open(0)
  let g:wbx_tui.reactions = 0
  call wbx#reaction_history#resume()
  call wbx#read_by#check()
  if !has('nvim')
    let types = filter(['WbxHistoryReadBy','WbxHistoryReadByStale'],'!empty(prop_type_get(v:val,{"bufnr":bufnr("%")}))')
    let properties = prop_list(1,{'end_lnum':-1,'types':types})
    call assert_equal(len(s:badge().lines),len(properties),'shared repaint does not accumulate old Vim reader properties')
  endif
  if $WBX_READ_BY_LEGACY !=# '1'
    let s:live_reads = len(s:requests())
    WebexReadBy
    call s:wait('len(s:requests()) == s:live_reads+1')
    call s:mode('pushed') | call s:hint({'count':100})
    call s:wait('len(s:requests()) == s:live_reads+2 && !wbx#read_by#busy()')
    call assert_match('Casey Updated',s:badge().text,'hints during an admitted read cause one serialized follow-up')
    call assert_equal('read-0',s:badge().messageId)
    let s:live_reads = len(s:requests())
    call s:hint({})
    call s:mode('ok') | call s:open(5)
    sleep 1100m
    call assert_equal(s:live_reads+1,len(s:requests()),'a new explicit target supersedes queued live work rather than restoring an older footer')
    call assert_equal('read-5',s:badge().messageId)
  endif
  let previous_reads = len(s:requests())
  call wbx#rpc('rooms.select',{'roomId':'other-room'})
  call s:wait('get(get(wbx#state(),"room",{}),"id","") ==# "other-room" && get(wbx#state(),"ready",0)')
  call s:wait('!wbx#read_by#busy() && get(s:badge(),"messageId","") ==# "other-read-39"')
  call assert_equal(previous_reads+1,len(s:requests()),'opening a personal space also fetches once without a command')
  call assert_match('Direct Person',s:badge().text)
  if $WBX_READ_BY_LEGACY !=# '1'
    let s:live_reads = len(s:requests())
    call s:mode('pushed') | call s:hint({})
    call s:wait('len(s:requests()) == s:live_reads+1 && !wbx#read_by#busy()')
    call assert_match('Direct Updated',s:badge().text,'personal spaces receive live reader updates too')
    call assert_equal('other-read-39',s:badge().messageId)
    call s:mode('ok')
  endif
  call s:open(0)
  call assert_equal('direct',wbx#state().room.type)
  call assert_equal(['Read by Direct Person'],s:badge().lines,'a personal footer is a single name, without a count or repeated message')
  call assert_false(s:badge().foldable)
  let direct_requests = len(s:requests())
  WebexReadByToggle
  call assert_equal(['Read by Direct Person'],s:badge().lines,'a single direct reader needs no disclosure control')
  call assert_equal(direct_requests,len(s:requests()))
  call s:mode('unnamed') | call s:open(0)
  call assert_equal(['Read by Name unavailable'],s:badge().lines,'missing direct reader names are not inferred from the room title or presence')
  call s:mode('ok') | call s:open(0)
  call assert_equal('other-room',s:requests()[-1].roomId,'direct query keeps its exact room identity')
  call assert_true(wbx#state().room.unread,'reader inspection does not mark a direct discussion read')
  let previous_reads = len(s:requests())
  call wbx#rpc('rooms.select',{'roomId':'read-room'})
  call s:wait('get(get(wbx#state(),"room",{}),"id","") ==# "read-room" && get(wbx#state(),"ready",0)')
  call s:wait('!wbx#read_by#busy() && get(s:badge(),"messageId","") ==# "read-39"')
  call assert_match('Read by 2',s:badge().text,'return through loading states reuses only the same-source/content snapshot')
  call assert_equal(previous_reads+1,len(s:requests()),'reopening refreshes once, not on each redraw')
  let before = len(s:requests())
  for index in range(5)
    call cursor(index+1,1) | doautocmd CursorMoved
    call wbx#rpc('fixture.redraw',{})
  endfor
  sleep 220m
  call assert_equal(before,len(s:requests()),'cursor motion and repeated state renders never fetch read-by data')
  call wbx#rpc('rooms.select',{'roomId':'other-room'})
  call s:wait('len(s:requests()) == ' . (before+1))
  call wbx#rpc('rooms.select',{'roomId':'read-room'})
  call s:wait('len(s:requests()) == ' . (before+2) . ' && !wbx#read_by#busy()')
  call assert_equal('read-39',s:badge().messageId,'a quick room switch waits for the old physical read, then loads the new room once')
  call assert_equal('read-room',s:requests()[-1].roomId)
  call s:mode('partial') | call s:open(0)
  call assert_match('Read by 2',s:badge().text)
  call assert_match('Partial snapshot',s:badge().text,'expanded details retain the read-through coverage limit')
  call assert_match('Name unavailable',s:badge().text)
  call s:mode('empty')
  WebexReadBy
  call s:wait('!wbx#read_by#busy()')
  call assert_match('No read receipts reported',s:badge().text)
  call assert_notmatch('Unread by\|Read by 0',s:badge().text)
  call s:mode('old') | call s:open(0)
  call assert_match('stale',s:badge().text)
  if !has('nvim')
    call assert_equal(len(s:badge().lines),len(prop_list(1,{'end_lnum':-1,'types':['WbxHistoryReadBy','WbxHistoryReadByStale']})),'expiry replaces fresh Vim properties')
  endif
  call s:mode('denied') | call s:open(0)
  call assert_match('stale.*Alice Example',s:badge().text,'failed refresh retains previously disclosed names as stale')
  call s:open(1)
  call assert_match('Read receipts unavailable',s:badge().text,'an unavailable read is not zero readers')
  call s:mode('ok')
  call s:choose(2)
  WebexReadBy
  call s:choose(3) | doautocmd CursorMoved
  sleep 220m
  call assert_equal(s:history,bufnr('%'),'a stale callback cannot steal focus')
  call assert_equal('read-1',s:badge().messageId,'cursor cancellation cannot replace the footer')
  call s:open(3)
  let s:live_reads = len(s:requests())
  if $WBX_READ_BY_LEGACY !=# '1' | call s:hint({}) | endif
  call wbx#rpc('fixture.source',{})
  call s:wait('empty(s:badge())')
  call assert_equal({},getbufvar(s:history,'wbx_reaction_decorations',{}),'source replacement clears retained reader identity data')
  sleep 1100m
  call assert_equal(s:live_reads,len(s:requests()),'source replacement cancels a queued live refresh without a retry')
  call win_gotoid(win_findbuf(s:history)[0])
  call s:open(0)
  call wbx#rpc('fixture.edit',{})
  call s:wait('empty(s:badge())')
  call win_gotoid(win_findbuf(s:history)[0])
  call s:mode('fast')
  for index in range(33)
    call s:open(index)
  endfor
  let sid = getscriptinfo({'name':'/autoload/wbx/read_by.vim$'})[0].sid
  let vars = getscriptinfo({'sid':sid})[0].variables
  call assert_equal(32,len(vars.cache),'one bounded presentation cache, not one cache per room')
  call assert_false(has_key(vars.cache,json_encode(['read-room','read-0'])))
  call s:open(33)
  call s:mode('ok')
  call s:choose(34)
  WebexReadBy
  vnew
  file independent-read-by-draft.txt
  call setline(1,'Unsent native draft')
  call feedkeys("i\<Esc>",'xt')
  let saved = [win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree(),winsaveview()]
  sleep 220m
  call assert_equal(saved,[win_getid(),bufnr('%'),getline(1,'$'),b:changedtick,undotree(),winsaveview()],'late results cannot touch/focus an independent draft')
  call assert_equal('read-33',s:badge().messageId)
  close!
  call win_gotoid(win_findbuf(s:history)[0])
  setlocal modifiable
  call setline(1,'My history annotation')
  setlocal nomodified
  let saved = [getline(1,'$'),b:changedtick,undotree()]
  let g:wbx_tui.read_status = 0
  call wbx#read_by#check()
  call assert_equal(0,wbx#read_by#toggle(),'opt-out/annotations cannot redisclose retained reader names')
  call assert_equal(saved,[getline(1,'$'),b:changedtick,undotree()],'opt-out retains annotated native work')
  call assert_equal({},s:badge(),'opt-out removes reader names without changing annotations')
  let calls = map(readfile($WBX_EDITOR_AUDIT),'json_decode(v:val).method')
  for method in ['rooms.read','messages.send','people.lookup','people.profile','members.list']
    call assert_equal(0,count(calls,method),'read-by inspection never invokes ' . method)
  endfor
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
