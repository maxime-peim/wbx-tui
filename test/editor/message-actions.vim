" Actual demo backend; only modal user choices are synthetic. No provider calls.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend = $WBX_TEST_SOURCE_BACKEND ==# '1'
      \ ? [$WBX_NODE, '--import', $WBX_EDITOR_ROOT . '/node_modules/tsx/dist/loader.mjs', $WBX_EDITOR_ROOT . '/src/editor-main.ts']
      \ : [$WBX_NODE, $WBX_EDITOR_ROOT . '/dist/editor-main.js']
let g:wbx_tui = {'backend': s:backend, 'images': 0, 'notifications': 0, 'upcoming_meetings': 0, 'mark_read_on_open': 0}
runtime autoload/wbx/message_actions.vim
runtime autoload/wbx/rich.vim
let g:wbx_confirm = 1
let g:wbx_confirm_prompts = []
for script in ['message_actions', 'rich']
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx/" . script . ".vim$"')[0].sid
  execute 'function! <SNR>' . sid . "_confirm(text) abort\ncall add(g:wbx_confirm_prompts, a:text)\nif get(g:, 'wbx_consent_edit', 0)\ncall setline(1, 'Changed during confirmation')\nlet g:wbx_consent_edit = 0\nendif\nreturn g:wbx_confirm\nendfunction"
  if script ==# 'rich'
    execute 'function! <SNR>' . sid . "_select(lines, Callback) abort\nif get(g:, 'wbx_pick_edit', 0)\ncall setline(1, 'New native work during choice')\nlet g:wbx_pick_edit = 0\nendif\ncall call(a:Callback, [2])\nendfunction"
  endif
