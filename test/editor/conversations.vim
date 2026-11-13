" Actual demo backend and native commands. Modal choices only are synthetic.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0}
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
let g:wbx_conversation_confirm = 1
let g:wbx_conversation_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:wbx_conversation_prompts, a:text)\nif get(g:, 'wbx_conversation_edit', 0)\ncall setline(1, 'Changed during first-send consent')\nlet g:wbx_conversation_edit = 0\nendif\nreturn g:wbx_conversation_confirm\nendfunction"
execute 'function! <SNR>' . s:sid . "_pick(lines, Callback) abort\ncall call(a:Callback, [2])\nendfunction"
runtime autoload/wbx/sections.vim
let s:sections_sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/sections.vim$"')[0].sid
execute 'function! <SNR>' . s:sections_sid . "_pick(lines, Callback) abort\ncall call(a:Callback, [get(g:, 'sections_choice', 0)])\nendfunction"
let s:file = $WBX_EDITOR_RESULT . '.local.txt'
call writefile(['Local file, not message text'], s:file)
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:select(id) abort
  call wbx#select(a:id)
  call s:wait('get(wbx#state(), "ready", 0) && type(wbx#state().room) == v:t_dict && wbx#state().room.id ==# ' . string(a:id))
endfunction
function! s:send_and_edit() abort
  WebexSend
  call setline(1, 'Newer recipient draft text')
