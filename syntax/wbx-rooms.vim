if exists('b:current_syntax')
  finish
endif

" Indentation belongs to real spaces; bracketed rows are guidance, not entries.
" Only the open marker is accented. A read title must return to normal text,
" not keep a second, unread-looking whole-row color after server confirmation.
" WbxCurrent adds an independent background through a native window match.
syntax match WbxRoom /^\%(  \|● \).\+/ contains=WbxSelected
syntax match WbxSelected /^●/ contained
syntax match WbxMuted /^\[.*\]$/ contains=WbxKey
syntax match WbxWarning /^\[\%(Messaging disconnected\|Connection failed\|Delivery uncertain\|History not ready\|Display transport limit\)\>.*\]$/ contains=WbxKey
syntax match WbxKey /\%(\[\| · \)\zs\%(j\/k\|Enter\|Backspace\|i\|r\)\ze / contained

syntax match WbxTitle /^Webex spaces\>.*/ contains=WbxMode,WbxStatus,WbxWarning
syntax match WbxMode /\<\%(DEMO\|LIVE\)\>/ contained
syntax match WbxStatus / · \zs\%(idle\|connecting\|ready\)$/ contained
syntax match WbxWarning / · \zs\%(disconnected\|failed\)$/ contained

highlight default link WbxRoom Normal
highlight default link WbxSelected Directory
highlight default link WbxTitle Title
highlight default link WbxMuted Comment
highlight default link WbxWarning WarningMsg
highlight default link WbxKey Special
highlight default link WbxMode Type
highlight default link WbxStatus Comment

let b:current_syntax = 'wbx-rooms'
unlet! b:wbx_unread_syntax_rows b:wbx_cached_syntax_rows b:wbx_presence_syntax
call wbx#rooms#syntax()
