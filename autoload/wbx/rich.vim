" Explicit per-draft formatting and mention insertion. Syntax is not send consent.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! s:confirm(text) abort
  return confirm(a:text, "&Cancel\n&Yes, continue", 1) == 2
endfunction
function! s:editable() abort
  return wbx#view#owned(bufnr('%'), 'compose') || wbx#conversations#is_direct(bufnr('%')) || &buftype ==# 'nofile'
        \ && !empty(get(b:, 'wbx_message_context', {})) && bufname('%') ==# 'wbx://edit/' . b:wbx_message_context.contextId
endfunction
function! wbx#rich#format(value) abort
  if !s:editable() | echoerr 'Choose a Webex composer or explicit edit buffer.' | return | endif
  let value = a:value
  if empty(value)
    let origin = wbx#view#intent()
    call s:select(['Draft format', '1. Plain', '2. Markdown'], function('s:format_selected', [origin]))
    return
  endif
  if index(['plain', 'markdown'], value) < 0 | echoerr 'Use :WebexFormat plain or markdown.' | return | endif
  if value ==# 'markdown' && !wbx#supports('markdown-send-v1') | echoerr 'Markdown needs an updated connected backend.' | return | endif
  if value ==# 'markdown' && wbx#conversations#is_direct(bufnr('%'))
        \ && !wbx#supports_direct('markdown-v1') && !wbx#supports_direct('markdown-single-file-v1')
    echoerr 'Recipient Markdown needs explicit direct-format support; nothing was downgraded.' | return
  endif
  if !s:format(value) | return | endif
  call wbx#redraw_status()
  echomsg '[wbx-tui] Draft format: ' . value . '. No message was sent.'
endfunction
function! s:format_selected(origin, choice) abort
  if a:choice < 1 || a:choice > 2 || !wbx#view#picker_valid(a:origin) | return | endif
  call wbx#rich#format(['plain', 'markdown'][a:choice - 1])
endfunction
function! s:format(value) abort
  call wbx#completion#sync()
  let b:wbx_format = a:value
  let origin = wbx#view#intent()
  if a:value ==# 'markdown'
    if &l:filetype !=# 'markdown'
      let b:wbx_rich_filetype = &l:filetype
      setlocal filetype=markdown
    endif
  elseif exists('b:wbx_rich_filetype') && &l:filetype ==# 'markdown'
    let previous = b:wbx_rich_filetype
    unlet b:wbx_rich_filetype
    let &l:filetype = previous
  endif
  " User FileType hooks may edit, rename or redirect a draft. Never insert into
  " that changed intent or silently replace any work made by those hooks.
  if !wbx#view#intent_valid(origin) || !s:editable() | return 0 | endif
  call wbx#completion#sync()
  call wbx#rich#syntax()
  if has('conceal')
    if a:value ==# 'markdown'
      if !exists('b:wbx_rich_conceal') | let b:wbx_rich_conceal = [&l:conceallevel, &l:concealcursor] | endif
      setlocal conceallevel=2 concealcursor=nvic
    elseif exists('b:wbx_rich_conceal')
      let [&l:conceallevel, &l:concealcursor] = b:wbx_rich_conceal
      unlet b:wbx_rich_conceal
    endif
  endif
  return 1
endfunction
function! wbx#rich#syntax() abort
  if !s:editable() | return | endif
  silent! syntax clear WbxDraftMention WbxDraftMentionTarget WbxDraftMentionEnd
  if get(b:, 'wbx_format', 'plain') !=# 'markdown' | return | endif
  " Presentation only: exact native text, undo and on-wire identity stay intact.
  syntax match WbxDraftMention /<@personId:[A-Za-z0-9_+\/=-]\+|[^<>|\r\n]\+>/ contains=WbxDraftMentionTarget,WbxDraftMentionEnd
  " Place @ next to the label, not before the hidden ID's native wrap positions.
  " shortcut: legacy conceal still reserves hidden-ID wrap rows; remove this limit when conceal-aware wrapping is supported.
  syntax match WbxDraftMentionTarget /<@personId:[A-Za-z0-9_+\/=-]\+/ contained conceal
  syntax match WbxDraftMentionTarget /|/ contained conceal cchar=@
  syntax match WbxDraftMentionEnd />/ contained conceal
  highlight default link WbxDraftMention Identifier
