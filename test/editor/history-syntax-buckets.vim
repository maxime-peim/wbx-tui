" Exact metadata-bounded Markdown and incremental shared rules. Offline only.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
syntax enable
let g:wbx_tui = {'threaded_history': 0, 'images': 0}
augroup wbx_test_syntax_buckets
  autocmd!
  autocmd Syntax wbx-history let b:wbx_test_syntax_hooks = get(b:, 'wbx_test_syntax_hooks', 0) + 1
augroup END
function! s:install(messages) abort
  let view = wbx#history#render(a:messages, 2)
  let lines = ['# Syntax boundaries', ''] + view.lines
  setlocal modifiable
  call wbx#view#replace(bufnr('%'), lines, view.blocks)
  setlocal nomodifiable nomodified
  let b:wbx_render_tick = b:changedtick
  let b:wbx_message_blocks = view.blocks
  let b:wbx_message_rows = view.headers
  let b:wbx_quote_rows = view.quotes
  let b:wbx_reply_rows = view.replies
  call wbx#history#syntax()
  return view
endfunction
function! s:group(row, column) abort
  return synIDattr(synID(a:row, a:column, 1), 'name')
endfunction
function! s:boundaries() abort
  for block in b:wbx_message_blocks
    call assert_equal('WbxMessageHeader', s:group(block.start, 1), 'fences stop before each metadata header: ' . block.id)
    call assert_match('^markdown', s:group(block.body, 3), 'each body independently starts native Markdown: ' . block.id)
    if block.end - block.body > 3
      call assert_notequal('WbxMessageHeader', s:group(block.body + 2, 4), 'body text cannot invent a UI header')
      call assert_notequal('WbxQuoteLabel', s:group(block.body + 3, 1), 'body text cannot invent a quote label')
    endif
  endfor
endfunction
try
  file wbx://history
  setlocal buftype=nofile
  let b:wbx_kind = 'history'
  let messages = []
  for index in range(1, 40)
    call add(messages, {'id': 'm' . index, 'author': 'Author ' . index, 'created': '',
          \ 'text': index % 7 == 0 ? '**Single-line body**' : "**Bold body**\n# Body heading\n## Pretend UI · 2026-11-07 10:15\n↪ Quoted / forwarded content\n```md\nunclosed fence"})
  endfor
  let messages[1].parentId = 'm1'
  let messages[2].quoted = v:true
  call s:install(messages)
  setlocal syntax=wbx-history
  call assert_equal(1, b:wbx_test_syntax_hooks, 'native Syntax hooks still run')
  call s:boundaries()
  call assert_equal(3, len(b:wbx_syntax_buckets), '40 messages share three small rule buckets')
  let rules = execute('syntax list')
  call assert_equal(3, len(filter(split(rules, "\n"), 'v:val =~# "^WbxBodyBucket"')), 'not one competing body rule per message')
  let tick = b:changedtick
  call wbx#history#syntax()
  call assert_equal([0, 0], [b:wbx_syntax_work, b:wbx_syntax_bucket_work], 'unchanged metadata does not redefine shared rules')
  call assert_equal(rules, execute('syntax list'))
  call assert_equal(tick, b:changedtick, 'syntax never edits body text')
  call assert_equal(1, b:wbx_test_syntax_hooks, 'metadata refresh does not reload native syntax/hooks')

  let quote = b:wbx_quote_rows[0]
  let b:wbx_quote_rows = []
  call add(b:wbx_reply_rows, quote)
  call wbx#history#syntax()
  call assert_equal('WbxReplyContext', s:group(quote, 1), 'metadata-only chrome changes replace the old label')
  call assert_equal([1, 1], [b:wbx_syntax_work, b:wbx_syntax_bucket_work])
  call assert_equal(tick, b:changedtick)

  " Restore the renderer metadata, then a body-only edit must touch no rules.
  call s:install(messages)
  let messages[6].text = '**Edited single-line body**'
  call s:install(messages)
  call assert_equal([0, 0], [b:wbx_syntax_work, b:wbx_syntax_bucket_work])
  let first = execute('syntax list WbxBodyBucket0')
  call add(messages, {'id': 'appended', 'author': 'Append', 'created': '', 'text': '**Appended body**'})
  call s:install(messages)
  call assert_equal([1, 1], [b:wbx_syntax_work, b:wbx_syntax_bucket_work], 'append updates just its bucket')
  call assert_equal(first, execute('syntax list WbxBodyBucket0'), 'unrelated bucket definitions survive append')

  " A new UID's bucket now spans non-contiguous early/late messages. Its end
  " alternatives must still stop every body at that body's own exact boundary.
  call insert(messages, {'id': 'prepended', 'author': 'Prepend', 'created': '', 'text': "**Prepended**\n```md\nunclosed"})
  call s:install(messages)
  call s:boundaries()
  let messages = filter(messages, 'v:val.id !~# "^m\\%(1[7-9]\\|2[0-9]\\|3[0-2]\\)$"')
  call s:install(messages)
  call assert_false(has_key(b:wbx_syntax_buckets, '1'), 'deleting a whole bucket releases its native rules')
  call assert_notmatch('start=', execute('syntax list WbxBodyBucket1'))
  call s:boundaries()
  for index in range(1, 16)
    call add(messages, {'id': 'reused-' . index, 'author': 'Reused', 'created': '', 'text': '**Reused IDs**'})
  endfor
  call s:install(messages)
  call assert_equal(3, len(b:wbx_syntax_buckets), 'freed IDs do not grow the number of competing buckets')
  call s:boundaries()

  highlight WbxMessageHeader ctermfg=123 guifg=#123456
  let color = synIDattr(hlID('WbxMessageHeader'), 'fg', 'cterm')
  call wbx#history#clear()
  call assert_false(exists('b:wbx_syntax_buckets'), 'ownership cleanup releases the syntax cache')
  call wbx#history#syntax()
  call assert_equal(color, synIDattr(hlID('WbxMessageHeader'), 'fg', 'cterm'), 'syntax updates retain user/colorscheme highlights')
  call s:boundaries()
  setlocal syntax=conf
  syntax match WbxTestOverride /Bold/
  let syntax_name = b:current_syntax
  call wbx#history#syntax()
  call assert_equal(syntax_name, b:current_syntax, 'explicit native syntax overrides remain authoritative')
  call assert_match('WbxTestOverride', execute('syntax list WbxTestOverride'))
  setlocal syntax=wbx-history
  call s:boundaries()
  setlocal modifiable
  call append(0, 'Retained local annotation')
  let annotated = getline(1, '$')
  let tick = b:changedtick
  call wbx#history#syntax()
  call assert_equal(annotated, getline(1, '$'), 'syntax never replaces annotated projections')
  call assert_equal(tick, b:changedtick)

  enew
  call setline(1, ['# Ordinary history', '', '## Person · 2026-11-07 10:15', '**Ordinary Markdown**'])
  setlocal syntax=wbx-history
  call assert_equal('WbxMessageHeader', s:group(3, 4), 'ordinary syntax-only fallback remains available')
  call assert_match('^markdown', s:group(4, 3))
  let messages = [{'id': 'late-a', 'author': 'A', 'created': '', 'text': "**First**\n```md\nunclosed"},
        \ {'id': 'late-b', 'author': 'B', 'created': '', 'text': '**Independent**'}]
  call s:install(messages)
  call assert_equal(0, b:wbx_syntax_fallback, 'late metadata removes whole-buffer Markdown fallback')
  call s:boundaries()
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
