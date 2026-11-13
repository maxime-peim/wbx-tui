" Syntax-only native UI fixture: no plugin, backend, account or media jobs.
set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable

function! s:view(kind, lines, ...) abort
  enew!
  call setline(1, a:lines)
  if a:kind ==# 'rooms'
    let b:wbx_unread_rows = a:0 ? a:1 : []
  endif
  execute 'setlocal syntax=wbx-' . a:kind
  syntax sync fromstart
  call assert_equal('wbx-' . a:kind, get(b:, 'current_syntax', ''), a:kind . ' syntax loads natively')
endfunction
function! s:group(row, text) abort
  let column = match(getline(a:row), '\V' . escape(a:text, '\')) + 1
  call assert_true(column > 0, 'synthetic text exists: ' . a:text)
  return synIDattr(synID(a:row, max([1, column]), 1), 'name')
endfunction
function! s:link(group, target) abort
  call assert_match('links to ' . a:target . '\>', execute('highlight ' . a:group), a:group . ' uses a standard default link')
endfunction

try
  call s:view('rooms', ['Webex spaces · DEMO · ready', '', '  General', '● Engineering',
        \ '  [Loading spaces…]', '[Loading spaces…]', '[j/k move · Enter open · r refresh]',
        \ '[Messaging disconnected: drafts retained.]', 'Webex spaces · LIVE · failed', '    Indented title',
        \ '  Unread room', '● Unknown room', '● Unread open space', '  Literal [UNREAD]'], [11, 13])
  call assert_equal('WbxTitle', s:group(1, 'Webex spaces'))
  call assert_equal('WbxMode', s:group(1, 'DEMO'))
  call assert_equal('WbxStatus', s:group(1, 'ready'))
  call assert_equal('WbxRoom', s:group(3, 'General'), 'real rooms remain distinct from guidance')
  call assert_equal('WbxRoom', s:group(4, 'Engineering'), 'an open read title has ordinary room styling')
  call assert_equal('WbxSelected', s:group(4, '●'), 'only the open-space marker retains its accent')
  call assert_equal(synIDtrans(hlID('Normal')), synIDtrans(synID(4, 5, 1)), 'an open read title resolves to the normal text highlight')
  call assert_equal('WbxRoom', s:group(5, 'Loading'), 'bracketed room names are still rooms')
  call assert_equal('WbxMuted', s:group(6, 'Loading'))
  call assert_equal('WbxKey', s:group(7, 'j/k'))
  call assert_equal('WbxKey', s:group(7, 'Enter'))
  call assert_equal('WbxKey', s:group(7, 'r refresh'))
  call assert_equal('WbxMuted', s:group(7, 'move'))
  call assert_equal('WbxWarning', s:group(8, 'Messaging disconnected'))
  call assert_equal('WbxWarning', s:group(9, 'failed'))
  call assert_equal('WbxRoom', s:group(10, 'Indented title'), 'room titles may begin with whitespace')
  call assert_equal('WbxUnread', s:group(11, 'Unread room'), 'the entire confirmed unread title is emphasized')
  call assert_equal('WbxRoom', s:group(12, 'Unknown room'), 'unknown status does not invent unread emphasis')
  call assert_equal('WbxUnread', s:group(13, 'Unread open space'), 'an opened conversation can remain unread')
  call assert_equal('WbxSelected', s:group(13, '●'), 'unread emphasis never masks the current-space marker')
  call assert_equal('WbxRoom', s:group(14, '[UNREAD]'), 'literal room titles cannot spoof server unread styling')
  call assert_equal('1', synIDattr(hlID('WbxUnread'), 'bold', 'gui'), 'unread defaults to GUI bold')
  call assert_equal('1', synIDattr(hlID('WbxUnread'), 'bold', 'cterm'), 'unread defaults to terminal bold')
  call assert_equal(synIDattr(synIDtrans(hlID('Special')), 'fg#', 'gui'), synIDattr(hlID('WbxUnread'), 'fg#', 'gui'), 'unread uses the colorscheme accent instead of the ordinary text color')
  highlight CursorLine guifg=#ff0000 guibg=#343434 ctermfg=1 ctermbg=236 gui=bold cterm=bold
  call wbx#rooms#highlights()
  call assert_equal('#343434', synIDattr(hlID('WbxCurrent'), 'bg#', 'gui'), 'the current row uses the colorscheme cursor-line background')
  call assert_equal('236', synIDattr(hlID('WbxCurrent'), 'bg', 'cterm'))
  call assert_equal('', synIDattr(hlID('WbxCurrent'), 'fg#', 'gui'), 'the current cue never replaces read/unread title colors')
  call assert_notequal('1', synIDattr(hlID('WbxCurrent'), 'bold', 'gui'), 'the current cue never invents unread bold')
  highlight Special guifg=#12abcd ctermfg=42
  call wbx#rooms#highlights()
  call assert_equal('#12abcd', synIDattr(hlID('WbxUnread'), 'fg#', 'gui'), 'the plugin-owned default follows a new accent')
  call assert_equal('42', synIDattr(hlID('WbxUnread'), 'fg', 'cterm'), 'terminal palette colors also follow the accent')
  let b:wbx_unread_rows = [12]
  let unchanged_tick = b:changedtick
  call wbx#rooms#syntax()
  call assert_equal(unchanged_tick, b:changedtick, 'read-state styling does not edit buffer text')
  call assert_equal('WbxRoom', s:group(11, 'Unread room'), 'a confirmed read receipt removes emphasis')
  call assert_equal('WbxUnread', s:group(12, 'Unknown room'), 'metadata-only state changes restyle the title')
  call assert_equal('WbxRoom', s:group(13, 'Unread open space'), 'confirmed read clears an opened title back to normal, not a selected-row color')
  call assert_equal('WbxSelected', s:group(13, '●'), 'confirmed read retains the independent open marker')
  call s:view('rooms', ['Webex spaces · LIVE · ready', ''] + map(range(1, 500), '"  Room " . v:val'), range(3, 502))
  call assert_equal('WbxUnread', s:group(502, 'Room 500'), 'native syntax handles the full 500-room bound')
  let b:wbx_unread_rows = []
  call wbx#rooms#syntax()
  call assert_equal('WbxRoom', s:group(502, 'Room 500'), 'a large metadata-only clear removes stale emphasis')
  for [group, target] in items({'WbxRoom': 'Normal', 'WbxSelected': 'Directory', 'WbxTitle': 'Title',
        \ 'WbxMuted': 'Comment', 'WbxWarning': 'WarningMsg', 'WbxKey': 'Special', 'WbxMode': 'Type', 'WbxStatus': 'Comment'})
    call s:link(group, target)
  endfor

  " Actual drawn-cell checks run only in a private interactive PTY. Silent Ex
  " and headless editors do not provide reliable screenattr()/screenpos().
  if $WBX_EDITOR_SCREEN ==# '1'
    set notermguicolors
    highlight Normal term=NONE cterm=NONE gui=NONE ctermfg=7 ctermbg=0 guifg=#ffffff guibg=#000000
    highlight! link WbxExpectedCurrentRead Normal
    highlight WbxExpectedBackground term=underline ctermbg=236 cterm=NONE guibg=#343434 gui=NONE
    highlight WbxExpectedCurrentUnread term=bold,underline ctermfg=42 ctermbg=236 cterm=bold guifg=#12abcd guibg=#343434 gui=bold
    call s:view('rooms', ['● Current', '  Unread other', 'Expected current unread', 'Expected current read'], [1, 2])
    file wbx://spaces
    setlocal buftype=nofile
    let b:wbx_kind = 'rooms'
    let b:wbx_room_ids = ['current', 'other', '', '']
    let b:wbx_render_tick = b:changedtick
    call wbx#rooms#current()
    let reference_match = matchaddpos('WbxExpectedBackground', [4], -1)
    syntax match WbxExpectedCurrentUnread /^Expected current unread$/
    syntax match WbxExpectedCurrentRead /^Expected current read$/
    normal! G0
    redraw!
    let actual = screenpos(win_getid(), 1, 5)
    let unread = screenpos(win_getid(), 2, 3)
    let expected_unread = screenpos(win_getid(), 3, 1)
    let expected_read = screenpos(win_getid(), 4, 1)
    call assert_true(actual.row > 0 && expected_unread.row > 0, 'current row and reference are actually drawn')
    call assert_equal(char2nr('C'), screenchar(actual.row, actual.col))
    call assert_equal(screenattr(expected_unread.row, expected_unread.col), screenattr(actual.row, actual.col), 'current unread title combines bold/accent with the row background on screen')
    call assert_notequal(screenattr(unread.row, unread.col), screenattr(actual.row, actual.col), 'current and other unread rows are visually distinct')
    let b:wbx_unread_rows = [2]
    call wbx#rooms#syntax()
    redraw!
    call assert_equal(screenattr(expected_read.row, expected_read.col), screenattr(actual.row, actual.col), 'read confirmation retains the current background with normal foreground and no unread bold')
    call matchdelete(reference_match)
    enew
    call assert_equal([], filter(getmatches(), 'v:val.group ==# "WbxCurrent"'), 'the drawn cue does not leak into ordinary buffers')
  endif

  call s:view('history', ['# Engineering', '', '## Alice · 2026-11-07 10:15',
        \ '**Native Markdown** and `inline code`', '[Loading history…]', '', '# A message heading'])
  call assert_equal('WbxTitle', s:group(1, 'Engineering'))
  call assert_equal('WbxMessageHeader', s:group(3, 'Alice'))
  call assert_equal('WbxMessageTime', s:group(3, '2026-11-07'))
  call assert_match('^markdown', s:group(4, 'Native Markdown'), 'native Markdown emphasis is retained')
  call assert_match('^markdown', s:group(4, 'inline code'), 'native Markdown code is retained')
  call assert_notequal('WbxMuted', s:group(5, 'Loading'), 'message text is never mistaken for UI status')
  call assert_notequal('WbxTitle', s:group(7, 'A message heading'), 'only the conversation title is UI chrome')
  call s:link('WbxMessageHeader', 'Title')
  call s:link('WbxMessageTime', 'Comment')

  " Filetype syntax may load before the first renderer metadata arrives.
  call s:view('history', ['# Bounded', '', 'Alice · 2026-11-07 10:15', '```md', 'unclosed', '',
        \ 'Bob · 2026-11-07 10:16', '**Independent body**', ''])
  let b:wbx_message_blocks = [{'id': 'a', 'start': 3, 'body': 4, 'end': 6}, {'id': 'b', 'start': 7, 'body': 8, 'end': 9}]
  let b:wbx_message_rows = [3, 7]
  let b:wbx_quote_rows = []
  let b:wbx_reply_rows = []
  call wbx#history#syntax()
  call assert_equal('WbxMessageHeader', s:group(7, 'Bob'), 'late metadata removes the whole-buffer Markdown fallback')
  call assert_match('^markdown', s:group(8, 'Independent body'))

  call s:view('compose', ['# Draft heading', '**Native Markdown** and `inline code`', '[Loading history…]'])
  call assert_match('^markdown', s:group(2, 'Native Markdown'))
  call assert_match('^markdown', s:group(2, 'inline code'))
  call assert_notequal('WbxMuted', s:group(3, 'Loading'), 'compose text has no synthetic UI states')

  call s:view('meeting', ['# Webex meeting · STATUS UNKNOWN (backend disconnected)',
        \ 'Presentation: editor', 'Session: synthetic', '',
        \ 'Controls: unavailable / connecting; do not assume the call ended',
        \ 'Closing a view or editor does not imply the meeting ended.',
        \ ':WebexLeave explicitly leaves. Sending starts OFF.', '',
        \ 'Last reported microphone: on', 'Last reported Sources:', '  Synthetic camera',
        \ 'microphone: off', 'Call: connected'])
  call assert_equal('WbxTitle', s:group(1, 'Webex meeting'))
  call assert_equal('WbxWarning', s:group(1, 'STATUS UNKNOWN'))
  call assert_equal('WbxMeetingLabel', s:group(2, 'Presentation:'))
  call assert_equal('WbxMeetingLabel', s:group(5, 'Controls:'))
  call assert_equal('WbxWarning', s:group(5, 'unavailable'))
  call assert_equal('WbxMuted', s:group(6, 'Closing'))
  call assert_equal('WbxMeetingCommand', s:group(7, ':WebexLeave'))
  call assert_equal('WbxWarning', s:group(9, 'Last reported'))
  call assert_equal('WbxMeetingLabel', s:group(9, 'microphone:'))
  call assert_equal('WbxWarning', s:group(9, ' on'))
  call assert_equal('WbxMeetingLabel', s:group(10, 'Sources:'))
  call assert_equal('', s:group(11, 'Synthetic camera'), 'source labels remain ordinary status text')
  call assert_equal('WbxMeetingLabel', s:group(12, 'microphone:'))
  call assert_equal('WbxMeetingLabel', s:group(13, 'Call:'))
  call s:link('WbxMeetingLabel', 'Identifier')
  call s:link('WbxMeetingCommand', 'Special')

  " A colorscheme change keeps standard-group defaults, without custom colors.
  colorscheme default
  call assert_equal('1', synIDattr(hlID('WbxUnread'), 'bold', 'cterm'), 'colorscheme changes retain default unread emphasis')
  call assert_equal(synIDattr(synIDtrans(hlID('Special')), 'fg#', 'gui'), synIDattr(hlID('WbxUnread'), 'fg#', 'gui'), 'colorscheme changes refresh the unread color')
  call s:link('WbxSelected', 'Directory')
  call s:link('WbxTitle', 'Title')
  call s:link('WbxMessageTime', 'Comment')
  call s:link('WbxMeetingLabel', 'Identifier')

  " Native :highlight customizations survive every default link, including reload.
  highlight! link WbxSelected Search
  highlight! link WbxCurrent Search
  highlight! link WbxTitle Statement
  highlight! link WbxMessageHeader Identifier
  highlight! link WbxMeetingLabel Type
  highlight! link WbxUnread Search
  for kind in ['rooms', 'history', 'compose', 'meeting']
    call s:view(kind, ['Synthetic content'])
    call wbx#rooms#highlights()
    call s:link('WbxSelected', 'Search')
    call s:link('WbxCurrent', 'Search')
    call s:link('WbxTitle', 'Statement')
    call s:link('WbxMessageHeader', 'Identifier')
    call s:link('WbxMeetingLabel', 'Type')
    call s:link('WbxUnread', 'Search')
    let b:current_syntax = 'custom-ui-syntax'
    execute 'runtime syntax/wbx-' . kind . '.vim'
    call assert_equal('custom-ui-syntax', b:current_syntax, kind . ' respects an existing syntax hook')
  endfor
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