endfunction
function! wbx#rich#consent(content) abort
  if a:content !~# '<@\|<spark-mention' | return {} | endif
  " Explicit Send/Submit includes individual tags; backend membership checks remain.
  let out = {'mentionsAccepted': v:true}
  if a:content =~# '<@all>'
    if !s:confirm('ATTENTION: @all notifies the entire space. Explicitly authorize @all for THIS submission?') | return {'cancelled': 1} | endif
    let out.allAccepted = v:true
  endif
  return out
endfunction
function! s:insert(token) abort
  let before = getline('.')
  let at = col('.') - 1
  " Normal-mode cursor() cannot stay one byte past EOL. Keep an actual blank
  " after the token so a subsequent insertion cannot split its closing '>'.
  call setline('.', strpart(before, 0, at) . a:token . '  ' . strpart(before, at))
  call cursor(line('.'), at + strlen(a:token) + 2)
endfunction
function! s:select(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! s:choose(origin, response) abort
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#members(value) | call wbx#_protocol_error() | return | endif
  if !wbx#view#intent_valid(a:origin) || !s:editable() || !get(wbx#state(), 'ready', 0)
        \ || value.roomId !=# a:origin.room | return | endif
  if value.state !=# 'ready' | echomsg '[wbx-tui] Participant list unavailable; refresh explicitly. No mention inserted.' | return | endif
  let lines = ['Choose exact participant (' . len(value.items) . ' loaded; '
         \ . (value.partial ? 'PARTIAL' : 'complete API response at observation') . '):']
  let labels = {}
  for item in value.items | let labels[item.label] = get(labels, item.label, 0) + 1 | endfor
  for index in range(len(value.items))
    let item = value.items[index]
    let suffix = labels[item.label] > 1 ? ' […' . strpart(item.personId, max([0, strlen(item.personId) - 8])) . ']' : ''
    call add(lines, printf('%d. %s%s', index + 1, item.label, suffix))
  endfor
  if value.more | call add(lines, (len(value.items) + 1) . '. Load more participants (explicit bounded next page)') | endif
  call s:select(lines, function('s:chosen', [a:origin, value, [line('.'), col('.')]]))
endfunction
function! s:chosen(origin, value, position, choice) abort
  if !wbx#view#picker_valid(a:origin) | return | endif
  if a:value.more && a:choice == len(a:value.items) + 1
    call wbx#rpc('members.list', {'more': v:true}, function('s:choose', [wbx#view#intent()]))
    return
  endif
  if a:choice < 1 || a:choice > len(a:value.items) | return | endif
  let target = a:value.items[a:choice - 1]
  if target.label =~# '[<>|]' | echoerr 'Display name cannot be represented safely in mention markup.' | return | endif
  if !s:format('markdown') | return | endif
  call cursor(a:position[0], a:position[1])
  call s:insert('<@personId:' . target.personId . '|' . target.label . '>')
  call wbx#redraw_status()
endfunction
function! wbx#rich#mention(all) abort
  if !s:editable() || !wbx#supports('markdown-send-v1') || !wbx#supports('room-members-v1') | return | endif
  let state = wbx#state()
  let room = get(state, 'room', v:null)
  let target = get(b:, 'wbx_room', get(get(b:, 'wbx_message_context', {}), 'roomId', ''))
  if !get(state, 'ready', 0) || type(room) != v:t_dict || room.id !=# target || get(room, 'type', '') !=# 'group' | echoerr 'Mentions require the selected ready group-space draft.' | return | endif
  if a:all
    let origin = wbx#view#intent()
    if !s:confirm('Insert real @all markup for the entire space and enable Markdown in THIS draft? Sending remains separate.') | return | endif
    if !wbx#view#intent_valid(origin) | return | endif
    if !s:format('markdown') | return | endif
    call s:insert('<@all>') | call wbx#redraw_status() | return
  endif
  let origin = wbx#view#intent()
  call wbx#rpc('members.list', {'more': v:false}, function('s:choose', [origin]))
endfunction
augroup wbx_native_rich
  autocmd!
  autocmd Syntax * if get(b:, 'wbx_format', 'plain') ==# 'markdown' | call wbx#rich#syntax() | endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
