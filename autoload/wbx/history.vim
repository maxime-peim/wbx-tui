" UI headings/quote labels follow message metadata, never Markdown in the body.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:projection = {}
function! wbx#history#projection(messages, context) abort
  if get(s:projection, 'key', []) ==# a:context && s:projection.messages ==# a:messages
    return [deepcopy(s:projection.view), 0]
  endif
  let view = wbx#history#render(a:messages, a:context[1])
  let s:projection = {'key': deepcopy(a:context), 'messages': deepcopy(a:messages), 'view': deepcopy(view)}
  return [view, 1]
endfunction
highlight default link WbxMessageHeader Title
highlight default link WbxMessageBorder Comment
highlight default link WbxReplyContext Comment
highlight default link WbxMention Identifier

function! s:line(text, max) abort
  let text = substitute(a:text, '[\x00-\x1f\x7f-\x9f]', ' ', 'g')
  let text = substitute(text, "[\u202a-\u202e\u2066-\u2069]", '', 'g')
  return wbx#text#truncate(text, a:max)
endfunction
function! wbx#history#time(value) abort
  if empty(a:value) | return 'time unavailable' | endif
  let zone = matchstr(a:value,'\%(Z\|[+-]\d\d:\d\d\)$')
  let stamp = substitute(strpart(a:value,0,16),'T',' ','')
  return s:line(empty(zone) ? a:value . ' (zone unknown)' : stamp . ' ' . (zone ==# 'Z' ? 'UTC' : zone),80)
endfunction
function! wbx#history#excerpt(message, width) abort
  let raw = empty(get(a:message,'markdown','')) ? get(a:message,'text','') : wbx#message_text#project(a:message.markdown).text
  for line in split(raw,"\n",1)[:31]
    let text = trim(substitute(s:line(line,400),'\s\+',' ','g'))
    if !empty(text) && stridx(text,'```') != 0 && stridx(text,'~~~') != 0 | return wbx#text#truncate(text,a:width) | endif
  endfor
  return ''
endfunction
function! wbx#history#reply_label(messages, parent) abort
  let parents = filter(copy(a:messages), 'v:val.id ==# a:parent')
  if empty(parents) | return 'parent not loaded' | endif
  let excerpt = wbx#history#excerpt(parents[0],72)
  return s:line(parents[0].author,80) . ' · ' . wbx#history#time(parents[0].created) . (empty(excerpt) ? '' : ' · ' . excerpt)
endfunction

" Published mention labels are readable native text; original message state is
" separate. Rails and reply indentation remain native virtual text.
function! s:chronological(left, right) abort
  let left = get(a:left.message, 'created', '')
  let right = get(a:right.message, 'created', '')
  return left ==# right ? a:left.index - a:right.index : left <# right ? -1 : 1
endfunction
function! s:group_order(left, right) abort
  return s:chronological(a:left.members[0], a:right.members[0])
endfunction
function! s:arrange(messages, threaded) abort
  let parents = {}
  for message in a:messages | let parents[message.id] = message | endfor
  " Iterative, memoized ancestry resolution: each loaded edge is visited at
  " most once. Invalid/cyclic components become honestly labelled singletons,
  " never a recursive walk or an invented root that swallows another thread.
  let resolved = {}
  for message in a:messages
    let current = message.id
    let path = []
    let visiting = {}
    while 1
      if has_key(resolved, current)
        let result = resolved[current]
        break
      elseif !has_key(parents, current)
        let result = {'root': current, 'missing': 1, 'error': ''}
        break
      elseif has_key(visiting, current)
        let result = {'root': '', 'missing': 0, 'error': 'invalid parent chain (cycle)'}
        break
      endif
      let visiting[current] = 1
      call add(path, current)
      let parent = get(parents[current], 'parentId', '')
      if type(parent) != v:t_string
        let result = {'root': '', 'missing': 0, 'error': 'invalid parent reference'}
        break
      elseif empty(parent)
        let result = {'root': current, 'missing': 0, 'error': ''}
        break
      endif
      let current = parent
    endwhile
    for id in path
      let resolved[id] = empty(result.error) ? result : extend(copy(result), {'root': id})
    endfor
  endfor
  let nodes = []
  let groups = {}
  for index in range(0, len(a:messages) - 1)
    let message = a:messages[index]
    let ancestry = resolved[message.id]
    let node = {'message': message, 'index': index}
    call add(nodes, node)
    if !has_key(groups, ancestry.root)
      let groups[ancestry.root] = extend({'members': []}, copy(ancestry))
    endif
    call add(groups[ancestry.root].members, node)
  endfor
  for group in values(groups)
    let group.size = len(group.members)
    let group.loaded_replies = empty(group.error) ? group.size - (group.missing ? 0 : 1) : 0
    call sort(group.members, function('s:chronological'))
    if !group.missing && empty(group.error)
      let index = 0
      while group.members[index].message.id !=# group.root | let index += 1 | endwhile
      call insert(group.members, remove(group.members, index))
    endif
  endfor
  if a:threaded
    let ordered = sort(values(groups), function('s:group_order'))
  else
    let ordered = []
    let direct_counts = {}
    for node in nodes
      let parent = get(node.message, 'parentId', '')
      if type(parent) == v:t_string && !empty(parent)
        let direct_counts[parent] = get(direct_counts, parent, 0) + 1
      endif
    endfor
    for node in nodes
      " Compatibility mode retains direct-parent body-group semantics as well
      " as canonical order; ultimate ancestry is only used for error labels.
      let parent = get(node.message, 'parentId', '')
      let parent = type(parent) == v:t_string ? parent : ''
      let root = empty(parent) ? node.message.id : parent
      let error = resolved[node.message.id].error
      call add(ordered, {'members': [node], 'root': root, 'missing': !has_key(parents, root), 'error': error,
            \ 'size': 1, 'loaded_replies': empty(error) ? get(direct_counts, root, 0) : 0})
    endfor
  endif
  return {'groups': ordered, 'parents': parents}
endfunction
function! wbx#history#thread(messages, id) abort
  " Reuse exact ancestry/missing/cycle rules even with ungrouped main history.
  for group in s:arrange(a:messages, 1).groups
    if !empty(filter(copy(group.members), 'v:val.message.id ==# a:id'))
      return {'messages': map(copy(group.members), 'v:val.message'), 'root': group.root,
            \ 'missing': group.missing, 'error': group.error}
    endif
  endfor
  return {}
endfunction
function! wbx#history#render(messages, offset) abort
  let threaded = !!get(get(g:, 'wbx_tui', {}), 'threaded_history', 1)
  let view = {'lines': [], 'blocks': [], 'headers': [], 'quotes': [], 'replies': [], 'images': [], 'pending_images': [], 'pending_attachments': [], 'complete': 1, 'threaded': threaded, 'paging_edge': 0}
  let arranged = s:arrange(a:messages, threaded)
  let remaining = 20000
  for group in arranged.groups
    let first = len(view.blocks)
    for node in group.members
      let message = node.message
      let raw_parent = get(message, 'parentId', '')
      let parent = type(raw_parent) == v:t_string ? raw_parent : ''
      let start = a:offset + len(view.lines) + 1
      " Canonical oldest need not be first in grouped display. Index its row
      " while projecting, rather than searching all blocks on each keypress.
      if node.index == 0 | let view.paging_edge = start | endif
      call add(view.headers, start)
      call add(view.lines, s:line(message.author, 80) . ' · ' . wbx#history#time(message.created) . (get(message, 'edited', 0) ? ' · edited' : ''))
      if !empty(parent) || !empty(group.error)
        call add(view.replies, a:offset + len(view.lines) + 1)
        let original = get(arranged.parents, parent, {})
        let label = empty(original) ? 'parent not loaded' : s:line(original.author, 80)
        call add(view.lines, empty(group.error) ? '↪ Reply to ' . label : '↪ Reply context unavailable: ' . group.error)
      endif
      if get(message, 'quoted', 0)
        call add(view.quotes, a:offset + len(view.lines) + 1)
        call add(view.lines, '↪ Quoted / forwarded content')
      endif
      let body_start = a:offset + len(view.lines) + 1
      let display = empty(get(message, 'markdown', '')) ? {'text': message.text, 'mentions': []} : wbx#message_text#project(message.markdown)
      let body = split(display.text, "\n", 1)
      if empty(body)
        let body = ['']
      endif
      let available = min([remaining, 1000])
      let clipped = len(body) > available
      let body = available > 0 ? body[:available - 1] : []
      let mentions = filter(copy(display.mentions), 'v:val[0] <= len(body)')
      let remaining -= len(body)
      call extend(view.lines, body)
      let attachment_rows = {}
      for file in get(message, 'attachments', [])
        let row = a:offset + len(view.lines) + 1
        let attachment_rows[file.id] = row
        if !has_key(file, 'name') | call add(view.pending_attachments, {'messageId': message.id, 'row': row}) | endif
        call add(view.lines, '[Attachment: ' . wbx#attachments#label(file) . ']')
      endfor
      if get(get(g:, 'wbx_tui', {}), 'images', 'auto') isnot v:false && get(get(g:, 'wbx_tui', {}), 'images', 'auto') isnot 0
        for image in get(message, 'images', [])
          let files = filter(copy(get(message, 'attachments', [])), 'v:val.id ==# image.id')
          if !empty(files) && has_key(files[0], 'mime') && files[0].mime !~# '^\%(image/\|application/octet-stream$\)'
            continue
          endif
          if image.state ==# 'ready'
            if remaining < 12
              call add(view.lines, '[Image preview clipped at history display limit]')
              let view.complete = 0
            else
              call add(view.images, {'id': image.id, 'row': a:offset + len(view.lines) + 1, 'png': image.png})
              call extend(view.lines, image.lines)
              let remaining -= 12
            endif
          elseif image.state ==# 'pending'
            let view.complete = 0
            call add(view.pending_images, {'messageId': message.id, 'row': get(attachment_rows, image.id, a:offset + len(view.lines) + 1)})
            if !has_key(attachment_rows, image.id) | call add(view.lines, '[Image / attachment preview pending]') | endif
          else
            if image.state !=# 'unsupported' || !has_key(attachment_rows, image.id)
              call add(view.lines, image.state ==# 'unsupported' ? '[Attachment: no supported image preview]' : '[Image preview unavailable]')
            endif
          endif
        endfor
      endif
      if clipped
        call add(view.lines, '[Message display clipped; view the complete message in Webex.]')
        let view.complete = 0
      endif
      call add(view.lines, '')
      " A content key lets decorations compare one block, not all of its rows.
      let key = sha256(join(view.lines[start - a:offset - 1 :], "\n"))
      if !empty(mentions) | let key = sha256(key . string(mentions)) | endif
      " Reaction reuse follows source content, not resolved names or image-preview progress.
      let reaction_content = filter(copy(message), 'index(["author","senderName","images"],v:key) < 0')
      if has_key(reaction_content, 'attachments')
        let reaction_content.attachments = map(copy(reaction_content.attachments), '{"id":v:val.id}')
      endif
      let reaction_key = sha256(json_encode(reaction_content))
      call add(view.blocks, {'id': message.id, 'start': start, 'body': body_start, 'end': a:offset + len(view.lines), 'indent': empty(parent) && empty(group.error) ? 0 : 2,
            \ 'parent': parent, 'root': group.root, 'loaded_replies': group.loaded_replies, 'key': key, 'reaction_key': reaction_key, 'mentions': mentions, 'excerpt':wbx#history#excerpt({'text':display.text},72),
            \ 'thread_start': 0, 'thread_end': 0, 'thread_head': 0, 'thread_size': 0, 'thread_missing': group.missing, 'thread_error': group.error})
    endfor
    if threaded
      let thread_start = view.blocks[first].start
      let thread_end = view.blocks[-1].end
      for index in range(first, len(view.blocks) - 1)
        call extend(view.blocks[index], {'thread_start': thread_start, 'thread_end': thread_end, 'thread_head': index == first, 'thread_size': group.size})
      endfor
    endif
  endfor
  return view
endfunction

function! wbx#history#presentation() abort
  let kind = get(b:,'wbx_list_kind','')
  return index(['thread','remote-thread','query-message'],kind) >= 0
        \ && wbx#lists#clean(bufnr('%'),kind) && get(b:,'wbx_presentation_tick',-1) == b:changedtick
endfunction
function! wbx#history#present(view) abort
  let kind = get(b:,'wbx_list_kind','')
  if index(['thread','remote-thread','query-message'],kind) < 0 || !wbx#lists#clean(bufnr('%'),kind) | return | endif
  " Deliberately no wbx_kind=history, history room, receipt or mutation owner.
  let b:wbx_message_blocks = deepcopy(a:view.blocks)
  let b:wbx_message_rows = copy(a:view.headers)
  let b:wbx_reply_rows = copy(a:view.replies)
  let b:wbx_quote_rows = copy(a:view.quotes)
  let b:wbx_presentation_tick = b:changedtick
  call wbx#history#syntax()
  for window in win_findbuf(bufnr('%'))
    call win_execute(window,'call wbx#folds#setup()')
    call win_execute(window,'call wbx#folds#restore(' . string(get(get(b:,'wbx_list_fold_views',{}),string(window),{})) . ')')
  endfor
  unlet! b:wbx_list_fold_views
endfunction
function! wbx#history#check_presentation() abort
  if !exists('b:wbx_presentation_tick') || wbx#history#presentation() | return | endif
  call wbx#history#clear()
  unlet! b:wbx_presentation_tick
  for window in win_findbuf(bufnr('%')) | call win_execute(window,'call wbx#folds#setup()') | endfor
endfunction

function! s:remove_props(types) abort
  if exists('*prop_remove')
    let types = filter(copy(a:types), '!empty(prop_type_get(v:val, {"bufnr": bufnr("%")}))')
    if !empty(types)
      call prop_remove({'types': types, 'all': 1}, 1, line('$'))
    endif
  endif
endfunction
function! s:clear_blocks() abort
  if has('nvim') && exists('s:blocks_namespace')
    call nvim_buf_clear_namespace(bufnr('%'), s:blocks_namespace, 0, -1)
  endif
  call s:remove_props(['WbxBlockPrefix', 'WbxBlockHeader', 'WbxBlockContext', 'WbxThreadSummary', 'WbxMentionText'])
  if exists('*sign_unplace')
    call sign_unplace('wbx-message-blocks', {'buffer': bufnr('%')})
  endif
  unlet! b:wbx_block_decorations b:wbx_blocks_tick b:wbx_blocks_metadata b:wbx_blocks_replies
endfunction
function! s:clear_draft() abort
  if has('nvim') && exists('s:draft_namespace')
    call nvim_buf_clear_namespace(bufnr('%'), s:draft_namespace, 0, -1)
  endif
  call s:remove_props(['WbxReplyBanner'])
  unlet! b:wbx_reply_banner
endfunction
function! wbx#history#clear() abort
  call s:clear_blocks()
  if exists('*wbx#reaction_history#clear') | call wbx#reaction_history#clear(bufnr('%')) | endif
  call s:clear_draft()
  for entry in values(get(b:, 'wbx_message_syntax', {})) | call s:syntax_drop(entry) | endfor
  unlet! b:wbx_message_syntax b:wbx_history_syntax_rows b:wbx_syntax_geometry b:wbx_syntax_free b:wbx_syntax_buckets
endfunction

function! s:prop_type(name, group, override, ...) abort
  if empty(prop_type_get(a:name, {'bufnr': bufnr('%')}))
    call prop_type_add(a:name, {'bufnr': bufnr('%'), 'highlight': a:group, 'priority': 250, 'combine': a:0 && a:1 ? 1 : 0, 'override': a:override})
  endif
endfunction
function! s:drop_block(entry, mode) abort
  call s:drop_summary(a:entry, a:mode)
  if has('nvim')
    for id in get(a:entry, 'mention_marks', []) | call nvim_buf_del_extmark(bufnr('%'), s:blocks_namespace, id) | endfor
  elseif get(a:entry, 'mention_count', 0) > 0 && exists('*prop_remove')
    call prop_remove({'id': a:entry.uid, 'type': 'WbxMentionText', 'all': 1}, 1, line('$'))
  endif
  let a:entry.mention_marks = [] | let a:entry.mention_count = 0
  if a:mode ==# 'nvim-inline'
    for id in get(a:entry, 'marks', [])
      call nvim_buf_del_extmark(bufnr('%'), s:blocks_namespace, id)
    endfor
  elseif a:mode ==# 'vim-props'
    " Virtual-text IDs are allocated by Vim (negative, not caller-settable).
    " Retain them on unchanged/moved blocks; remove only this message's IDs.
    let first = empty(a:entry.marks) ? {} : prop_find({'id': a:entry.marks[0], 'type': 'WbxBlockPrefix', 'both': 1, 'lnum': 1, 'col': 1}, 'f')
    let last = empty(a:entry.marks) ? {} : prop_find({'id': a:entry.marks[-1], 'type': 'WbxBlockPrefix', 'both': 1, 'lnum': 1, 'col': 1}, 'f')
    let start = empty(first) || empty(last) ? 1 : first.lnum
    let end = empty(first) || empty(last) ? line('$') : last.lnum
    for id in get(a:entry, 'marks', [])
      call prop_remove({'id': id, 'all': 1}, start, end)
    endfor
    call prop_remove({'id': a:entry.uid, 'type': 'WbxBlockContext', 'both': 1, 'all': 1}, start, end)
  else
    for id in get(a:entry, 'marks', [])
      call sign_unplace('wbx-message-blocks', {'buffer': bufnr('%'), 'id': id})
    endfor
  endif
endfunction
function! s:drop_summary(entry, mode) abort
  let id = get(a:entry, 'summary', 0)
  if !id | return | endif
  if a:mode ==# 'nvim-inline'
    call nvim_buf_del_extmark(bufnr('%'), s:blocks_namespace, id)
  elseif a:mode ==# 'vim-props'
    call prop_remove({'id': id, 'type': 'WbxThreadSummary', 'both': 1, 'all': 1}, 1, line('$'))
  endif
endfunction
function! s:summary(block, entry, mode, changed) abort
  let b:wbx_decoration_checks.summaries += 1
  " Counts are virtual: a reply append must not rewrite a distant root header
  " and every intervening Vim text property in a simple range-based writer.
  let head = get(a:block, 'thread_start', 0) > 0 ? get(a:block, 'thread_head', 0) : empty(get(a:block, 'parent', ''))
  let reply_count = head ? get(a:block, 'loaded_replies', 0) : 0
  let text = reply_count ? ' · ' . reply_count . ' loaded replies' : ''
  if head && !empty(get(a:block, 'thread_error', ''))
    let text = ' · ' . a:block.thread_error . (get(a:block, 'thread_start', 0) > 0 ? ' · ' . a:block.thread_size . ' loaded message' : '')
  elseif head && get(a:block, 'thread_missing', 0)
    let text = ' · parent not loaded' . text
  endif
  if !a:changed && get(a:entry, 'summary_text', '') ==# text | return 0 | endif
  call s:drop_summary(a:entry, a:mode)
  if !empty(text) && a:mode ==# 'nvim-inline'
    let options = {'virt_text': [[text, 'WbxReplyContext']], 'virt_text_pos': 'eol', 'right_gravity': v:true, 'priority': 250}
    if get(a:entry, 'summary', 0) | let options.id = a:entry.summary | endif
    let a:entry.summary = nvim_buf_set_extmark(bufnr('%'), s:blocks_namespace, a:block.start - 1, 0, options)
  elseif !empty(text) && a:mode ==# 'vim-props'
    let a:entry.summary = prop_add(a:block.start, strlen(getline(a:block.start)) + 1, {'type': 'WbxThreadSummary', 'text': text})
  else
    let a:entry.summary = 0
  endif
  let a:entry.reply_count = reply_count
  let a:entry.summary_text = text
  return 1
endfunction
function! s:located(entry, block, mode, signs) abort
  let b:wbx_decoration_checks.locations += 1
  if empty(a:entry.marks)
    return 0
  endif
  if a:mode ==# 'nvim-inline'
    let b:wbx_decoration_checks.endpoints += 2
    let first = nvim_buf_get_extmark_by_id(bufnr('%'), s:blocks_namespace, a:entry.marks[0], {})
    let last = nvim_buf_get_extmark_by_id(bufnr('%'), s:blocks_namespace, a:entry.marks[-1], {})
    return !empty(first) && !empty(last) && first[0] == a:block.start - 1 && last[0] == a:block.end - 1
  elseif a:mode ==# 'vim-props'
    let b:wbx_decoration_checks.endpoints += 2
    " Some Vim versions omit the id field for virtual text in prop_list().
    let first = prop_list(a:block.start, {'types': ['WbxBlockPrefix'], 'ids': [a:entry.marks[0]]})
    let last = prop_list(a:block.end, {'types': ['WbxBlockPrefix'], 'ids': [a:entry.marks[-1]]})
    return !empty(first) && !empty(last)
  endif
  let b:wbx_decoration_checks.endpoints += 2
  return get(a:signs, a:entry.marks[0], 0) == a:block.start && get(a:signs, a:entry.marks[-1], 0) == a:block.end
endfunction
function! s:decorate(block, entry, mode, replies, style) abort
  let marks = []
  for row in range(a:block.start, a:block.end)
    let prefix = repeat(' ', a:block.indent) . (row == a:block.start ? '┌ ' : row == a:block.end ? '└─' : '│ ')
    " Syntax owns header text, including its contained timestamp. A whole-line
    " text property/extmark would paint over WbxMessageTime in a drawn editor.
    let group = row == a:block.start ? '' : has_key(a:replies, row) ? 'WbxReplyContext' : ''
    if a:mode ==# 'nvim-inline'
      " Inserting a grouped reply immediately before another header must move
      " that header's rail/count with its original text, not onto the new reply.
      let text = a:style ==# 'gutter' ? repeat(' ', a:block.indent) : prefix
      let options = {'virt_text': [[text, 'WbxMessageBorder']], 'virt_text_pos': 'inline', 'right_gravity': v:true, 'priority': 250}
      let id = get(a:entry.marks, row - a:block.start, 0)
      if id | let options.id = id | endif
      if !empty(group) && !empty(getline(row))
        call extend(options, {'hl_group': group, 'end_col': strlen(getline(row)), 'hl_mode': 'replace'})
      endif
      call add(marks, nvim_buf_set_extmark(bufnr('%'), s:blocks_namespace, row - 1, 0, options))
    elseif a:mode ==# 'vim-props'
      call add(marks, prop_add(row, 1, {'type': 'WbxBlockPrefix', 'text': prefix}))
      if !empty(group) && !empty(getline(row))
        call prop_add(row, 1, {'id': a:entry.uid, 'type': 'WbxBlockContext', 'length': strlen(getline(row))})
      endif
    elseif exists('*sign_place')
      let name = prefix =~# '┌' ? (prefix =~# '^  ' ? 'WbxReplyStart' : 'WbxMessageStart') : prefix =~# '└' ? 'WbxMessageEnd' : 'WbxMessageRail'
      call sign_define(name, {'text': name ==# 'WbxReplyStart' ? '↪' : name ==# 'WbxMessageStart' ? '┌' : name ==# 'WbxMessageEnd' ? '└' : '│', 'texthl': 'WbxMessageBorder'})
      let id = get(a:entry.marks, row - a:block.start, 0)
      call add(marks, sign_place(id, 'wbx-message-blocks', name, bufnr('%'), {'lnum': row, 'priority': 5}))
    endif
  endfor
  let a:entry.marks = marks
  let a:entry.mention_marks = [] | let a:entry.mention_count = 0
  for mention in get(a:block, 'mentions', [])
    let row = a:block.body + mention[0] - 1
    let column = mention[1] | let length = mention[2]
    if row < a:block.body || row >= a:block.end || column < 1 || length < 1 || column + length - 1 > strlen(getline(row)) | continue | endif
    if has('nvim')
      call add(a:entry.mention_marks, nvim_buf_set_extmark(bufnr('%'), s:blocks_namespace, row - 1, column - 1,
            \ {'end_row': row - 1, 'end_col': column - 1 + length, 'hl_group': 'WbxMention', 'hl_mode': 'combine', 'priority': 250}))
    elseif exists('*prop_add')
      call prop_add(row, column, {'id': a:entry.uid, 'type': 'WbxMentionText', 'length': length})
    endif
    let a:entry.mention_count += 1
  endfor
endfunction
function! wbx#history#blocks() abort
  let b:wbx_decoration_checks = {'equalities': 0, 'inputs': 0, 'messages': 0, 'locations': 0, 'endpoints': 0, 'summaries': 0, 'previous': 0}
  if get(b:, 'wbx_kind', '') !=# 'history' || bufname('%') !=# 'wbx://history' || &l:buftype !=# 'nofile'
    return
  endif
  if get(b:, 'wbx_render_tick', -1) != b:changedtick
    " An edited/shortened copy has no trustworthy row metadata. Never place
    " stale decorations past its end or make user annotations look like UI.
    call s:clear_blocks()
    call wbx#gutter#leave()
    return
  endif
  let blocks = get(b:, 'wbx_message_blocks', [])
  let b:wbx_decoration_checks.inputs = len(blocks)
  let style = wbx#gutter#style()
  call wbx#gutter#enter()
  let same = 0
  if get(b:, 'wbx_blocks_tick', -1) == b:changedtick
    let b:wbx_decoration_checks.equalities += 1
    let same = get(b:, 'wbx_blocks_metadata', []) ==# blocks && get(b:, 'wbx_blocks_replies', []) ==# get(b:, 'wbx_reply_rows', [])
  endif
  if same && get(b:, 'wbx_decorated_mode', '') ==# get(b:, 'wbx_block_display', '') && get(b:, 'wbx_border_style', '') ==# style
    let b:wbx_decoration_work = {'messages': 0, 'rows': 0, 'removed': 0}
    return
  endif
  let mode = get(b:, 'wbx_block_display', has('nvim-0.10') ? 'nvim-inline' : !has('nvim') && exists('*prop_add') ? 'vim-props' : 'signs')
  if get(b:, 'wbx_decorated_mode', mode) !=# mode | call s:clear_blocks() | endif
  let s:blocks_namespace = has('nvim') ? nvim_create_namespace('wbx-message-blocks') : 0
  if !has('nvim') && exists('*prop_add') | call s:prop_type('WbxMentionText', 'WbxMention', 1, 1) | endif
  if mode ==# 'vim-props'
    call s:prop_type('WbxBlockPrefix', 'WbxMessageBorder', 0)
    call s:prop_type('WbxBlockContext', 'WbxReplyContext', 1)
    call s:prop_type('WbxThreadSummary', 'WbxReplyContext', 0)
  endif
  let replies = {}
  for row in get(b:, 'wbx_reply_rows', []) | let replies[row] = 1 | endfor
  let b:wbx_reply_row_set = replies
  let signs = {}
  if mode ==# 'signs'
    for sign in sign_getplaced(bufnr('%'), {'group': 'wbx-message-blocks'})[0].signs | let signs[sign.id] = sign.lnum | endfor
  endif
  let previous = get(b:, 'wbx_block_decorations', {})
  let current = {}
  let b:wbx_decoration_work = {'messages': 0, 'rows': 0, 'removed': 0}
  try
    for block in blocks
      let b:wbx_decoration_checks.messages += 1
      if block.start < 1 || block.end > line('$') | continue | endif
      let entry = get(previous, block.id, {})
      let key = [get(block, 'key', ''), block.end - block.start, block.body - block.start, block.indent, has_key(replies, block.start + 1), style]
      if empty(entry)
        let b:wbx_decoration_serial = get(b:, 'wbx_decoration_serial', 0) + 1
        let entry = {'uid': b:wbx_decoration_serial, 'marks': [], 'key': [], 'summary_key': [0, '', 0, 0], 'summary': 0, 'reply_count': 0, 'summary_text': ''}
      endif
      let changed = entry.key !=# key || !s:located(entry, block, mode, signs)
      if changed
        let reusable = mode ==# 'vim-props' ? [] : copy(entry.marks)
        if !empty(entry.marks) | call s:drop_block(entry, mode) | endif
        let entry.marks = reusable
        call s:decorate(block, entry, mode, replies, style)
        let b:wbx_decoration_work.messages += 1
        let b:wbx_decoration_work.rows += block.end - block.start + 1
      endif
      " Rail verification remains native/exact. Summary text only depends on
      " these chrome inputs, not every unrelated message's body content key.
      let head = get(block, 'thread_start', 0) > 0 ? get(block, 'thread_head', 0) : empty(get(block, 'parent', ''))
      let summary_key = head ? [get(block, 'loaded_replies', 0), get(block, 'thread_error', ''), get(block, 'thread_missing', 0), !empty(get(block, 'thread_error', '')) && get(block, 'thread_start', 0) > 0 ? block.thread_size : 0] : [0, '', 0, 0]
      if get(entry, 'summary_key', []) !=# summary_key || changed && !empty(get(entry, 'summary_text', ''))
        if s:summary(block, entry, mode, changed) && !changed
          let b:wbx_decoration_work.messages += 1
          let b:wbx_decoration_work.rows += 1
        endif
      endif
      let entry.summary_key = summary_key
      let entry.key = key
      let current[block.id] = entry
    endfor
    for id in keys(previous)
      let b:wbx_decoration_checks.previous += 1
      if !has_key(current, id)
        call s:drop_block(previous[id], mode)
        let b:wbx_decoration_work.removed += 1
      endif
    endfor
  catch
    " Older full editors retain a native sign-column boundary and explicit
    " reply labels rather than corrupting/indenting the Markdown source.
    let b:wbx_decoration_error = v:exception . ' at ' . v:throwpoint
    call s:clear_blocks()
    if mode ==# 'signs' | throw 'Webex decoration fallback failed: ' . v:exception | endif
    let b:wbx_block_display = 'signs'
    unlet! b:wbx_blocks_tick
    call wbx#history#blocks()
    return
  endtry
  let b:wbx_block_display = mode
  let b:wbx_border_style = style
  let b:wbx_decorated_mode = mode
  let b:wbx_block_decorations = current
  let b:wbx_blocks_tick = b:changedtick
  let b:wbx_blocks_metadata = deepcopy(blocks)
  let b:wbx_blocks_replies = copy(get(b:, 'wbx_reply_rows', []))
endfunction

function! wbx#history#draft() abort
  let edit = !empty(get(b:, 'wbx_message_context', {})) && wbx#message_actions#owned(bufnr('%'))
  if !edit && (get(b:, 'wbx_kind', '') !=# 'compose' || &l:buftype !=# 'nofile')
    return
  endif
  let parent = get(b:, 'wbx_parent', '')
  let target = edit ? 'EDIT [' . get(b:,'wbx_mutation_status','prepared') . '] → ' . b:wbx_message_context.roomId . ' / ' . b:wbx_message_context.messageId
        \ : '→ ' . s:line(get(b:, 'wbx_title', get(b:, 'wbx_room', '')), 80)
  let text = target . ' · ' . wbx#drafts#summary(bufnr('%'))
  if edit
    let text .= get(b:, 'wbx_context_stale', 0) ? ' · STALE PREPARATION; prepare afresh' : ''
  endif
  if !empty(parent) | let text = '↪ Replying to ' . get(b:, 'wbx_reply_label', 'parent not loaded') . ' · ' . text | endif
  let file = edit ? '' : wbx#uploads#label(bufnr('%'))
  if !empty(file) | let text .= ' · ' . s:line(file, 180) | endif
  let hint = s:line(get(b:, 'wbx_send_hint', ''), 240)
  let text .= empty(hint) ? '' : (empty(text) ? '' : ' · ') . hint
  let metadata = [b:changedtick, text]
  if get(b:, 'wbx_reply_banner', []) ==# metadata
    return
  endif
  call s:clear_draft()
  if !empty(text)
    if has('nvim')
      try
        let s:draft_namespace = nvim_create_namespace('wbx-reply-context')
        call nvim_buf_set_extmark(bufnr('%'), s:draft_namespace, 0, 0, {'virt_lines': [[[text, 'WbxReplyContext']]], 'virt_lines_above': v:true, 'right_gravity': v:false})
      catch
        " Old Neovim retains the explicit statusline/destination context.
      endtry
    elseif exists('*prop_add')
      try
        call s:prop_type('WbxReplyBanner', 'WbxReplyContext', 0)
        call prop_add(1, 0, {'type': 'WbxReplyBanner', 'text': text, 'text_align': 'above'})
      catch
        " The native statusline/destination accessor still exposes the target.
      endtry
    endif
  endif
  let b:wbx_reply_banner = metadata
endfunction
function! wbx#history#draft_enter() abort
  if !wbx#view#owned(bufnr('%'), 'compose')
        \ && (empty(get(b:, 'wbx_message_context', {})) || !wbx#message_actions#owned(bufnr('%'))) | return | endif
  call wbx#history#draft()
  if has('nvim') && !empty(get(b:, 'wbx_reply_banner', [])) && line('w0') == 1
    " The extmark is buffer-local, but topfill belongs to each window. Re-entering
    " an unchanged draft (including plain i) must reveal its already-built header.
    " Only explicit entry does this: background updates retain the reader's view.
    let view = winsaveview()
    let view.topfill = max([1, get(view, 'topfill', 0)])
    call winrestview(view)
  endif
endfunction

function! wbx#history#syntax() abort
  call wbx#history#blocks()
  if get(b:, 'current_syntax', '') !=# 'wbx-history'
    return
  endif
  let headers = get(b:, 'wbx_message_rows', v:null)
  let quotes = get(b:, 'wbx_quote_rows', [])
  let replies = get(b:, 'wbx_reply_rows', [])
  let blocks = get(b:, 'wbx_message_blocks', v:null)
  let metadata = [headers, quotes, replies, blocks]
  let b:wbx_syntax_checks = {'equalities': 0, 'inputs': blocks is v:null ? 0 : len(blocks), 'geometry': 0, 'identities': 0, 'messages': 0, 'previous': 0, 'buckets': 0}
  let b:wbx_syntax_work = 0
  let b:wbx_syntax_bucket_work = 0
  if exists('b:wbx_history_syntax_rows')
    let b:wbx_syntax_checks.equalities += 1
    if b:wbx_history_syntax_rows ==# metadata | return | endif
  endif
  let geometry = [headers, quotes, replies, blocks is v:null ? v:null : map(copy(blocks), '[v:val.start, v:val.body, v:val.end]')]
  let b:wbx_syntax_checks.geometry = blocks is v:null ? 0 : len(blocks)
  " Native rules describe rows/chrome, not message text or identity. A new
  " space with identical geometry can reuse them after rekeying detached IDs.
  if exists('b:wbx_history_syntax_rows') && exists('b:wbx_syntax_geometry') && b:wbx_syntax_geometry ==# geometry
        \ && s:syntax_rekey(blocks, b:wbx_history_syntax_rows[3])
    let b:wbx_history_syntax_rows = deepcopy(metadata)
    return
  endif
  if !exists('b:wbx_message_syntax')
    silent! syntax clear WbxMessageHeader
    silent! syntax clear WbxQuoteLabel
    silent! syntax clear WbxReplyContext
    silent! syntax clear WbxMessageBody
    syntax match WbxMessageHeader contained /^.*/ contains=WbxMessageTime
    syntax match WbxReplyContext contained /^.*/
    syntax match WbxQuoteLabel contained /^.*/
    let b:wbx_message_syntax = {}
    let b:wbx_syntax_buckets = {}
  endif
  if blocks is v:null
    let b:wbx_syntax_fallback = 1
    syntax region WbxMessageBody transparent start=/\%1l^/ end=/\%$l$/ keepend contains=@WbxMessageMarkdown
  else
    if get(b:, 'wbx_syntax_fallback', 0)
      " An initially empty/unowned buffer may have loaded the ordinary syntax
      " fallback before renderer metadata arrived. It must not remain unbounded.
      silent! syntax clear WbxMessageBody
      silent! syntax clear WbxMessageHeader
      syntax match WbxMessageHeader contained /^.*/ contains=WbxMessageTime
      let b:wbx_syntax_fallback = 0
    endif
    let current = {}
    let quote_set = {}
    let reply_set = {}
    let wanted = {}
    let buckets = {}
    for block in blocks | let wanted[block.id] = 1 | endfor
    let b:wbx_syntax_free = get(b:, 'wbx_syntax_free', [])
    for id in keys(b:wbx_message_syntax)
      let b:wbx_syntax_checks.previous += 1
      if !has_key(wanted, id)
        call s:syntax_drop(b:wbx_message_syntax[id])
        call add(b:wbx_syntax_free, b:wbx_message_syntax[id].uid)
        call remove(b:wbx_message_syntax, id)
      endif
    endfor
    for row in quotes | let quote_set[row] = 1 | endfor
    for row in replies | let reply_set[row] = 1 | endfor
    for block in blocks
      let b:wbx_syntax_checks.messages += 1
      let entry = get(b:wbx_message_syntax, block.id, {})
      let shape = [block.start, block.body, block.end]
      let chrome = [['WbxMessageHeader', block.start]]
      for row in range(block.start + 1, block.body - 1)
        if has_key(reply_set, row) | call add(chrome, ['WbxReplyContext', row]) | endif
        if has_key(quote_set, row) | call add(chrome, ['WbxQuoteLabel', row]) | endif
      endfor
      call add(shape, chrome)
      if empty(entry)
        if !empty(b:wbx_syntax_free)
          let uid = remove(b:wbx_syntax_free, -1)
        else
          let b:wbx_syntax_serial = get(b:, 'wbx_syntax_serial', 0) + 1
          let uid = b:wbx_syntax_serial
        endif
        let entry = {'uid': uid, 'shape': []}
      endif
      if entry.shape !=# shape
        let b:wbx_syntax_work += 1
      endif
      let entry.shape = shape
      let current[block.id] = entry
      " Stable IDs keep an append/local edit from rebuilding unrelated rules.
      " Each bucket shares at most 16 exact starts/ends, not a spanning region.
      let bucket = (entry.uid - 1) / 16
      if !has_key(buckets, bucket) | let buckets[bucket] = [] | endif
      call add(buckets[bucket], shape)
    endfor
    let b:wbx_message_syntax = current
    for bucket in keys(b:wbx_syntax_buckets)
      if !has_key(buckets, bucket) | call s:syntax_bucket_drop(bucket) | endif
    endfor
    for [bucket, shapes] in items(buckets)
      let b:wbx_syntax_checks.buckets += 1
      if get(b:wbx_syntax_buckets, bucket, []) !=# shapes
        call s:syntax_bucket(bucket, shapes)
      endif
    endfor
  endif
  if headers is v:null
    " Syntax-only/ordinary filetype use has no renderer metadata.
    syntax match WbxMessageHeader /^## .* · \d\{4}-\d\d-\d\d \d\d:\d\d\%( \%(UTC\|[+-]\d\d:\d\d\)\)\?\%( · edited\)\?$/ contains=WbxMessageTime containedin=ALL
  endif
  let b:wbx_history_syntax_rows = deepcopy(metadata)
  let b:wbx_syntax_geometry = deepcopy(geometry)
endfunction
function! s:syntax_rekey(blocks, previous) abort
  if a:blocks is v:null || a:previous is v:null || !exists('b:wbx_message_syntax') | return 0 | endif
  let current = {}
  for index in range(len(a:blocks))
    let b:wbx_syntax_checks.identities += 1
    let entry = get(b:wbx_message_syntax, a:previous[index].id, {})
    if empty(entry) | return 0 | endif
    let current[a:blocks[index].id] = entry
  endfor
  let b:wbx_message_syntax = current
  return 1
endfunction
function! s:syntax_drop(entry) abort
  if empty(get(a:entry, 'shape', [])) | return | endif
  call s:syntax_bucket_drop((a:entry.uid - 1) / 16)
endfunction
function! s:syntax_bucket_drop(bucket) abort
  if !has_key(get(b:, 'wbx_syntax_buckets', {}), a:bucket) | return | endif
  execute 'silent! syntax clear WbxBodyBucket' . a:bucket
  for group in ['WbxMessageHeader', 'WbxReplyContext', 'WbxQuoteLabel']
    execute 'silent! syntax clear WbxChromeBucket' . a:bucket . '_' . group
  endfor
  call remove(b:wbx_syntax_buckets, a:bucket)
endfunction
function! s:syntax_rows(rows) abort
  " Cheap range rejection precedes a small exact-row alternation. No message
  " text participates in a pattern, and buckets need not be contiguous.
  return '\%>' . (min(a:rows) - 1) . 'l\%<' . (max(a:rows) + 1) . 'l\%('
        \ . join(map(copy(a:rows), '"\\%" . v:val . "l"'), '\|') . '\)'
endfunction
function! s:syntax_bucket(bucket, shapes) abort
  call s:syntax_bucket_drop(a:bucket)
  let starts = []
  let ends = []
  let chrome = {'WbxMessageHeader': [], 'WbxReplyContext': [], 'WbxQuoteLabel': []}
  for shape in a:shapes
    if shape[1] < shape[2]
      call add(starts, shape[1])
      call add(ends, shape[2] - 1)
    endif
    for [group, row] in shape[3] | call add(chrome[group], row) | endfor
  endfor
  if !empty(starts)
    " Message intervals never overlap: the first bucket end after each exact
    " start is that message's own end. keepend bounds even an unclosed fence.
    execute 'syntax region WbxBodyBucket' . a:bucket . ' transparent start=/^' . s:syntax_rows(starts)
          \ . '/ end=/' . s:syntax_rows(ends) . '$/ keepend contains=@WbxMessageMarkdown'
  endif
  for group in ['WbxMessageHeader', 'WbxReplyContext', 'WbxQuoteLabel']
    let rows = chrome[group]
    if !empty(rows)
      execute 'syntax match WbxChromeBucket' . a:bucket . '_' . group . ' /^' . s:syntax_rows(rows) . '.*/ transparent contains=' . group
    endif
  endfor
  let b:wbx_syntax_buckets[a:bucket] = a:shapes
  let b:wbx_syntax_bucket_work += 1
endfunction

" Window-local API: callers save before text/metadata writes, restore afterwards.
" Pass 1 only at a new history window's pre-FileType/defaults stage, where
" unchanged global folding defaults may be specialized. Call without it after
" hooks and on later entries/updates; explicit local choices remain authoritative.
function! wbx#history#fold_setup(...) abort
  return wbx#folds#setup(a:0 ? a:1 : 0)
endfunction
function! wbx#history#fold_save() abort
  return wbx#folds#save()
endfunction
function! wbx#history#fold_restore(state) abort
  return wbx#folds#restore(a:state)
endfunction
function! wbx#history#thread_fold() abort
  return wbx#folds#thread()
endfunction
augroup wbx_reply_banner
  autocmd!
  autocmd TextChanged,TextChangedI * if get(b:, 'wbx_kind', '') ==# 'compose' | call wbx#history#draft() | endif
  autocmd BufWinEnter,WinEnter,InsertEnter * if get(b:, 'wbx_kind', '') ==# 'compose' || exists('b:wbx_message_context') | call wbx#history#draft_enter() | endif
  autocmd TextChanged,TextChangedI,BufFilePost * if exists('b:wbx_presentation_tick') | call wbx#history#check_presentation() | endif
  autocmd OptionSet buftype if exists('b:wbx_presentation_tick') | call wbx#history#check_presentation() | endif
  autocmd BufWinEnter,WinEnter * if exists('b:wbx_presentation_tick') | call wbx#history#check_presentation() | call wbx#folds#setup() | endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
