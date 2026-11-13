" Adjacent mention labels must not wrap between @ and the first name word.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let g:wbx_tui = {'message_borders': 'none'}
syntax on
try
  enew
  file wbx://history
  setlocal buftype=nofile wrap linebreak conceallevel=2 concealcursor=nc nonumber norelativenumber signcolumn=no foldcolumn=0
  let b:wbx_kind = 'history' | let b:wbx_history_room = 'room'
  let id = repeat('opaque-person-id', 6)
  let spark = '<spark-mention data-object-type="person" data-object-id="' . id . '">First person</spark-mention> '
        \ . '<spark-mention data-object-type="person" data-object-id="' . id . '2">Second person</spark-mention> end'
  let angle = '<@personId:' . id . '|First person> <@personId:' . id . '2|Second person> end'
  let messages = map([spark, angle], '{"id": "mention-" . v:key, "author": "Synthetic", "created": "2026-11-16T10:00:00Z", "text": v:val, "markdown": v:val}')
  let original = deepcopy(messages)
  let view = wbx#history#render(messages, 0)
  call assert_equal(original, messages, 'projection retains raw state and send/edit identities')
  for block in view.blocks | call assert_equal('@First person @Second person end', view.lines[block.body - 1]) | endfor
  call assert_equal('`' . angle . '`', wbx#message_text#published('`' . angle . '`'))
  call assert_equal("```\n" . spark . "\n```", wbx#message_text#published("```\n" . spark . "\n```"))
  call assert_equal('\<@all>', wbx#message_text#published('\<@all>'))
  for literal in ["`multiline\n<@all>\ncode`", "> ```vim\n> <@all>\n> ```", "- ```\n  <@all>\n  ```"]
    let protected = wbx#message_text#project(literal)
    call assert_equal(literal, protected.text, 'nested/multiline code retains exact literal syntax')
    call assert_equal([], protected.mentions, 'nested/multiline code is not mention identity')
  endfor
  for cluster in ["e\u0301", '界', '👩‍💻', '🇫🇷', '👍🏽', "✈\ufe0f"]
    call assert_equal(cluster, wbx#text#truncate(cluster, 1), 'one supported cluster fits without omission')
    call assert_equal('…', wbx#text#truncate(cluster . 'x', 1))
    call assert_equal(cluster . '…', wbx#text#truncate(cluster . 'xy', 2), 'omission counts toward the cluster bound')
  endfor
  call assert_equal('', wbx#text#truncate('abc', 0))
  call assert_equal('ab…', wbx#text#truncate('abcd', 3))
  let mixed = wbx#message_text#project("`multiline\n<@all>\ncode` then <@all>")
  call assert_equal("`multiline\n<@all>\ncode` then @all", mixed.text)
  call assert_equal([[3, strlen('code` then ') + 1, 4]], mixed.mentions)
  call assert_equal('**@First person**', wbx#message_text#published('**<@personId:person|First person>**'))
  let projected = wbx#message_text#project('<@personId:person|Élodie Example> <@all> `literal <@all>`')
  call assert_equal([[1, 1, strlen('@Élodie Example')], [1, strlen('@Élodie Example ') + 1, 4]], projected.mentions,
        \ 'highlight ranges use exact UTF-8 bytes and exclude code')
  call assert_equal([], wbx#message_text#project('Literal @Name').mentions, 'plain name lookalikes do not acquire mention identity/highlighting')
  let many = wbx#message_text#project(repeat("<@all>\n", 100))
  call assert_equal(32, len(many.mentions), 'native highlight decoration is bounded per message')
  call assert_equal(repeat("@all\n", 100), many.text, 'the styling bound does not omit readable message content')
  for author in [repeat('a', 79) . "e\u0301", repeat('a', 79) . '👩‍💻', repeat('a', 79) . '🇫🇷', repeat('a', 79) . '👍🏽']
    let labelled = wbx#history#render([{'id': 'unicode', 'author': author, 'created': '', 'text': 'Body'}], 0)
    call assert_true(stridx(labelled.lines[0], author . ' ·') == 0, 'header truncation keeps supported composed/emoji graphemes intact: ' . strcharpart(author, 79))
  endfor
  call setline(1, view.lines)
  let b:wbx_message_blocks = view.blocks | let b:wbx_message_rows = view.headers
  let b:wbx_reply_rows = [] | let b:wbx_quote_rows = [] | let b:wbx_render_tick = b:changedtick
  setlocal filetype=wbx-history
  call wbx#history#syntax()
  call feedkeys("i\<Esc>", 'xt')
  let native = [getline(1, '$'), b:changedtick, undotree()]
  if $WBX_EDITOR_SCREEN ==# '1'
    vsplit
    for width in [32, 40, 48, 56, 64, 72, 80, 96, 112]
      execute 'vertical resize ' . width
      for block in b:wbx_message_blocks
        call cursor(block.body, 1)
        normal! zt
        redraw!
        let info = getwininfo(win_getid())[0]
        let first = screenpos(win_getid(), block.body, 1).row
        let last = screenpos(win_getid(), block.body + 1, 1).row - 1
        let rows = []
        for row in range(first, last)
          call add(rows, join(map(range(info.width), 'screenstring(row, info.wincol + v:val)'), ''))
        endfor
        let shown = join(rows, "\n")
        call assert_match('@First', shown, block.id . ' width ' . width . ' keeps @ attached to first word')
        call assert_match('@Second', shown, block.id . ' width ' . width . ' keeps @ attached to second word')
        call assert_notmatch('opaque-person-id\|spark-mention\|personId:', shown)
      endfor
    endfor
  endif
  call assert_equal(native, [getline(1, '$'), b:changedtick, undotree()], 'presentation never rewrites original history or undo')
  enew
  file wbx://compose/room
  setlocal buftype=nofile filetype=markdown wrap linebreak conceallevel=2 concealcursor=nvic
  let b:wbx_kind = 'compose' | let b:wbx_room = 'room' | let b:wbx_format = 'markdown'
  call setline(1, [angle, ''])
  call wbx#rich#syntax()
  call feedkeys("i\<Esc>", 'xt')
  let native = [getline(1, '$'), b:changedtick, undotree(), &breakat]
  if $WBX_EDITOR_SCREEN ==# '1'
    for width in range(20, 120)
      execute 'vertical resize ' . width
      call cursor(2, 1)
      normal! ggzt
      redraw!
      let info = getwininfo(win_getid())[0]
      let rows = []
      for row in range(screenpos(win_getid(), 1, 1).row, screenpos(win_getid(), 2, 1).row - 1)
        call add(rows, join(map(range(info.width), 'screenstring(row, info.wincol + v:val)'), ''))
      endfor
      let shown = join(rows, "\n")
      call assert_match('@First', shown, 'composer width ' . width . ' keeps @ attached to first word')
      call assert_match('@Second', shown, 'composer width ' . width . ' keeps @ attached to second word')
      call assert_notmatch('opaque-person-id\|personId:', shown, 'composer keeps exact recipient IDs concealed')
    endfor
  endif
  call assert_equal(native, [getline(1, '$'), b:changedtick, undotree(), &breakat], 'composer presentation retains raw draft, undo and global break characters')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
