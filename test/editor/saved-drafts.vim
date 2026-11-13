" Verified unopened recovery records; controlled disk RPCs, no provider/send.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:saved_state)', 'endfunction',
      \ 'function! wbx#supports_local_drafts() abort', 'return 1', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid recovery DTO"', 'endfunction',
      \ 'function! wbx#compose(...) abort', 'throw "Unloaded root/room unexpectedly became actionable"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call assert_true(index(["drafts.open","drafts.save"],a:method)>=0,"no provider/send operation")',
      \ 'call add(g:saved_requests,[a:method,deepcopy(a:params)])',
      \ 'let result={"sessionId":g:saved_state.localContext.sessionId,"profile":repeat("f",64),"revision":repeat("d",64)}',
      \ 'if a:method==#"drafts.open" | let result.items=deepcopy(g:saved_items) | endif',
      \ 'call call(a:Callback,[{"result":result}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:wbx_tui = {'persist_drafts':1}
let g:saved_state = {'state':'ready','ready':v:true,'room':{'id':'r','type':'group','title':'Room'},
      \ 'rooms':[{'id':'r','type':'group','title':'Room'}],'messages':[],
      \ 'localContext':{'sessionId':repeat('a',32),'coverage':'session-only'}}
let g:saved_items = [
      \ {'roomId':'r','text':'Possibly sent text','format':'plain','uncertain':v:true},
      \ {'roomId':'r','parentId':'missing-root','text':"Unloaded root\nExact 😀 text",'format':'markdown','uncertain':v:false},
      \ {'roomId':'inaccessible','text':'Unreachable saved work','format':'plain','uncertain':v:false}]
let g:saved_requests = [] | let g:saved_confirm_action = ''
command! WebexDrafts call wbx#saved_drafts#show()
command! WebexDraftRestore call wbx#saved_drafts#restore()
command! WebexDraftExport call wbx#saved_drafts#export()
command! WebexDraftDiscard call wbx#saved_drafts#discard()
runtime autoload/wbx/saved_drafts.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/saved_drafts.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nif g:saved_confirm_action==#'session' | let g:saved_state.localContext.sessionId=repeat('b',32) | endif\nreturn 1\nendfunction"
function! s:row(room, parent) abort
  let key = json_encode([a:room,a:parent])
  call cursor(index(b:wbx_list_row_ids,key)+1,1)
endfunction
try
  call wbx#state()
  call wbx#draft_persistence#sync(g:saved_state)
  call assert_equal(['drafts.open'],map(copy(g:saved_requests),'v:val[0]'))
  call assert_equal('',wbx#draft_persistence#inventory().reason)
  call assert_equal({}, wbx#drafts#buffers(), 'saved work is indexed before any composer exists')
  WebexDrafts
  let index_buffer = bufnr('%')
  call assert_equal(3, len(b:wbx_saved_index.items))
  call assert_notmatch('Possibly sent text\|Unloaded root\|Unreachable saved work', json_encode(b:wbx_saved_index), 'view holds metadata, not another draft text registry')
  call assert_match('saved.*DELIVERY UNRESOLVED', join(getline(1,'$'),"\n"))
  if $WBX_EDITOR_SCREEN ==# '1'
    call s:row('r','')
    redraw!
    let cell = screenpos(win_getid(),line('.'),1)
    let shown = join(map(range(min([getwininfo(win_getid())[0].width,150])), 'screenstring(cell.row,cell.col+v:val)'), '')
    call assert_match('saved.*DELIVERY UNRESOLVED',shown,'saved/uncertain provenance is actually drawn, not just metadata')
  endif
  let projected = wbx#draft_persistence#rooms(g:saved_state.rooms,g:saved_state)
  call assert_true(projected[0].recoverySaved && projected[0].recoveryDraft, 'verified unopened records supply disk badges without creating native drafts')
  call assert_false(has_key(g:saved_state.rooms[0],'recoverySaved'), 'recovery projection never mutates authoritative room data')
  call s:row('r','missing-root')
  let reads = len(g:saved_requests)
  WebexDraftRestore
  call assert_equal(index_buffer, bufnr('%'), 'unloaded reply root remains inert/exportable')
  call assert_equal(reads, len(g:saved_requests), 'restore never fetches a root')
  execute "normal \<CR>"
  call assert_equal(["Unloaded root",'Exact 😀 text'], getline(1,'$'))
  call assert_equal('', &buftype)
  call assert_false(exists('b:wbx_kind') || exists('b:wbx_room'), 'export has no send destination or handles')
  call assert_equal('', maparg('<CR>','n'), 'export is ordinary native editing')
  execute 'write ' . fnameescape($WBX_EDITOR_RESULT . '.export.txt')
  call assert_equal(["Unloaded root",'Exact 😀 text'], readfile($WBX_EDITOR_RESULT . '.export.txt'))
  call assert_equal(reads, len(g:saved_requests), 'native export/write has no RPC effect')
  execute 'buffer ' . index_buffer
  call s:row('inaccessible','')
  WebexDraftRestore
  call assert_equal(index_buffer, bufnr('%'))
  call s:row('r','')
  let g:saved_confirm_action = 'session'
  WebexDraftDiscard
  call assert_equal(reads, len(g:saved_requests), 'account change during consent cannot discard old text')
  let g:saved_state.localContext.sessionId = repeat('a',32) | let g:saved_confirm_action = ''
  WebexDraftDiscard
  call assert_true(wbx#drafts#uncertain('r'), 'discarding text is never delivery resolution')
  let row = filter(copy(wbx#draft_persistence#inventory().items), 'v:val.roomId==#"r" && empty(v:val.parentId)')[0]
  let record = wbx#draft_persistence#record(row.key,row.fingerprint)
  call assert_equal('',record.text) | call assert_true(record.uncertain)
  sleep 600m
  call assert_equal('drafts.save',g:saved_requests[-1][0])
  call assert_true(g:saved_requests[-1][1].items[0].uncertain)
  call assert_equal(1, wbx#drafts#resolve('r',wbx#drafts#evidence('r')))
  call wbx#draft_persistence#resolved('r')
  sleep 600m
  WebexDrafts
  call assert_equal(2,len(b:wbx_saved_index.items), 'confirmed deletion/resolution removes only the empty resolved record')
  let g:wbx_tui.persist_drafts = 0
  call assert_match('disabled',wbx#draft_persistence#inventory().reason)
  call s:row('r','missing-root')
  let before = [win_getid(),bufnr('%'),getline(1,'$'),undotree()]
  WebexDraftExport
  call assert_equal(before,[win_getid(),bufnr('%'),getline(1,'$'),undotree()], 'opt-out cannot expose a retained index as current verified work')
  let g:wbx_tui.persist_drafts = 1
  let g:saved_state.localContext.sessionId = repeat('c',32)
  WebexDraftExport
  call assert_equal(before,[win_getid(),bufnr('%'),getline(1,'$'),undotree()], 'stale account index cannot export another account record')
catch
  call add(v:errors,v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors})], $WBX_EDITOR_RESULT)
qa!
