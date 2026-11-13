" Exact paged list identities, late callbacks and promotion; no provider/transport.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:list_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Protocol error"', 'endfunction',
      \ 'function! wbx#rpc(method, params, ...) abort',
      \ 'call add(g:list_requests, {"method": a:method, "params": deepcopy(a:params)})',
      \ 'if !a:0 | return 1 | endif',
      \ 'if a:method !=# "members.list" | call call(a:1, [{"error": {"code": -1, "message": "Synthetic refusal"}}]) | return 1 | endif',
      \ 'let value = get(a:params, "more", 0) ? g:list_second : g:list_first',
      \ 'if get(g:, "list_hold", 0) | let g:ListCallback = a:1 | return 1 | endif',
      \ 'call call(a:1, [{"result": deepcopy(value)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:list_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Room', 'type': 'group'}}
let g:list_requests = []
let g:list_first = {'roomId': 'r', 'revision': 1, 'state': 'ready', 'partial': v:true, 'more': v:true,
      \ 'items': map(range(100), '{"id": "member-" . v:val, "personId": "person-" . v:val, "label": "Participant " . v:val, "moderator": v:false}')}
let g:list_second = deepcopy(g:list_first)
let g:list_second.revision = 2 | let g:list_second.more = v:false | let g:list_second.partial = v:false
call add(g:list_second.items, {'id': 'member-100', 'personId': 'person-100', 'label': 'Second page', 'moderator': v:false})
command! WebexMembers call wbx#members#show(0)
command! WebexMembersMore call wbx#members#show(1)
command! WebexMemberAction call wbx#members#action()
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn 1\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\nthrow 'Exact row action must not reinterpret mutable labels through a second picker'\nendfunction"
try
  call setline(1, 'Unrelated native work')
  call feedkeys("i\<Esc>",'xt')
  let origin_a = win_getid()
  let buffer_a = bufnr('%') | let tree_a = undotree()
  call wbx#lists#show('bookmarks',['Local','same rows'],['','m'])
  let list_a = win_getid()
  tabnew
  let origin_b = win_getid() | let buffer_b = bufnr('%')
  call setline(1,'Independent tab B text')
  call feedkeys("i\<Esc>",'xt')
  let tree_b = undotree()
  call wbx#lists#show('bookmarks',['Local','same rows'],['','m'])
  call assert_equal(2,tabpagenr(),'existing list in tab A cannot steal navigation from B')
  call wbx#lists#close()
  call assert_equal([origin_b,buffer_b],[win_getid(),bufnr('%')])
  call assert_equal(tree_b,undotree())
  call wbx#lists#show('bookmarks',['Local','same rows'],['','m'])
  call win_gotoid(list_a)
  call wbx#lists#close()
  call assert_equal([origin_a,buffer_a],[win_getid(),bufnr('%')],'list returns are window-local, not shared per kind')
  call assert_equal(tree_a,undotree())
  tabonly
  WebexMembers
  call assert_equal(100, len(b:wbx_members_snapshot.items))
  normal ]p
  call assert_equal(101, len(b:wbx_members_snapshot.items))
  call cursor(104, 1)
  call assert_equal('member-100', wbx#members#selected().id)
  call wbx#conversations#action('remove', '')
  call assert_equal('members.action', g:list_requests[-1].method)
  call assert_equal('member-100', g:list_requests[-1].params.target, 'second-page removal binds exact membership, not display label/actor')
  call cursor(54, 1)
  let first_window = win_getid()
  let first_id = wbx#members#selected().id
  split
  call cursor(84, 1)
  let second_window = win_getid()
  let second_id = wbx#members#selected().id
  let g:list_first = deepcopy(g:list_second)
  let g:list_first.revision = 3
  call reverse(g:list_first.items)
  WebexMembers
  call assert_equal(second_window, win_getid(), 'refresh does not replace the chosen list split')
  call assert_equal(second_id, wbx#members#selected().id, 'reordered refresh retains exact selected membership')
  call win_gotoid(first_window)
  call assert_equal(first_id, wbx#members#selected().id, 'other list splits retain independent entity anchors')
  call filter(g:list_first.items, 'v:val.id !=# first_id')
  WebexMembers
  call assert_equal({}, wbx#members#selected(), 'a removed selected identity cannot become the next person')
  call assert_equal(1, line('.'), 'missing identity falls back to an inert heading')
  call win_gotoid(second_window)
  close
  call win_gotoid(first_window)
  let g:list_hold = 1
  WebexMembers
  setlocal modifiable
  call setline(1, 'New annotation while RPC is pending')
  let undo = undotree()
  call call(g:ListCallback, [{'result': g:list_first}])
  call assert_equal('New annotation while RPC is pending', getline(1), 'late roster refresh cannot overwrite annotations')
  call assert_equal(undo, undotree())
  let before = len(g:list_requests)
  setlocal buftype=
  call wbx#lists#setup()
  WebexMembers
  call assert_equal(before, len(g:list_requests), 'promoted list refresh is zero-request and cannot reclaim the file')
  call assert_equal('', &buftype)
  call wbx#lists#close()
  call assert_equal('New annotation while RPC is pending', getline(1))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
