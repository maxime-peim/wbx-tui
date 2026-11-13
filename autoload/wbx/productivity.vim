" Explicit LOCAL/LOADED projections. No network, files, receipt or send owner.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:session = ''
let s:bookmarks = []
let s:quote = {}
function! s:warn(text) abort
  echomsg '[wbx-tui] ' . a:text
endfunction
function! s:label(text, max) abort
  let text = substitute(a:text, '[[:cntrl:]\x7f-\x9f]', ' ', 'g')
  let text = substitute(text, "[\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]", '', 'g')
  return strcharpart(text, 0, a:max)
endfunction
function! wbx#productivity#observe(state) abort
  let context = get(a:state, 'localContext', {})
  let session = get(a:state, 'state', '') ==# 'ready' && wbx#protocol#local_context(context) ? context.sessionId : ''
  if session !=# s:session
    let s:session = session
    let s:bookmarks = []
    let s:quote = {}
  endif
endfunction
function! s:context() abort
  let state = wbx#state()
  call wbx#productivity#observe(state)
  if !wbx#supports('local-context-v1') || empty(s:session) || !get(state, 'ready', 0)
        \ || type(get(state, 'room', v:null)) != v:t_dict
    call s:warn('Local actions need a ready selected space and local-context-v1 backend. Nothing was fetched or sent.')
    return {}
  endif
  return {'sessionId': s:session, 'roomId': state.room.id}