endfunction
try
  call feedkeys("\\Wnd", 'xt')
  call assert_false(wbx#transport#running(), 'new conversation helpers cannot start/reconnect an unconnected backend')
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call s:select('demo-general')
  call feedkeys("\\Wvs", 'xt')
  call feedkeys("\\Wvn1\<CR>", 'xt')
  let g:sections_choice = 2
  call feedkeys("\\Wvf", 'xt')
  call assert_equal('unread', wbx#sections#current_filter(), 'native filter key does not retarget selection')
  WebexFilter all
  call assert_equal('demo-general', wbx#state().room.id)
  WebexCompose
  let general = bufnr('%')
  call setline(1, 'Existing normal-room draft')
  call wbx#uploads#stage(s:file)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  let general_file = wbx#drafts#upload(general)
  let general_tick = b:changedtick
  let general_undo = undotree().seq_cur
  let old_messages = deepcopy(wbx#state().messages)
  call feedkeys("\\Wndnew-person\<CR>", 'xt')
  call s:wait('exists("b:wbx_recipient")')
  let direct = bufnr('%')
  call assert_notequal(general, direct)
  call assert_equal('new-person', b:wbx_recipient.personId)
  call assert_equal(3, len(wbx#state().rooms), 'preparing a recipient does not create a visible empty room or placeholder')
  call assert_equal(old_messages, wbx#state().messages)
  call assert_equal({}, get(b:, 'wbx_staged_upload', {}), 'no file/draft adoption from another room')
  call setline(1, 'First direct message')
  silent! write
  call feedkeys("\<CR>", 'xt')
  sleep 30m
  call assert_equal(3, len(wbx#state().rooms), 'writes/Enter never create a DM')
  let g:wbx_conversation_confirm = 0
  WebexSend
  sleep 30m
  call assert_equal(3, len(wbx#state().rooms), 'first-send creation side effect needs confirmation')
  let g:wbx_conversation_confirm = 1
  let g:wbx_conversation_edit = 1
  WebexSend
  sleep 30m
  call assert_equal(3, len(wbx#state().rooms), 'changed draft during recipient consent cannot create/send into a DM')
  call assert_equal('Changed during first-send consent', getline(1))
  call setline(1, 'First direct message')
  call s:send_and_edit()
  call s:wait('!wbx#conversations#pending() && has_key(get(b:, "wbx_recipient", {}), "roomId")')
  let actual = b:wbx_recipient.roomId
  call assert_equal('Newer recipient draft text', getline(1), 'late ACK retains newer native text')
  call assert_equal('demo-general', wbx#state().room.id, 'ACK never auto-selects/adopts another room')
  call assert_equal(4, len(wbx#state().rooms))
  call assert_equal(['Existing normal-room draft'], getbufline(general, 1, '$'))
  call assert_equal(general_tick, getbufvar(general, 'changedtick'))
  call assert_equal(general_file, wbx#drafts#upload(general))
  call feedkeys("\\Wno", 'xt')
  call s:wait('get(wbx#state(), "ready", 0) && wbx#state().room.id !=# "demo-general"')
  call assert_equal(actual, wbx#state().room.id)
  call assert_equal('First direct message', wbx#state().messages[0].text)
  execute 'buffer ' . direct
  WebexSend
  call s:wait('!wbx#conversations#pending() && getline(1) ==# ""')
  " Send ACK clears the exact draft before the separate room projection settles.
  call s:wait('len(wbx#state().messages) == 2')
  call assert_equal(2, len(wbx#state().messages))
  call assert_equal('Newer recipient draft text', wbx#state().messages[-1].text)
  call setline(1, 'Canceled recipient text retained')
  call feedkeys("\\Wnc", 'xt')
  call assert_true(b:wbx_recipient_stale)
  WebexSend
  sleep 30m
  call assert_equal(2, len(wbx#state().messages))
  call assert_equal('Canceled recipient text retained', getline(1))

  call feedkeys("\\WnsSeparate invitations\<CR>", 'xt')
  call s:wait('!wbx#conversations#pending() && len(wbx#state().rooms) == 5')
  let created = filter(copy(wbx#state().rooms), 'v:val.id =~# "^demo-created-"')[0].id
  call s:select(created)
  call assert_equal([], wbx#state().messages)
  WebexCompose
  let group_draft = bufnr('%')
  call setline(1, 'Group draft retained after leave')
  call wbx#uploads#stage(s:file)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  let group_tick = b:changedtick
  call feedkeys("\\Wvp", 'xt')
  call s:wait('exists("b:wbx_members_snapshot") && len(b:wbx_members_snapshot.items) == 1')
  call feedkeys("\\Wniguest-person\<CR>", 'xt')
  call s:wait('!wbx#conversations#pending()')
  WebexMembers
  call s:wait('len(get(get(b:, "wbx_members_snapshot", {}), "items", [])) == 2')
  call feedkeys("\\Wnr", 'xt')
  call s:wait('!wbx#conversations#pending()')
  WebexMembers
  call s:wait('len(get(get(b:, "wbx_members_snapshot", {}), "items", [])) == 2')
  call assert_equal(2, len(b:wbx_members_snapshot.items), 'nonmoderator removal is refused, never inferred')
  call feedkeys("\\Wnl", 'xt')
  call s:wait('!wbx#conversations#pending() && !get(wbx#state(), "ready", 1)')
  call assert_equal(created, wbx#state().room.id, 'leave revokes readiness, not the draft destination')
  call assert_equal([], filter(copy(wbx#state().rooms), 'v:val.id ==# created'))
  call assert_equal(['Group draft retained after leave'], getbufline(group_draft, 1, '$'))
  call assert_equal(group_tick, getbufvar(group_draft, 'changedtick'))
  call assert_true(wbx#drafts#upload(group_draft).stale)
  call assert_equal(general_file, wbx#drafts#upload(general), 'room revocation does not revoke unrelated staged snapshots')
  WebexRefresh
  sleep 30m
  call assert_false(wbx#state().ready, 'history refresh cannot restore left-room authority')
  call assert_match('does NOT delete the room', join(g:wbx_conversation_prompts, ' '))

  call feedkeys("\\Wvt", 'xt')
  call s:wait('exists("b:wbx_teams_snapshot")')
  call assert_equal('demo-team', b:wbx_teams_snapshot.items[0].id)
  call assert_match('Server Teams', getline(1))
  call cursor(3, 1)
  WebexTeamFilter
  call assert_equal('team:demo-team', wbx#sections#current_filter())
  call assert_equal(['demo-engineering'], filter(copy(getbufvar(wbx#buffers().rooms, 'wbx_room_ids')), '!empty(v:val)'))
  call assert_equal(created, wbx#state().room.id, 'Team filter cannot retarget a hidden selected draft')
  WebexFilter all
  call s:select('demo-engineering')
  WebexMembers
  call s:wait('exists("b:wbx_members_snapshot") && b:wbx_members_snapshot.roomId ==# "demo-engineering" && len(b:wbx_members_snapshot.items) == 2')
  WebexRemoveMember
  call s:wait('!wbx#conversations#pending()')
  WebexMembers
  call s:wait('len(get(get(b:, "wbx_members_snapshot", {}), "items", [])) == 1')
  call s:select('demo-general')
  WebexCompose
  call assert_equal(general, bufnr('%'))
  call assert_equal(['Existing normal-room draft'], getline(1, '$'))
  call assert_equal(general_undo, undotree().seq_cur)
  call assert_equal(general_file, wbx#drafts#upload(general))
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_true(getbufvar(direct, 'wbx_recipient_stale'))
  call assert_equal(['Canceled recipient text retained'], getbufline(direct, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
