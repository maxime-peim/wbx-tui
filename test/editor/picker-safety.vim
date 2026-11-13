" Picker actions open exact loaded destinations, never receipts; no provider.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const rooms=['one','two'].map((id,i)=>({id,title:'Duplicate',unread:true,type:i?'direct':'group',...(i?{teamId:'team'}:{})}));
  let revision=0,state={revision,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line',line=>{
    const r=JSON.parse(line),p=r.params||{},reply=result=>write({jsonrpc:'2.0',id:r.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify(r)+'\n');
    if(r.method==='hello')return reply({version:1,capabilities:['local-context-v1'],state,meeting:{active:false,ready:false}});
    if(r.method==='session.start'){state={...state,state:'ready',rooms,readStatus:'ready',localContext:{sessionId:'a'.repeat(32),coverage:'session-only'}};publish();}
    if(r.method==='rooms.select'){state={...state,room:rooms.find(v=>v.id===p.roomId),ready:true,
      messages:[{id:'root',author:'Synthetic',created:'2026-11-16T12:00:00Z',text:'Visible newest endpoint'}],historyLatest:true};publish();}
    if(r.method==='shutdown'){reply(null);process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'backend':[$WBX_NODE,$WBX_EDITOR_RESULT . '.backend.mjs'],'picker':'builtin',
      \ 'images':0,'notifications':0,'people_status':0,'upcoming_meetings':0,'spaces_cache':0,'read_status':1,'mark_read_on_open':1}
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  if !eval(a:expression) | throw 'Timeout: ' . a:expression | endif
endfunction
function! s:requests(method) abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.method ==# a:method')
endfunction
try
  WebexDemo
  call s:wait('len(wbx#state().rooms) == 2')
  let spaces = bufnr('%')
  if has('nvim')
    lua vim.ui.select = function(items, opts, done) done(items[2], 2) end
  endif
  WebexPickSpace
  if !has('nvim')
    let picker = popup_list()[0]
    call popup_filter_menu(picker, 'j')
    call popup_filter_menu(picker, "\<CR>")
  endif
  call s:wait('type(wbx#state().room) == v:t_dict && wbx#state().room.id ==# "two" && wbx#state().ready')
  call s:wait('bufname("%") ==# "wbx://history"')
  call assert_equal('wbx://history', bufname('%'), 'interactive selection opens history like Enter, unlike the focus-neutral API')
  call assert_equal([], s:requests('rooms.read'), 'picker opening never consents to receipts even with automatic open marking enabled')
  let context = wbx#picker_context()
  call assert_notequal(context.rooms[0].label, context.rooms[1].label, 'duplicate titles include exact loaded metadata')
  call assert_notmatch('two', context.rooms[1].label, 'space ID is internal, never picker text')
  call assert_match('direct', context.rooms[1].label)
  call assert_match('Team space', context.rooms[1].label)
  let request_count = len(s:requests('rooms.select'))
  enew
  call setline(1, 'Unrelated native text')
  call feedkeys("i\<Esc>", 'xt')
  let native = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  call wbx#pick_select(context, 'one')
  call assert_equal(native, [win_getid(),bufnr('%'),getline(1,'$'),undotree()], 'late picker callbacks cannot steal unrelated work/focus')
  call assert_equal(request_count, len(s:requests('rooms.select')))
  let context = wbx#picker_context()
  let newer = wbx#picker_context()
  call wbx#pick_select(context, 'one')
  call assert_equal(request_count, len(s:requests('rooms.select')), 'a newer picker revokes its abandoned predecessor')
  call wbx#pick_select(newer, 'not-loaded')
  call assert_equal(request_count, len(s:requests('rooms.select')), 'a provider cannot invent an unlisted destination')
  let canceled = wbx#picker_context()
  call wbx#picker_cancel(canceled)
  call wbx#pick_select(canceled,'one')
  call assert_equal(request_count, len(s:requests('rooms.select')), 'cancel revokes callbacks even if the original native context is unchanged')
  let focus = win_getid()
  call wbx#select('one', 0, 0)
  call s:wait('get(wbx#state().room,"id","") ==# "one"')
  call assert_equal(focus, win_getid(), 'public programmatic selection stays focus-neutral')
  call assert_equal([], s:requests('rooms.read'))
  let duplicate = wbx#state()
  let duplicate.revision += 100
  let duplicate.rooms = [{'id':'one','title':'Same title','type':'direct'},{'id':'two','title':'Same title','type':'direct'}]
  let duplicate.room = deepcopy(duplicate.rooms[0])
  call wbx#_receive({'jsonrpc':'2.0','method':'state','params':duplicate})
  let collision = wbx#picker_context()
  call assert_equal(['Same title · direct · choice 1/2','Same title · direct · choice 2/2'],map(copy(collision.rooms),'v:val.label'),'truly identical metadata stays distinguishable without exposing IDs')
  call assert_equal(['one','two'],map(copy(collision.rooms),'v:val.id'),'callback identities remain exact and hidden')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})], $WBX_EDITOR_RESULT)
qa!
