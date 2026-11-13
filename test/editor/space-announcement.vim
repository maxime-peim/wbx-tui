" MF23 expected-red actual-demo announcement workflow; no live activation.
set encoding=utf-8 hidden noswapfile nomore lines=60 columns=180
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'mark_read_on_open': 0, 'people_status': 0, 'sender_names': 0, 'spaces_cache': 0}
runtime autoload/wbx/conversations.vim
let s:sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/conversations.vim$"')[0].sid
let g:announcement_accept = 1 | let g:announcement_prompts = []
execute 'function! <SNR>' . s:sid . "_confirm(text) abort\ncall add(g:announcement_prompts, a:text)\nreturn g:announcement_accept\nendfunction"
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready"')
  WebexCreateSpace Announcement contract standalone
  call s:wait('!wbx#conversations#pending()')
  WebexConversationOpen
  call s:wait('get(wbx#state(), "ready", 0) && get(get(wbx#state(), "room", {}), "title", "") ==# "Announcement contract standalone"')
  WebexCompose
  " Explicit sandbox-only message and lock; announcement commands never set up a lock.
  call feedkeys("iSynthetic demo reply root\<Esc>", 'xt')
  WebexSend
  call s:wait('len(get(wbx#state(), "messages", [])) == 1 && !get(wbx#state(), "sending", 0)')
  WebexLockSpace
  call s:wait('!wbx#conversations#pending()')
  call feedkeys("iRetained native draft\<CR>Second line\<Esc>", 'xt')
  call feedkeys("i\<Esc>", 'xt')
  let composer = bufnr('%') | let window = win_getid() | let tree = undotree() | let body = getline(1, '$')
  let draft = wbx#drafts#draft_id(composer) | let before = deepcopy(wbx#state())
  let remove_key = maparg('\Wnr', 'n') | let color = execute('highlight Normal')
  call assert_equal(2, exists(':WebexAnnouncementOn'), 'announcement mode is a named finite action, not Send or a toggle')
  call assert_equal(2, exists(':WebexAnnouncementOff'))
  let g:announcement_accept = 0
  WebexAnnouncementOn
  call assert_false(wbx#conversations#pending(), 'default Cancel admits no announcement PUT')
  call assert_equal(before, wbx#state()) | call assert_equal(tree, undotree())
  let g:announcement_accept = 1
  WebexAnnouncementOn
  call s:wait('!wbx#conversations#pending()')
  call assert_equal(composer, bufnr('%')) | call assert_equal(window, win_getid())
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  call assert_equal(draft, wbx#drafts#draft_id(composer)) | call assert_equal(before, wbx#state())
  call assert_match(before.room.id, g:announcement_prompts[-1]) | call assert_match(before.room.title, g:announcement_prompts[-1])
  call assert_match('moderator', tolower(g:announcement_prompts[-1]))
  call assert_match('bot', tolower(g:announcement_prompts[-1]))
  call assert_match('integration', tolower(g:announcement_prompts[-1]))
  call assert_match('notif', tolower(g:announcement_prompts[-1]), 'enabling is not advertised as silent to participants')
  call assert_match('title', tolower(g:announcement_prompts[-1]))
  call assert_match('race\|concurrent\|atomic', tolower(g:announcement_prompts[-1]))
  WebexAnnouncementOff
  call s:wait('!wbx#conversations#pending()')
  call assert_equal(before, wbx#state(), 'mode ACKs never infer main flags, posting roles, history, unread or local alerts')
  call assert_equal(body, getline(1, '$')) | call assert_equal(tree, undotree())
  let prompts = len(g:announcement_prompts)
  silent! write
  call assert_equal(prompts, len(g:announcement_prompts), 'write/Enter never change mode')
  let history = wbx#buffers().history
  execute 'buffer ' . history
  setlocal modifiable
  call append(1, 'Private annotated history')
  let annotation = getline(1, '$') | let annotation_tree = undotree()
  WebexAnnouncementOn
  call s:wait('!wbx#conversations#pending()')
  call assert_equal(annotation, getline(1, '$')) | call assert_equal(annotation_tree, undotree())
  let root = wbx#state().messages[0].id
  call wbx#drafts#reply(wbx#state().room.id, root)
  call wbx#compose()
  call feedkeys("iRetained reply root and file\<Esc>", 'xt')
  WebexFormat markdown
  let path = $WBX_EDITOR_RESULT . '.announcement.bin'
  call writefile(['Immutable staged file'], path, 'b')
  call wbx#uploads#stage(path)
  call s:wait('!empty(wbx#drafts#upload(bufnr("%")))')
  let file = wbx#drafts#upload(bufnr('%')) | let reply_tree = undotree()
  let reply = bufnr('%') | let reply_draft = wbx#drafts#draft_id(reply)
  WebexAnnouncementOff
  call s:wait('!wbx#conversations#pending()')
  call assert_equal(reply, bufnr('%')) | call assert_equal(root, b:wbx_parent)
  call assert_equal('markdown', b:wbx_format) | call assert_equal(file, wbx#drafts#upload(reply))
  call assert_equal(reply_draft, wbx#drafts#draft_id(reply)) | call assert_equal(reply_tree, undotree())
  call assert_equal(['Retained reply root and file'], getline(1, '$'))
  setlocal buftype=
  let prompts = len(g:announcement_prompts)
  WebexAnnouncementOn
  call assert_false(wbx#conversations#pending()) | call assert_equal(prompts, len(g:announcement_prompts))
  call assert_equal(reply_tree, undotree(), 'promoted work cannot authorize an announcement change')
  call assert_equal(color, execute('highlight Normal')) | call assert_equal(remove_key, maparg('\Wnr', 'n'))
  let g:wbx_tui.mappings = 0
  call wbx#commands#setup()
  call assert_equal('', maparg('\Wnr', 'n'))
  call assert_equal(2, exists(':WebexAnnouncementOn')) | call assert_equal(2, exists(':WebexAnnouncementOff'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