endfunction
function! s:message(id) abort
  for message in get(wbx#state(), 'messages', [])
    if message.id ==# a:id | return message | endif
  endfor
  return {}
endfunction
function! s:source() abort
  let context = s:context()
  let id = wbx#view#message_at(bufnr('%'), line('.'))
  if empty(context) | return {} | endif
  if empty(id) || get(b:, 'wbx_history_room', '') !=# context.roomId
    call s:warn('Choose an unchanged selected-history message; list rows/annotations are not source authority.')
    return {}
  endif
  let message = s:message(id)
  return empty(message) ? {} : extend(context, {'message': message})
endfunction
function! wbx#productivity#bookmark_count() abort
  call wbx#productivity#observe(wbx#state())
  return len(s:bookmarks)
endfunction
function! wbx#productivity#bookmark() abort
  let source = s:source()
  if empty(source) | return | endif
  let target = {'roomId': source.roomId, 'messageId': source.message.id}
  let index = index(s:bookmarks, target)
  if index >= 0
    call remove(s:bookmarks, index)
    call s:warn('LOCAL bookmark removed; server Flags unchanged.')
  elseif len(s:bookmarks) >= 128
    call s:warn('LOCAL bookmark limit (128) reached. Remove one explicitly; nothing was evicted.')
  else
    call add(s:bookmarks, target)
    call s:warn('LOCAL session-only bookmark added; not saved to disk or Webex Flags.')
  endif
endfunction
function! s:show(kind, lines, targets, context, query) abort
  let buffer = wbx#lists#show(a:kind, a:lines,map(copy(a:targets),'get(v:val,"messageId","")'))
  if buffer <= 0 || bufnr('%') != buffer || !wbx#lists#clean(buffer, a:kind) || s:context() !=# a:context | return | endif
  let b:wbx_local_context = copy(a:context)
  let b:wbx_local_targets = deepcopy(a:targets)
  let b:wbx_local_query = a:query
endfunction
function! wbx#productivity#bookmarks() abort
  let context = s:context()
  if empty(context) | return | endif
  let lines = ['LOCAL bookmarks · session only · not Webex Flags',
        \ '128 identity pairs max; no saved bodies. Select/load the original space explicitly before jumping.',
        \ 'Enter jumps only to currently loaded unchanged history · r regenerates · q returns · / searches', '']
  let targets = repeat([{}], 4)
  let loaded = {}
  for message in get(wbx#state(), 'messages', []) | let loaded[message.id] = message | endfor
  for target in s:bookmarks
    let message = target.roomId ==# context.roomId ? get(loaded, target.messageId, {}) : {}
    let label = empty(message) ? '[not loaded in selected space]' : s:label(message.author . ' · ' . message.text, 160)
    call add(lines, label . ' [' . target.roomId . ' / ' . target.messageId . ']')
    call add(targets, copy(target))
  endfor
  if empty(s:bookmarks) | call add(lines, '[No local bookmarks in this session]') | call add(targets, {}) | endif
  call s:show('bookmarks', lines, targets, context, '')
endfunction
function! s:thread(context, id) abort
  let thread = wbx#history#thread(get(wbx#state(), 'messages', []), a:id)
  if empty(thread) | call s:warn('Thread source is no longer loaded. Nothing was fetched.') | return | endif
  let lines = ['LOADED thread · PARTIAL · not complete Webex retrieval',
        \ 'No fetching, receipt, separate draft or mutation; Enter jumps to main history before Reply/Quote.',
        \ 'r regenerates loaded members · q returns · / searches · '
        \ . (!empty(thread.error) ? thread.error : thread.missing ? 'root/ancestor not loaded' : 'root loaded; more replies may exist'), '']
  let view = wbx#history#render(thread.messages, 4)
  let targets = repeat([{}], 4)
  for block in view.blocks
    call extend(targets, repeat([{'roomId': a:context.roomId, 'messageId': block.id}], block.end - block.start + 1))
  endfor
  call s:show('thread', lines + view.lines, targets, a:context, a:id)
  if wbx#lists#clean(bufnr('%'),'thread') && get(b:,'wbx_local_context',{}) ==# a:context
    call wbx#history#present(view)
  endif
endfunction
function! wbx#productivity#thread() abort
  let source = s:source()
  if !empty(source) | call s:thread({'sessionId': source.sessionId, 'roomId': source.roomId}, source.message.id) | endif
endfunction
function! wbx#productivity#content(kind) abort
  let kind = empty(a:kind) ? 'files' : a:kind
  if index(['files', 'links', 'media', 'cards'], kind) < 0
    call s:warn('Use :WebexContent files, links, media or cards. No query was run.') | return
  endif
  if kind ==# 'cards' && !wbx#supports('adaptive-card-text-v1')
    call s:warn('Loaded cards need adaptive-card-text-v1; no label-based inference, fetch or reconnect.') | return
  endif
  let context = s:context()
  if empty(context) | return | endif
  let lines = ['LOADED content · ' . kind . ' · PARTIAL · selected space only',
        \ 'One row per loaded message; no fetching, crawling, download, URL execution or receipt.',
        \ 'Enter jumps to the source message · r regenerates · q returns · / searches', '']
  let targets = repeat([{}], 4)
  for message in get(wbx#state(), 'messages', [])
    let found = kind ==# 'files' ? !empty(get(message, 'attachments', []))
          \ : kind ==# 'media' ? !empty(get(message, 'images', []))
          \ : kind ==# 'cards' ? wbx#protocol#cards(get(message, 'cards', {}))
          \ : get(message, 'text', '') =~# '\chttps\?://' || get(message, 'markdown', '') =~# '\chttps\?://'
    if !found | continue | endif
    call add(lines, s:label(message.author . ' · ' . message.created . ' · ' . message.text, 160))
    call add(targets, {'roomId': context.roomId, 'messageId': message.id})
  endfor
  if len(targets) == 4 | call add(lines, '[No matching loaded messages; not evidence of absence in Webex]') | call add(targets, {}) | endif
  call s:show('content', lines, targets, context, kind)
endfunction
function! s:list_context() abort
  if !wbx#lists#clean(bufnr('%'), get(b:, 'wbx_list_kind', '')) | return {} | endif
  let context = s:context()
  if empty(context) || get(b:, 'wbx_local_context', {}) !=# context
    call s:warn('This list belongs to an older session/selection. Regenerate explicitly from the selected space.')
    return {}
  endif
  return context
endfunction
function! wbx#productivity#refresh() abort
  let context = s:list_context()
  if empty(context) | return | endif
  let kind = get(b:, 'wbx_list_kind', '')
  if kind ==# 'bookmarks'
    call wbx#productivity#bookmarks()
  elseif kind ==# 'thread'
    call s:thread(context, b:wbx_local_query)
  elseif kind ==# 'content'
    call wbx#productivity#content(b:wbx_local_query)
  endif
endfunction
function! wbx#productivity#jump() abort
  let context = s:list_context()
  let target = get(get(b:, 'wbx_local_targets', []), line('.') - 1, {})
  if empty(context) || empty(target) | return | endif
  if target.roomId !=# context.roomId || empty(s:message(target.messageId))
    call s:warn('Source is not loaded in the selected space. Select/load it explicitly; no request was made.') | return
  endif
  call wbx#view#jump(target.roomId, target.messageId)
endfunction
function! s:fingerprint(message) abort
  return sha256(json_encode([a:message.id, a:message.author, a:message.created, a:message.text, get(a:message, 'parentId', '')]))
endfunction
function! wbx#productivity#quote() abort
  let source = s:source()
  if empty(source) | return | endif
  if empty(source.message.text) || strlen(source.message.text) > 3000
    call s:warn('Copied quotation requires nonempty text at most 3000 bytes; no clipping/file copy was performed.') | return
  endif
  let body = map(split(source.message.text, "\n", 1), '"> " . s:label(v:val, 3000)')
  " Never create active mention syntax, even if the user later chooses Markdown.
  let body = map(body, 'substitute(v:val, "\\c<\\(@\\|spark-mention\\)", "‹\\1", "g")')
  let s:quote = {'sessionId': source.sessionId, 'roomId': source.roomId, 'messageId': source.message.id,
        \ 'fingerprint': s:fingerprint(source.message),
        \ 'lines': ['Copied text · ' . s:label(source.message.author, 80) . ' · ' . s:label(source.message.created, 24)] + body}
  call s:warn('Copied text captured locally (not a native quote/forward). :WebexQuoteInsert in the SAME space plain draft; Send remains separate.')
endfunction
function! s:fits(lines) abort
  let text = join(a:lines, "\n")
  if strlen(text) > 4000 | return 0 | endif
  let units = 0
  for code in str2list(text)
    let units += code > 65535 ? 2 : 1
    if units > 1000 | return 0 | endif
  endfor
  return 1
endfunction
function! wbx#productivity#insert() abort
  let context = s:context()
  if empty(context) || empty(s:quote) | return | endif
  if !wbx#view#owned(bufnr('%'), 'compose') || get(b:, 'wbx_room', '') !=# context.roomId || !&modifiable
        \ || get(b:, 'wbx_format', 'plain') !=# 'plain'
    call s:warn('Choose a plain destination-bound normal/reply composer; no format or destination was changed.') | return
  endif
  let source = s:message(s:quote.messageId)
  if s:quote.sessionId !=# context.sessionId || s:quote.roomId !=# context.roomId
        \ || empty(source) || s:fingerprint(source) !=# s:quote.fingerprint
    call s:warn('Quotation source changed/is not loaded in this session/space. Recapture explicitly; no text inserted.') | return
  endif
  let guard = filter(copy(s:quote), 'v:key !=# "lines"')
  let guards = deepcopy(get(b:, 'wbx_quote_sources', []))
  if index(guards, guard) < 0
    if len(guards) >= 8 | call s:warn('Eight quotation sources per draft maximum; nothing inserted.') | return | endif
    call add(guards, guard)
  endif
  let old = getline(1, '$')
  let empty_draft = old ==# ['']
  let lines = (empty_draft ? [] : old + ['']) + s:quote.lines
  if !s:fits(lines) | call s:warn('Quotation would exceed 1000 UTF-16 / 4000 bytes. Nothing clipped or inserted.') | return | endif
  " A single native edit, never :undojoin with earlier user typing.
  if empty_draft | call setline(1, lines) | else | call append(line('$'), [''] + s:quote.lines) | endif
  let b:wbx_quote_sources = guards
  call wbx#drafts#observe(bufnr('%'))
  call wbx#redraw_status()
  call s:warn('Copied plaintext inserted; mention delimiters neutralized. Native undo retained; nothing sent.')
endfunction
function! wbx#productivity#draft_valid(buffer, state) abort
  let guards = getbufvar(a:buffer, 'wbx_quote_sources', [])
  if empty(guards) | return 1 | endif
  let context = get(a:state, 'localContext', {})
  let room = get(a:state, 'room', v:null)
  for source in guards
    let message = {}
    for candidate in get(a:state, 'messages', [])
      if candidate.id ==# source.messageId | let message = candidate | break | endif
    endfor
    if !wbx#supports('local-context-v1') || !get(a:state, 'ready', 0) || !wbx#protocol#local_context(context)
          \ || context.sessionId !=# source.sessionId || type(room) != v:t_dict || room.id !=# source.roomId
          \ || getbufvar(a:buffer, 'wbx_room', '') !=# source.roomId
          \ || empty(message) || s:fingerprint(message) !=# source.fingerprint
      call s:warn('Copied quotation source/session changed or is no longer loaded. Recapture, or :WebexQuoteDetach explicitly to retain ordinary copied text. Nothing sent.')
      return 0
    endif
  endfor
  return 1
endfunction
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Detach", 1) == 2
endfunction
function! wbx#productivity#detach() abort
  if !wbx#view#owned(bufnr('%'), 'compose') || empty(get(b:, 'wbx_quote_sources', [])) | return | endif
  let origin = wbx#view#intent()
  if !s:confirm('Detach ALL copied-text source guards from THIS draft? Text/undo stay unchanged; it becomes ordinary manually copied text, NOT a native quote. Sending is separate.')
        \ || !wbx#view#intent_valid(origin) | return | endif
  let b:wbx_quote_sources = []
  call s:warn('Source guards explicitly detached. Native text/undo unchanged; nothing sent.')
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
