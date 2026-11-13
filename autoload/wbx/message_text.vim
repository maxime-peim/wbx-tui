" Readable published text only. Never changes message state, drafts or send/edit identity.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:mention = '\c<@personId:[A-Za-z0-9_+\/=-]\+|[^<>|\r\n]\+>\|<@all>\|<spark-mention\%(\s[^<>]\{0,2048}\)\?>[^<>\r\n]\{1,480}<\/spark-mention\s*>'
function! s:escaped(text, at) abort
  let at = a:at - 1 | let slashes = 0
  while at >= 0 && strpart(a:text, at, 1) ==# '\'
    let slashes += 1 | let at -= 1
  endwhile
  return slashes % 2
endfunction
function! s:label(token) abort
  if a:token ==? '<@all>' | return '@all' | endif
  let label = a:token =~? '^<@personId:' ? matchstr(a:token, '|\zs[^<>|]\+\ze>$')
        \ : matchstr(a:token, '>\zs[^<>]\+\ze</')
  let entities = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"}
  let label = substitute(label, '&\%(amp\|lt\|gt\|quot\|apos\);', '\=entities[submatch(0)]', 'g')
  return strpart(label, 0, 1) ==# '@' ? label : '@' . label
endfunction
function! s:mentions(text, ranges, base) abort
  let at = 0 | let out = ''
  while at < strlen(a:text)
    let found = matchstrpos(a:text, s:mention, at)
    if found[1] < 0 | return out . strpart(a:text, at) | endif
    let out .= strpart(a:text, at, found[1] - at)
    if s:escaped(a:text, found[1])
      let out .= found[0]
    else
      let label = s:label(found[0])
      if len(a:ranges) < 32 | call add(a:ranges, [a:base + strlen(out), strlen(label)]) | endif
      let out .= label
    endif
    let at = found[2]
  endwhile
  return out
endfunction
function! s:inline(text, ranges) abort
  let at = 0 | let out = ''
  while at < strlen(a:text)
    let opening = matchstrpos(a:text, '`\+', at)
    if opening[1] < 0 | return out . s:mentions(strpart(a:text, at), a:ranges, strlen(out)) | endif
    if s:escaped(a:text, opening[1])
      let out .= s:mentions(strpart(a:text, at, opening[2] - at), a:ranges, strlen(out))
      let at = opening[2] | continue
    endif
    let scan = opening[2] | let closing = ['', -1, -1]
    while scan < strlen(a:text)
      let candidate = matchstrpos(a:text, '`\+', scan)
      if candidate[1] < 0 | break | endif
      if candidate[0] ==# opening[0]
        let closing = candidate | break
      endif
      let scan = candidate[2]
    endwhile
    if closing[1] < 0 | return out . s:mentions(strpart(a:text, at), a:ranges, strlen(out)) | endif
    let out .= s:mentions(strpart(a:text, at, opening[1] - at), a:ranges, strlen(out))
          \ . strpart(a:text, opening[1], closing[2] - opening[1])
    let at = closing[2]
  endwhile
  return out
endfunction
function! s:paragraph(out, pending, mentions) abort
  if empty(a:pending) | return | endif
  let ranges = [] | let base = len(a:out)
  let text = s:inline(join(a:pending, "\n"), ranges)
  call extend(a:out, split(text, "\n", 1))
  for range in ranges
    if len(a:mentions) >= 32 | break | endif
    let prefix = strpart(text, 0, range[0])
    call add(a:mentions, [base + count(prefix, "\n") + 1, strlen(prefix) - strridx(prefix, "\n"), range[1]])
  endfor
  call filter(a:pending, '0')
endfunction
function! s:container(text) abort
  let text = a:text
  " Strip only structural prefixes for fence recognition, never from output.
  while text =~# '^ \{0,3}>'
    let text = substitute(text, '^ \{0,3}> \?', '', '')
  endwhile
  return substitute(text, '^ \{0,3}\%([-+*]\|\d\+[.)]\)\s\+', '', '')
endfunction
function! wbx#message_text#project(markdown) abort
  if a:markdown !~? '<@\|<spark-mention' | return {'text': a:markdown, 'mentions': []} | endif
  let out = [] | let fence = '' | let mentions = [] | let pending = []
  for text in split(a:markdown, "\n", 1)
    let context = s:container(text)
    let marker = matchstr(context, '^ \{0,3}\zs\%(`\{3,}\|\~\{3,}\)')
    if !empty(fence)
      call s:paragraph(out, pending, mentions)
      call add(out, text)
      if strpart(marker, 0, 1) ==# strpart(fence, 0, 1) && strlen(marker) >= strlen(fence)
            \ && context =~# '^ \{0,3}' . escape(marker, '~') . '\s*$' | let fence = '' | endif
    elseif !empty(marker)
      call s:paragraph(out, pending, mentions)
      let fence = marker | call add(out, text)
    elseif context =~# '^\%(\t\| \{4}\)' || context =~# '^\s*$'
      call s:paragraph(out, pending, mentions)
      call add(out, text)
    else
      call add(pending, text)
    endif
  endfor
  call s:paragraph(out, pending, mentions)
  return {'text': join(out, "\n"), 'mentions': mentions}
endfunction
function! wbx#message_text#published(markdown) abort
  return wbx#message_text#project(a:markdown).text
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
