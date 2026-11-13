" C2 actual native -> stdio worker -> demo engine/ledger, no account/service/device.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'backend': [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs',
      \ $WBX_EDITOR_ROOT . '/test/editor/conversation-reset-backend.ts'],
      \ 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0, 'persist_drafts': 0}
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\nreturn 1\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\ncall call(a:Callback, [1])\nendfunction"
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:journal(kind) abort
  return filter(map(readfile($WBX_EDITOR_AUDIT), 'json_decode(v:val)'), 'v:val.kind ==# a:kind')
endfunction
function! s:requests(method) abort
  return filter(map(s:journal('request'), 'v:val.value'), 'v:val.method ==# a:method')
endfunction
function! s:puts() abort
  return len(filter(s:journal('rest'), 'v:val.method ==# "PUT"'))
endfunction
function! s:resolved(count) abort
  let responses = filter(map(s:journal('output'), 'v:val.value'), 'has_key(v:val, "id") && has_key(v:val, "result") && v:val.result is v:null')
  let ids = map(s:requests('conversations.resolve'), 'v:val.id')
  return len(filter(responses, 'index(ids, v:val.id) >= 0')) >= a:count
endfunction
function! s:reconnect() abort
  let old = wbx#state().localContext.sessionId
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call assert_notequal(old, wbx#state().localContext.sessionId)
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
endfunction
let s:checks = []
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  call feedkeys("iRetained unsent C2 work\<CR>Independent native line\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let draft = bufnr('%') | let body = getline(1, '$') | let tree = undotree()
  let remove = maparg('\Wnr', 'n') | let theme = execute('highlight Normal') | let breaks = &breakat
  WebexRenameSpace Ambiguous first rename
  call s:wait('!wbx#conversations#pending() && s:puts() == 1')
  let original = s:requests('rooms.rename')[-1].params.requestId
  call s:reconnect()
  execute 'buffer ' . draft
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  let before = len(s:requests('rooms.rename'))
  WebexRenameSpace Blocked until checked
  call assert_equal(before, len(s:requests('rooms.rename')), 'retained native unknown blocks dispatch, no replay on reconnect')
  WebexConversationResolve
  call s:wait('s:resolved(1)')
  call assert_equal(original, s:requests('conversations.resolve')[-1].params.requestId)
  call assert_equal(1, s:puts(), 'checked recovery never writes')
  sleep 20m
  WebexRenameSpace Deliberate recovered rename
  call s:wait('!wbx#conversations#pending() && wbx#state().room.title ==# "Deliberate recovered rename"')
  call assert_equal(2, s:puts())
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  call add(s:checks, 'same-partition space reset/reconnect resolves original request without replay and permits one new deliberate rename')
  WebexJoinedTeams
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && wbx#joined_teams#current()')
  call cursor(6, 1)
  WebexRenameTeam Ambiguous Team rename
  call s:wait('!wbx#conversations#pending() && s:puts() == 3')
  let original = s:requests('teams.rename')[-1].params.requestId
  call s:reconnect()
  execute 'buffer ' . draft
  WebexConversationResolve
  call s:wait('s:resolved(2)')
  call assert_equal(original, s:requests('conversations.resolve')[-1].params.requestId, 'retired Team intent remains selectable with original request')
  call assert_equal(3, s:puts())
  sleep 20m
  WebexJoinedTeams
  call s:wait('get(b:, "wbx_list_kind", "") ==# "joined-teams" && wbx#joined_teams#current()')
  call cursor(6, 1)
  WebexRenameTeam Deliberate recovered Team
  call s:wait('!wbx#conversations#pending() && s:puts() == 4')
  execute 'buffer ' . draft
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_equal(remove, maparg('\Wnr', 'n')) | call assert_equal(theme, execute('highlight Normal'))
  call assert_equal(breaks, &breakat)
  call assert_equal([], s:requests('messages.send'), 'ordinary Enter/write and metadata recovery never send')
  call add(s:checks, 'retired Team recovery uses current checked session, preserves native text/full undo/theme/breakat/Wnr and permits deliberate Team work')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'checks': s:checks})], $WBX_EDITOR_RESULT)
qa!
