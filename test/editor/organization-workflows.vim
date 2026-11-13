" Native on-demand lists, exact returned rooms and local presentation; actual demo.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0}
runtime autoload/wbx/conversations.vim
runtime autoload/wbx/members.vim
for name in ['conversations', 'members']
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/" . name . ".vim$"')[0].sid
  execute 'function! <SNR>' . sid . "_pick(lines, Callback) abort\ncall call(a:Callback, [1])\nendfunction"
  if name ==# 'conversations'
    execute 'function! <SNR>' . sid . "_confirm(text) abort\nreturn 1\nendfunction"
  endif
endfor
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 6 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let composer = bufnr('%')
  call feedkeys("iRetained normal draft\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let tree = undotree()
  WebexFilter drafts
  call assert_equal(['demo-general'], filter(copy(getbufvar(wbx#buffers().rooms, 'wbx_room_ids')), '!empty(v:val)'), 'Drafts filter is loaded/local and never retargets the draft')
  call assert_equal('demo-general', wbx#state().room.id)
  WebexFilter all
  let s:rooms = [{'id': 'a', 'title': 'A', 'type': 'group', 'unread': v:true},
        \ {'id': 'b', 'title': 'B', 'type': 'group'},
        \ {'id': 'c', 'title': 'C', 'type': 'group', 'unread': v:true, 'unreadStale': v:true}]
  let s:prefs = {'revision': 1, 'persistence': 'session', 'items': [{'id': repeat('a', 24), 'name': 'Collapsed', 'collapsed': v:true, 'rooms': ['a', 'b', 'c']}]}
  let s:view = wbx#sections#rows(s:rooms, 'a', 0, [{'unread': v:true, 'local': ''}, {'unread': v:null, 'local': ''}, {'unread': v:true, 'local': ''}], 'ready', s:prefs)
  let section_row = index(s:view.row_ids, json_encode(['section', repeat('a', 24)]))
  call assert_true(section_row > 0, 'coverage heading is inert; exact section identity is retained separately')
  call assert_match('2 unread · 1 unknown · 1 stale', s:view.lines[section_row], 'collapsed groups preserve loaded/local unread provenance')
  call assert_equal([], filter(copy(s:view.ids), '!empty(v:val)'))
  let s:flags = wbx#rooms#rows([{'id': 'flag', 'title': 'Observed', 'isLocked': v:true, 'isReadOnly': v:true, 'isAnnouncementOnly': v:true}], '', 0, [{'unread': v:null, 'local': ''}], 'off')
  call assert_match('observed locked.*observed read-only.*observed announcements', s:flags.lines[0], 'observed room flags are disclosed, not role/send authority')
  WebexMembers
  call s:wait('exists("b:wbx_members_snapshot")')
  let roster = bufnr('%')
  call assert_equal({}, wbx#members#selected(), 'informational rows cannot target the last participant through a negative index')
  call assert_match('WebexMembersMore', maparg(']p', 'n'))
  normal q
  call assert_equal(composer, bufnr('%'))
  call assert_equal(tree, undotree(), 'q returns without touching native draft/undo')
  WebexMembers
  call s:wait('get(b:, "wbx_list_kind", "") ==# "members"')
  call cursor(5, 1)
  let person = b:wbx_members_snapshot.items[1].personId
  execute "normal \<CR>"
  call s:wait('exists("b:wbx_recipient")')
  call assert_equal(person, b:wbx_recipient.personId, 'Enter prepares only the exact row identity; never sends')
  WebexDirectCancel
  execute 'buffer ' . roster
  setlocal modifiable
  call setline(1, 'Private roster annotation')
  let annotation = undotree()
  normal q
  normal r
  call assert_equal('Private roster annotation', getline(1), 'q/refresh preserve annotations')
  call assert_equal(annotation, undotree())
  setlocal buftype=
  WebexMembers
  call assert_equal('', &buftype, 'refresh cannot reclaim a promoted list')
  call assert_equal('Private roster annotation', getline(1))
  call assert_equal(annotation, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'), 'promotion releases only the unchanged list-owned map')
  execute 'buffer ' . composer
  WebexTeams
  call s:wait('exists("b:wbx_teams_snapshot")')
  call cursor(3, 1)
  execute "normal \<CR>"
  call assert_equal('team:demo-team', wbx#sections#current_filter())
  call assert_equal('demo-general', wbx#state().room.id, 'filter cannot retarget the selected draft')
  normal q
  WebexFilter all
  call assert_equal(['Retained normal draft'], getbufline(composer, 1, '$'))
  execute 'buffer ' . wbx#buffers().history
  call cursor(b:wbx_message_blocks[0].body, 1)
  WebexReply
  let reply = bufnr('%')
  call feedkeys("iRetained reply draft\<Esc>", 'xt')
  call wbx#_draft_setup()
  call wbx#redraw_status()
  let general_row = index(getbufvar(wbx#buffers().rooms, 'wbx_room_ids'), 'demo-general') + 1
  call assert_match('\[draft\].*\[reply draft\]', getbufline(wbx#buffers().rooms, general_row)[0], 'normal and reply draft indicators are independent')
  WebexCancelReply
  WebexCompose
  call assert_equal(['Retained normal draft'], getline(1, '$'))
  execute 'bwipeout! ' . reply
  call wbx#redraw_status()
  call assert_notmatch('reply draft', getbufline(wbx#buffers().rooms, general_row)[0])
  WebexCreateSpace Exact returned group
  call s:wait('!wbx#conversations#pending() && len(wbx#state().rooms) == 4')
  let created = filter(copy(wbx#state().rooms), 'v:val.id =~# "^demo-created-"')[0].id
  WebexConversationOpen
  call s:wait('get(wbx#state(), "ready", 0) && wbx#state().room.id ==# ' . string(created))
  call assert_equal([], wbx#state().messages, 'explicit group Open never posts a placeholder or invites anyone')
  call assert_equal(['Retained normal draft'], getbufline(composer, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
