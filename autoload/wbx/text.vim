" Pure bounded display labels. Never truncates original editable/send identity.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#text#truncate(text, max) abort
  if a:max <= 0 | return '' | endif
  " Vim regex atoms may absorb combining marks after an ASCII base; compare
  " byte/codepoint counts instead of using an ASCII character-class shortcut.
  if strlen(a:text) == strchars(a:text)
    return strlen(a:text) <= a:max ? a:text : strpart(a:text, 0, a:max - 1) . '…'
  endif
  let groups = [] | let at = 0 | let regional = 0
  while at < strlen(a:text)
    " Native . keeps base/composing marks together; extend common emoji clusters.
    let part = matchstr(a:text, '.', at)
    if empty(part) | break | endif
    let code = char2nr(part)
    let is_regional = code >= 0x1f1e6 && code <= 0x1f1ff
    let extend = code == 0x200d || code >= 0x1f3fb && code <= 0x1f3ff
          \ || code >= 0xe0020 && code <= 0xe007f || strdisplaywidth('x' . part) == 1
          \ || is_regional && regional % 2
          \ || !empty(groups) && char2nr(strcharpart(groups[-1], strchars(groups[-1]) - 1)) == 0x200d
    if !empty(groups) && extend
      let groups[-1] .= part
    else
      call add(groups, part)
      if len(groups) > a:max | break | endif
    endif
    let regional = is_regional ? regional + 1 : 0
    let at += strlen(part)
  endwhile
  return len(groups) <= a:max ? join(groups, '') : (a:max == 1 ? '' : join(groups[:a:max - 2], '')) . '…'
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
