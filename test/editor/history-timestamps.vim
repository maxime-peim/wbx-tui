" C1 timestamp grammar/containment and painted colors, without backend/account/media.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable
let g:wbx_tui = {'threaded_history': 0, 'images': 0}
let s:painted = []
function! s:group(row, text) abort
  let column = stridx(getline(a:row), a:text) + 1
  call assert_true(column > 0, 'timestamp probe text exists')
  return synIDattr(synID(a:row, max([1, column]), 1), 'name')
endfunction
function! s:paint(row, reference, case) abort
  if $WBX_EDITOR_SCREEN !=# '1' | return | endif
  normal! gg0
  redraw!
  let column = stridx(getline(a:row), '2026-11-07') + 1
  let date = screenpos(win_getid(), a:row, column)
  let reference = screenpos(win_getid(), a:reference, 1)
  call assert_true(date.row > 0 && reference.row > 0, a:case . ': date and Comment reference are visible')
  call assert_equal(char2nr('2'), screenchar(date.row, date.col), a:case . ': actual timestamp glyph is drawn')
  call assert_equal(screenattr(reference.row, reference.col), screenattr(date.row, date.col), a:case . ': painted timestamp uses Comment, not whole-header Title')
  call add(s:painted, {'case': a:case, 'date': screenattr(date.row, date.col), 'reference': screenattr(reference.row, reference.col)})
endfunction
function! s:reference(row) abort
  highlight default link WbxTimestampReference Comment
  execute 'syntax match WbxTimestampReference /\%' . a:row . 'l^Expected timestamp color$/ containedin=ALL'
endfunction
try
  " Legacy zone-less headers and zoned/edited forms must use one suffix grammar.
  let suffixes = ['', ' UTC', ' +05:30', ' -07:00 · edited']
  for suffix in suffixes
    enew!
    call setline(1, ['# Fallback', '', '## Author · 2026-11-07 10:15' . suffix,
          \ '**Native Markdown** and `inline code`', '', 'Expected timestamp color'])
    setlocal syntax=wbx-history
    syntax sync fromstart
    call s:reference(6)
    call assert_equal('WbxMessageHeader', s:group(3, 'Author'), 'fallback header stays Title')
    call assert_equal('WbxMessageTime', s:group(3, '2026-11-07'), 'fallback time suffix: ' . suffix)
    call assert_match('^markdown', s:group(4, 'Native Markdown'))
    call assert_match('^markdown', s:group(4, 'inline code'))
    let text = getline(1, '$') | let tree = undotree() | let tick = b:changedtick
    call s:paint(3, 6, 'fallback ' . suffix)
    call wbx#history#syntax()
    call assert_equal([text, tree, tick], [getline(1, '$'), undotree(), b:changedtick], 'syntax/redraw never edits native text or undo')
  endfor

  enew!
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history'
  let messages = [
        \ {'id': 'utc', 'author': 'UTC author', 'created': '2026-11-07T10:15:00Z', 'text': "**Native Markdown** and `inline code`\n## Pretend UI · 2026-11-07 10:15 UTC"},
        \ {'id': 'offset', 'author': 'Offset author', 'created': '2026-11-07T10:16:00+05:30', 'edited': v:true, 'text': "**Independent body**\n```md\nunclosed"},
        \ {'id': 'negative', 'author': 'Negative author', 'created': '2026-11-07T10:17:00-07:00', 'text': '**Another body**'},
        \ {'id': 'missing', 'author': 'Missing author', 'created': '', 'text': '**No invented time**'}]
  let view = wbx#history#render(messages, 2)
  call setline(1, ['# Metadata timestamps', ''] + view.lines + ['Expected timestamp color'])
  let b:wbx_message_blocks = view.blocks | let b:wbx_message_rows = view.headers
  let b:wbx_quote_rows = view.quotes | let b:wbx_reply_rows = view.replies
  let b:wbx_render_tick = b:changedtick
  setlocal syntax=wbx-history
  syntax sync fromstart
  call s:reference(line('$'))
  let text = getline(1, '$') | let tree = undotree() | let tick = b:changedtick
  for block in view.blocks
    call assert_equal('WbxMessageHeader', s:group(block.start, 'author'))
    if block.id ==# 'missing'
      call assert_equal('WbxMessageHeader', s:group(block.start, 'time unavailable'), 'missing time never acquires a fabricated timestamp')
    else
      call assert_equal('WbxMessageTime', s:group(block.start, '2026-11-07'), 'metadata-bounded timestamp: ' . block.id)
      call s:paint(block.start, line('$'), 'metadata ' . block.id)
    endif
    call assert_match('^markdown', s:group(block.body, block.id ==# 'utc' ? 'Native Markdown' : block.id ==# 'offset' ? 'Independent body' : block.id ==# 'negative' ? 'Another body' : 'No invented time'))
    if block.id ==# 'utc'
      call assert_notequal('WbxMessageHeader', s:group(block.body + 1, 'Pretend UI'), 'body heading cannot claim header authority')
      call assert_notequal('WbxMessageTime', s:group(block.body + 1, '2026-11-07'), 'body timestamp cannot claim chrome color')
    endif
  endfor
  let colors = [execute('highlight WbxMessageHeader'), execute('highlight WbxMessageTime')]
  call wbx#history#syntax()
  call assert_equal([text, tree, tick], [getline(1, '$'), undotree(), b:changedtick])
  call assert_equal(colors, [execute('highlight WbxMessageHeader'), execute('highlight WbxMessageTime')], 'metadata refresh preserves theme links')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'painted': s:painted})], $WBX_EDITOR_RESULT)
qa!
