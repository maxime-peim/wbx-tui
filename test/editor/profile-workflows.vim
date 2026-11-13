" Real account-free backend; exact source IDs, native keys/help, no presence or writes.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0,
      \ 'read_status': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
runtime autoload/wbx/directory.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/directory.vim$"')[0].sid
execute 'function! <SNR>' . s:sid . "_input() abort\nreturn 'Demo'\nendfunction"
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 6 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call assert_true(wbx#supports('people-profile-v1'))
  call feedkeys("\\Wnp", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "directory" && exists("b:wbx_directory_snapshot")')
  call cursor(6, 1)
  let person = b:wbx_directory_snapshot.items[1].personId
  let directory = bufnr('%')
  call feedkeys("\\WnP", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "profile" && exists("b:wbx_profile_snapshot")')
  call assert_equal(person, b:wbx_profile_snapshot.personId, 'same-name directory labels never substitute another identity')
  call assert_equal('person-text', b:wbx_profile_snapshot.coverage)
  call assert_match(person, getline(1))
  call assert_match('Department: Account-free demo', join(getline(1, '$'), ' '))
  call assert_match('Presence/custom status excluded; avatars not fetched', getline(4))
  call assert_equal('', maparg('<CR>', 'n'), 'profile never claims Enter for sending, DM preparation or a URL')
  call assert_true(wbx#state().room is v:null, 'explicit profile needs no implicit room open')
  let profile = bufnr('%')
  WebexActions
  call assert_match('WebexProfileRefresh', join(getline(1, '$'), ' '))
  call assert_match('WnP.*WebexProfile', join(getline(1, '$'), ' '))
  normal q
  call assert_equal(profile, bufnr('%'))
  let observed = b:wbx_profile_snapshot.observedAt
  sleep 5m
  normal r
  call s:wait('get(get(b:, "wbx_profile_snapshot", {}), "observedAt", 0) > ' . observed)
  call assert_equal(person, b:wbx_profile_snapshot.personId, 'refresh keeps the exact source, not the current roster/name')
  normal q
  call assert_equal(directory, bufnr('%'))
  call assert_equal(person, wbx#directory#selected().personId)
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let composer = bufnr('%')
  call feedkeys("iRetained independent draft\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let draft_undo = undotree()
  let messages = wbx#state().messages
  WebexMembers
  call s:wait('get(b:, "wbx_list_kind", "") ==# "members" && exists("b:wbx_members_snapshot")')
  call assert_equal(wbx#state().localContext.sessionId, b:wbx_members_session)
  call cursor(5, 1)
  let member = wbx#members#selected().personId
  call feedkeys("\\WnP", 'xt')
  call s:wait('get(b:, "wbx_list_kind", "") ==# "profile" && get(get(b:, "wbx_profile_snapshot", {}), "personId", "") ==# ' . string(member))
  call assert_equal(member, b:wbx_profile_snapshot.personId)
  let unchanged = deepcopy(b:wbx_profile_snapshot)
  call wbx#redraw()
  call assert_equal(unchanged, b:wbx_profile_snapshot, 'background rendering does not refresh or enrich profile')
  set lines=18 columns=44
  redraw!
  set lines=60 columns=160
  normal q
  normal q
  call assert_equal(composer, bufnr('%'))
  call assert_equal(draft_undo, undotree())
  normal! u
  call assert_equal([''], getline(1, '$'), 'full native draft undo survives profile/roster navigation')
  execute "normal! \<C-r>"
  call assert_equal(['Retained independent draft'], getline(1, '$'))
  execute 'WebexProfile ' . member
  call s:wait('get(b:, "wbx_list_kind", "") ==# "profile"')
  call assert_equal(messages, wbx#state().messages, 'profile is never a send, placeholder, mention or incoming event')
  call assert_equal('off', wbx#state().peopleStatus.capability, 'presence opt-out is independent and unchanged')
  setlocal modifiable
  call setline(1, 'Private profile annotation')
  let tree = undotree()
  normal r
  normal q
  WebexProfile demo-other
  call assert_equal('Private profile annotation', getline(1))
  call assert_equal(tree, undotree())
  setlocal buftype=
  WebexProfile demo-other
  call assert_equal('', &buftype)
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\WnP', 'n'))
  call assert_equal(2, exists(':WebexProfile'))
  WebexDisconnect
  call s:wait('get(wbx#state(), "state", "") ==# "idle"')
  call assert_equal('Private profile annotation', getline(1))
  call assert_equal(['Retained independent draft'], getbufline(composer, 1, '$'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
