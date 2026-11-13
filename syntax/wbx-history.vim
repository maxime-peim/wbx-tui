if exists('b:current_syntax')
  finish
endif
syntax include @WbxMessageMarkdown syntax/markdown.vim
" Published mentions are projected to ordinary @Name text before rendering, so
" long concealed IDs cannot consume native wrapping width. Draft tags stay raw.
" Only the first heading is UI chrome; message bodies retain native Markdown.
syntax match WbxTitle /\%1l^# .*/ containedin=ALL
" Legacy syntax-only headers omit the zone; renderer metadata keeps UTC/offsets.
" Both forms remain contained in a real header, never ambient Markdown text.
syntax match WbxMessageTime / · \d\{4}-\d\d-\d\d \d\d:\d\d\%( \%(UTC\|[+-]\d\d:\d\d\)\)\?\%( · edited\)\?$/ contained
highlight default link WbxTitle Title
highlight default link WbxMessageHeader Title
highlight default link WbxMessageTime Comment
highlight default link WbxQuoteLabel Special
highlight default link WbxReplyContext Comment
highlight default link WbxMention Identifier
highlight default link WbxMessageBorder Comment
let b:current_syntax = 'wbx-history'
unlet! b:wbx_history_syntax_rows b:wbx_syntax_geometry b:wbx_message_syntax b:wbx_syntax_fallback b:wbx_syntax_free b:wbx_syntax_buckets
call wbx#history#syntax()
