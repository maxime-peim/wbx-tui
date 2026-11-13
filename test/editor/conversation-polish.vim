" Published mentions, loaded-thread routing, per-window headers and quiet compose.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
filetype plugin on
syntax on
runtime plugin/wbx.vim
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const rooms=[{id:'room',title:'Synthetic conversation',type:'group'}];
  const markup='Hello <@personId:opaque-person-id|Élodie Example> and <@all>';
  const spark='<spark-mention data-object-type="person" data-object-id="opaque-published-id">Published person</spark-mention>';
  const sparkAt='<spark-mention data-object-type="person" data-object-id="opaque-other-id">@Other person</spark-mention>';
  const messages=[
    {id:'root',author:'Alice',created:'2026-11-16T10:00:00.000Z',text:markup,
      markdown:markup+'\n`<@personId:literal|Literal code>`\n```\n<@personId:literal|Fenced code>\n```\n**<@personId:bold|Bold mention>**\n# <@personId:heading|Heading mention>\n'+spark+' and '+sparkAt+'\n`'+spark+'`\n```\n'+spark+'\n```'},
    {id:'reply',parentId:'root',author:'Bob',created:'2026-11-16T10:01:00.000Z',text:'Existing answer'},
  ];
  let state={revision:0,state:'idle',mode:'demo',rooms:[],room:null,messages:[],ready:false};
  const write=x=>process.stdout.write(JSON.stringify(x)+'\n');
  createInterface({input:process.stdin}).on('line',line=>{
    const req=JSON.parse(line),reply=result=>write({jsonrpc:'2.0',id:req.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify({method:req.method,...req.params})+'\n');
    if(req.method==='hello')return reply({version:1,capabilities:['message-replies'],state,meeting:{active:false,ready:false}});
    if(req.method==='session.start')state={...state,state:'ready',rooms};
    else if(req.method==='rooms.select')state={...state,room:rooms[0],messages,ready:true};
    else if(req.method==='shutdown'){reply(null);return process.exit(0);}
    else return reply(null);
    state.revision++;write({jsonrpc:'2.0',method:'state',params:state});reply(null);
  });
END
call writefile(s:backend, $WBX_EDITOR_RESULT . '.backend.mjs')
let g:wbx_tui = {'backend': [$WBX_NODE, $WBX_EDITOR_RESULT . '.backend.mjs'],
      \ 'statusline': 0, 'notifications': 0, 'persist_drafts': 0, 'read_status': 0,
      \ 'people_status': 0, 'upcoming_meetings': 0, 'spaces_cache': 0, 'images': 0}
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  if !eval(a:expression) | throw 'Timeout: ' . a:expression | endif
endfunction
function! s:header() abort
  redraw!
  if $WBX_EDITOR_SCREEN ==# '1'
    let info = getwininfo(win_getid())[0]
    call assert_equal('→', screenstring(info.winrow, info.wincol), 'actual composer header remains visible above line one')
  endif
endfunction
function! s:mention_at(row, column) abort
  if has('nvim')
    let ns = nvim_get_namespaces()['wbx-message-blocks']
    let marks = nvim_buf_get_extmarks(bufnr('%'), ns, [a:row - 1, 0], [a:row - 1, -1], {'details': v:true})
    return !empty(filter(marks, 'get(v:val[3], "hl_group", "") ==# "WbxMention" && v:val[2] < a:column && get(v:val[3], "end_col", 0) >= a:column'))
  endif
  return !empty(filter(prop_list(a:row, {'types': ['WbxMentionText']}), 'v:val.col <= a:column && v:val.col + v:val.length > a:column'))
endfunction
try
  WebexDemo
  call s:wait('len(wbx#state().rooms) == 1')
  call wbx#select('room')
  call s:wait('get(wbx#state(), "ready", 0)')
  let history = wbx#buffers().history
  call win_gotoid(win_findbuf(history)[0])
  let root = b:wbx_message_blocks[0]
  call cursor(root.body, 1)
  syntax sync fromstart
  call assert_equal('Hello @Élodie Example and @all', getline(root.body), 'published mention labels are ordinary native display text')
  call assert_equal(0, synconcealed(root.body, 7)[0], 'mention layout no longer depends on concealed source width')
  call assert_true(s:mention_at(root.body, 7), 'structured mention labels keep a distinct native highlight')
  call assert_false(s:mention_at(root.body, 1), 'ordinary message text is not colored as a mention')
  call assert_false(s:mention_at(root.body + 1, 2), 'code lookalikes do not gain mention styling')
  call assert_match('links to Identifier', execute('highlight WbxMention'), 'the default mention color follows the editor theme')
  highlight WbxMention ctermfg=5 guifg=#ff00ff
  call wbx#history#blocks()
  call assert_equal('5', synIDattr(synIDtrans(hlID('WbxMention')), 'fg', 'cterm'), 'user highlight overrides survive refresh')
  call assert_equal(0, synconcealed(root.body + 1, 2)[0], 'inline code keeps literal mention syntax')
  call assert_equal(0, synconcealed(root.body + 3, 1)[0], 'fenced code keeps literal mention syntax')
  call assert_equal('**@Bold mention**', getline(root.body + 5))
  call assert_equal('# @Heading mention', getline(root.body + 6))
  let spark_row = root.body + 7
  call assert_equal('@Published person and @Other person', getline(spark_row), 'actual published tags render as labels without duplicate @')
  call assert_true(s:mention_at(spark_row, 1))
  call assert_true(s:mention_at(spark_row, stridx(getline(spark_row), '@Other') + 1))
  call assert_equal(0, synconcealed(spark_row, stridx(getline(spark_row), '@Other person') + 1)[0], 'the already-prefixed human label remains visible')
  call assert_equal(0, synconcealed(spark_row + 1, 2)[0], 'HTML mentions remain literal in inline code')
  call assert_equal(0, synconcealed(spark_row + 3, 1)[0], 'HTML mentions remain literal in fenced code')
  normal! yy
  call assert_match('Hello @Élodie Example and @all', getreg('"'), 'native history yanks copy readable text, as requested')
  call assert_match('<@personId:opaque-person-id|Élodie Example>', wbx#state().messages[0].markdown, 'original state retains the exact raw identity')
  if $WBX_EDITOR_SCREEN ==# '1'
    normal! zt
    redraw!
    let pos = screenpos(win_getid(), root.body, 1)
    let shown = join(map(range(100), 'screenstring(pos.row, pos.col + v:val)'), '')
    call assert_match('Hello @Élodie Example and @all', shown)
    call assert_notmatch('opaque-person-id\|personId:', shown)
    let ordinary = screenpos(win_getid(), root.body, 1)
    let mention = screenpos(win_getid(), root.body, 7)
    call assert_notequal(screenattr(ordinary.row, ordinary.col), screenattr(mention.row, mention.col), 'mention label color is actually distinct on the drawn screen')
    call cursor(spark_row, 1)
    normal! zt
    redraw!
    let pos = screenpos(win_getid(), spark_row, 1)
    let end = screenpos(win_getid(), spark_row + 1, 1).row - 1
    let info = getwininfo(win_getid())[0]
    let shown = ''
    for row in range(pos.row, end)
      let shown .= join(map(range(info.width), 'screenstring(row, info.wincol + v:val)'), '') . "\n"
    endfor
    call assert_match('@Published person and\_.*@Other person', shown, 'both labels are readable across native wrapped screen rows')
    call assert_notmatch('spark-mention\|opaque-published-id\|@@', shown)
  endif
  call cursor(spark_row, 1)
  normal! yy
  call assert_match('@Published person and @Other person', getreg('"'))
  call assert_match('<spark-mention.*opaque-published-id', wbx#state().messages[0].markdown, 'published raw source is retained separately from readable native history')
  let action = filter(wbx#commands#catalogue(), 'v:val.key ==# "aR"')[0]
  call assert_true(action.available, action.reason)
  call feedkeys("\\WaR", 'xt')
  stopinsert
  call assert_equal('root', get(b:, 'wbx_parent', ''), 'action replies from ordinary loaded history')
  let reply = bufnr('%')
  WebexCancelReply
  let composer = bufnr('%')
  let catalogue = wbx#commands#catalogue()
  call assert_false(filter(copy(catalogue), 'v:val.command ==# "WebexLatest"')[0].available, 'latest is history-only, not a misleading composer action')
  call assert_true(filter(copy(catalogue), 'v:val.command ==# "WebexCancelReply"')[0].available)
  call s:header()
  " Enter from history, not spaces: i is the compose mapping, with no echo.
  call win_gotoid(win_findbuf(history)[0])
  call cursor(b:wbx_message_blocks[1].body, 1)
  call feedkeys("\\WaR", 'xt')
  stopinsert
  call assert_equal(reply, bufnr('%'), 'reply-to-reply uses the original thread root')
  WebexCancelReply
  let before = execute('messages')
  call win_gotoid(win_findbuf(history)[0])
  call feedkeys("i\<Esc>", 'xt')
  call assert_equal(composer, bufnr('%'))
  call assert_equal(before, execute('messages'), 'normal compose does not announce status or destination IDs')
  call s:header()
  let tick = b:changedtick | let tree = undotree()
  if has('nvim')
    let view = winsaveview() | let view.topfill = 0 | call winrestview(view)
  endif
  " Here i is native insertion in an already focused composer, not the mapping.
  call feedkeys("i\<Esc>", 'xt')
  call s:header()
  call assert_equal(tick, b:changedtick)
  call assert_equal(tree, undotree(), 'header visibility never edits native text/undo')
  split
  if has('nvim')
    let view = winsaveview() | let view.topfill = 0 | call winrestview(view)
  endif
  call feedkeys("i\<Esc>", 'xt')
  call s:header()
  close
  call win_gotoid(win_findbuf(composer)[0])
  let explicit = execute('call wbx#show_destination()')
  call assert_match('Destination ID: room', explicit, 'explicit destination inspection remains available')
  call win_gotoid(win_findbuf(history)[0])
  let receipt = filter(wbx#commands#catalogue(), 'v:val.command ==# "WebexMarkRead"')[0]
  call assert_false(receipt.available, 'disabled receipt state is reflected without probing a provider')
  call assert_match('\coff\|disabled', receipt.reason)
  setlocal modifiable
  call setline(1, 'Retained native annotation')
  call wbx#history#syntax()
  call assert_false(s:mention_at(root.body, 7), 'edited views cannot retain stale mention-identity decoration')
  let tick = b:changedtick
  call feedkeys("\\WaR", 'xt')
  call assert_equal(history, bufnr('%'), 'edited history cannot authorize a reply')
  call assert_equal(tick, b:changedtick)
  let methods = map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val).method')
  call assert_equal([], filter(methods, 'v:val =~# "send\\|read\\|thread\\|people"'), 'all these UI actions perform no send/receipt/query/People operations')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
