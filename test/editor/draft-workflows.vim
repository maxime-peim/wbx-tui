" Rich draft lifecycle and bounded explicit pagination; inert synchronous RPC only.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:rich_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return 1', 'endfunction',
      \ 'function! wbx#redraw_status() abort', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Protocol error"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:rich_requests, {"method": a:method, "params": deepcopy(a:params)})',
      \ 'if get(g:, "rich_hold", 0)', 'let g:RichCallback = a:Callback', 'return 1', 'endif',
      \ 'let page = get(a:params, "more", 0) ? g:rich_second : g:rich_first',
      \ 'call call(a:Callback, [{"result": deepcopy(page)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:rich_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'r', 'title': 'Synthetic', 'type': 'group'}}
let g:rich_requests = []
let g:rich_first = {'roomId': 'r', 'revision': 1, 'state': 'ready', 'partial': v:true, 'more': v:true,
      \ 'items': map(range(100), '{"id": "member-" . v:val, "personId": "person-" . v:val, "label": "Participant " . v:val, "moderator": v:false}')}
let g:rich_second = deepcopy(g:rich_first)
let g:rich_second.revision = 2 | let g:rich_second.more = v:false | let g:rich_second.partial = v:false
call add(g:rich_second.items, {'id': 'member-100', 'personId': 'person-100', 'label': 'Second-page participant', 'moderator': v:false})
runtime autoload/wbx/rich.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/rich.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_select(lines, Callback) abort\ncall add(g:rich_choices_seen, deepcopy(a:lines))\nif get(g:, 'rich_change', 0)\ncall setline(1, 'New work during choice')\nlet g:rich_change = 0\nendif\ncall call(a:Callback, [empty(g:rich_choices) ? 0 : remove(g:rich_choices, 0)])\nendfunction"
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn 1\nendfunction"
let g:rich_choices_seen = []
try
  enew
  file wbx://compose/r
  setlocal buftype=nofile
  let b:wbx_kind = 'compose' | let b:wbx_room = 'r' | let b:wbx_format = 'markdown'
  let g:rich_choices = [101, 101]
  call wbx#rich#mention(0)
  call assert_match('<@personId:person-100|Second-page participant>', getline(1), 'mention picker reaches the explicitly requested second page')
  call assert_equal([v:false, v:true], map(copy(g:rich_requests), 'get(v:val.params, "more", v:false)'), 'no automatic page drain or per-keystroke request')
  call assert_true(empty(g:rich_choices))
  call assert_match('PARTIAL', join(g:rich_choices_seen[0], ' '))
  call assert_match('Load more', join(g:rich_choices_seen[0], ' '))
  call setline(1, '')
  let g:rich_choices = [1] | let g:rich_change = 1
  call wbx#rich#mention(0)
  call assert_equal('New work during choice', getline(1), 'late choice cannot insert into a modified draft')
  call setline(1, '')
  let g:rich_hold = 1 | let g:rich_choices = [1]
  call wbx#rich#mention(0)
  let g:rich_state.ready = v:false
  call call(g:RichCallback, [{'result': g:rich_first}])
  call assert_equal('', getline(1), 'revoked readiness invalidates an outstanding roster response')
  let g:rich_state.ready = v:true | let g:rich_hold = 0
  let intent = wbx#view#intent()
  split
  close
  call assert_false(wbx#view#intent_valid(intent), 'leaving and returning to the same window/draft still revokes a choice')
  call setline(1, ['😀', 'é'])
  let length = wbx#drafts#length(bufnr('%'))
  call assert_equal(5, length.units, 'UTF-16 counts surrogate pairs, combining marks and the newline, not screen cells')
  call assert_equal(8, length.bytes)
  let tree = undotree()
  call assert_equal(length, wbx#drafts#length(bufnr('%')), 'unchanged status reads reuse bounded counts')
  call assert_equal(tree, undotree())
  call setline(1, repeat('😀', 501))
  call assert_equal('>1000', wbx#drafts#length(bufnr('%')).units)
  call assert_match('1000 UTF-16', wbx#drafts#summary(bufnr('%')))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