endfor
function! s:wait(expression) abort
  let started = reltime()
  while !eval(a:expression) && reltimefloat(reltime(started)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:history(id) abort
  execute 'buffer ' . wbx#buffers().history
  let blocks = filter(copy(b:wbx_message_blocks), 'v:val.id ==# a:id')
  call assert_equal(1, len(blocks))
  if !empty(blocks) | call cursor(blocks[0].body, 1) | endif
endfunction
function! s:send_change_format() abort
  WebexSend
  WebexFormat plain
endfunction
try
  call feedkeys("\\Wae", 'xt')
  call assert_false(wbx#transport#running(), 'message actions from ordinary/unconnected buffers never start a backend')
  WebexDemo
  call s:wait('get(wbx#state(), "state", "") ==# "ready" && len(wbx#state().rooms) == 3')
  call wbx#select('demo-general')
  call s:wait('get(wbx#state(), "ready", 0)')
  WebexCompose
  let composer = bufnr('%')
  let g:wbx_pick_edit = 1
  call feedkeys("\\Waf", 'xt')
  call assert_equal('plain', get(b:, 'wbx_format', 'plain'), 'a changed draft while choosing revokes format intent')
  call assert_equal('New native work during choice', getline(1))
  call setline(1, 'Own original')
  WebexSend
  call s:wait('!wbx#drafts#pending() && getline(1) ==# ""')
  let own = wbx#state().messages[-1].id
  let s:message_count = len(wbx#state().messages)
  call s:history(own)
  call feedkeys("\\Wae", 'xt')
  call s:wait('exists("b:wbx_message_context")')
  let edit = bufnr('%')
  call assert_equal('Own original', getline(1))
  call feedkeys("\\Wac", 'xt')
  call assert_match('canceled', b:wbx_mutation_status)
  call assert_equal('Own original', getline(1), 'cancel key retains native text')
  call s:history(own)
  call feedkeys("\\Wae", 'xt')
  call s:wait('exists("b:wbx_message_context") && bufnr("%") != ' . edit)
  let edit = bufnr('%')
  call setline(1, 'Own edited 😀')
  let g:wbx_consent_edit = 1
  call feedkeys("\\Was", 'xt')
  sleep 30m
  call assert_equal('Own original', wbx#state().messages[-1].text, 'editing during consent revokes the old submit intent')
  call assert_equal('Changed during confirmation', getline(1))
  call setline(1, 'Own edited 😀')
  call assert_match('EDIT.*prepared.*→ demo-general', b:wbx_reply_banner[1])
  let changed = b:changedtick
  let undo = undotree().seq_cur
  silent! write
  call feedkeys("\<CR>", 'xt')
  sleep 30m
  call assert_equal('Own original', wbx#state().messages[-1].text, 'write/Enter do not submit')
  let g:wbx_confirm = 0
  call feedkeys("\\Was", 'xt')
  sleep 30m
  call assert_equal('Own original', wbx#state().messages[-1].text, 'non-atomic conflict policy requires explicit per-submit consent')
  let g:wbx_confirm = 1
  let history = wbx#buffers().history
  call setbufvar(history, '&modifiable', 1)
  call setbufline(history, 1, 'Native annotation retained')
  call feedkeys("\\Was", 'xt')
  call s:wait('get(b:, "wbx_mutation_status", "") ==# "changed"')
  call assert_equal('Own edited 😀', wbx#state().messages[-1].text)
  call assert_true(wbx#state().messages[-1].edited)
  call assert_equal(s:message_count, len(wbx#state().messages), 'edit is not a creation')
  call assert_equal([edit, changed, undo], [bufnr('%'), b:changedtick, undotree().seq_cur], 'ACK never rewrites native edit text/undo/focus')
  call assert_equal('Native annotation retained', getbufline(history, 1)[0], 'backend mutation cannot discard history annotations')
  call assert_match('cannot prevent a GET/PUT race', join(g:wbx_confirm_prompts, ' '))
  execute 'buffer ' . history
  WebexRefresh!
  call s:wait('getbufline(wbx#buffers().history, 1)[0] !=# "Native annotation retained"')
  call s:history(own)
  WebexReply
  let reply = bufnr('%')
  call setline(1, 'Reply draft survives root deletion')
  call s:history(own)
  let g:wbx_confirm = 0
  call feedkeys("\\Wad", 'xt')
  sleep 50m
  call assert_equal(s:message_count, len(wbx#state().messages), 'canceling delete never mutates')
  let g:wbx_confirm = 1
  call feedkeys("\\Wad", 'xt')
  call s:wait('len(wbx#state().messages) == s:message_count - 1')
  call assert_equal(['Reply draft survives root deletion'], getbufline(reply, 1, '$'))
  call assert_false(wbx#state().historyLatest, 'deleted latest is not replaced with invented receipt authority')
  WebexCancelReply
  WebexCompose
  call assert_equal(composer, bufnr('%'))
  call setline(1, '<@all> remains literal')
  WebexSend
  call s:wait('!wbx#drafts#pending() && getline(1) ==# ""')
  call assert_false(has_key(wbx#state().messages[-1], 'markdown'), 'literal plaintext never promotes mentions')
  call feedkeys("\\Waf", 'xt')
  call setline(1, '**Markdown 😀**')
  call assert_match('MARKDOWN', wbx#buffer_status())
  WebexSend
  call s:wait('!wbx#drafts#pending() && getline(1) ==# ""')
  call assert_equal('**Markdown 😀**', wbx#state().messages[-1].markdown)
  call setline(1, '<@all>')
  let g:wbx_consent_edit = 1
  let s:before_consent = len(wbx#state().messages)
  WebexSend
  sleep 30m
  call assert_equal(s:before_consent, len(wbx#state().messages), 'rich send cannot submit old content after consent changed the draft')
  call assert_equal('Changed during confirmation', getline(1))
  call setline(1, '**Changed format while sending**')
  call s:send_change_format()
  call s:wait('!wbx#drafts#pending()')
  call assert_equal('**Changed format while sending**', getline(1), 'old rich ACK cannot clear a newly changed format/draft intent')
  call setline(1, '')
  WebexFormat markdown
  call feedkeys("\\Wam", 'xt')
  call s:wait('getline(1) =~# "<@personId:demo-other|"')
  let mention = getline(1)
  call assert_match('Participant', mention)
  let prompt_count = len(g:wbx_confirm_prompts)
  WebexSend
  call s:wait('!wbx#drafts#pending() && getline(1) ==# ""')
  call assert_equal(mention, wbx#state().messages[-1].markdown)
  call assert_equal(prompt_count, len(g:wbx_confirm_prompts), 'individual mentions dispatch without another confirmation')
  call feedkeys("\\WaM", 'xt')
  call assert_match('<@all>', getline(1))
  let before = len(wbx#state().messages)
  let g:wbx_confirm = 0
  WebexSend
  sleep 30m
  call assert_equal(before, len(wbx#state().messages), '@all needs distinct submission consent')
  let g:wbx_confirm = 1
  WebexSend
  call s:wait('!wbx#drafts#pending() && getline(1) ==# ""')
  call assert_match('ATTENTION: @all', join(g:wbx_confirm_prompts, ' '))
  call feedkeys("\\Wvp", 'xt')
  call s:wait('exists("b:wbx_members_snapshot")')
  call assert_equal(2, len(b:wbx_members_snapshot.items))
  call assert_false(b:wbx_members_snapshot.partial)
  call assert_equal('demo-general', b:wbx_members_snapshot.roomId)
  call assert_equal('demo-general', wbx#state().room.id)
  call assert_false(&modifiable)
  WebexDisconnect
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
