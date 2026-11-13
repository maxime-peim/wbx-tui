" Local grouping/filter presentation. No profile lookup, files, membership or receipts.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:filter = 'all'
let s:projections = 0
function! wbx#sections#diagnostics() abort
  return {'projections': s:projections}
endfunction
function! s:revision() abort
  return get(get(wbx#state(), 'sections', {}), 'revision', 0)
endfunction
function! s:pick(lines, Callback) abort
  call wbx#chooser#select(a:lines, a:Callback)
endfunction
function! s:menu_context() abort
  return {'row': line('.'), 'section': s:section(''), 'room': s:assignment_room()}
endfunction
function! wbx#sections#menu() abort
  if !wbx#supports('local-sections-v1') | echomsg '[wbx-tui] Local sections require a connected updated backend.' | return | endif
  let origin = wbx#view#intent()
  let revision = s:revision()
  call s:pick(['Client-local sections (never Webex membership/cloud sync):',
        \ '1. Create', '2. Rename', '3. Remove grouping only', '4. Collapse/expand',
        \ '5. Assign selected room', '6. Move section', '7. Load saved grouping',
        \ '8. Save grouping explicitly', '9. Clear saved/current grouping'], function('s:menu_chosen', [origin, revision, s:menu_context()]))
endfunction
function! s:menu_chosen(origin, revision, context, choice) abort
  let actions = ['create', 'rename', 'remove', 'toggle', 'assign', 'move', 'load', 'save', 'clear']
  if a:choice < 1 || a:choice > len(actions) || !wbx#view#picker_valid(a:origin)
        \ || s:revision() != a:revision || s:menu_context() !=# a:context | return | endif
  let origin = wbx#view#intent()
  let value = a:choice == 6 ? input('Section position (1–32): ') : ''
  if !wbx#view#intent_valid(origin) | return | endif
  if s:revision() != a:revision | return | endif
  call wbx#sections#action(actions[a:choice - 1], value)
endfunction
function! wbx#sections#filter(value) abort
  let value = a:value
  if empty(value)
    let origin = wbx#view#intent()
    let items = copy(get(get(wbx#state(), 'sections', {}), 'items', []))
    let choices = ['all', 'unread', 'direct', 'group', 'drafts'] + map(copy(items), '"section:" . v:val.id')
    let labels = ['All loaded spaces', 'Unread (loaded)', 'Direct conversations', 'Group spaces', 'Local normal/reply/file drafts (loaded rooms)']
          \ + map(items, '"Local section: " . v:val.name')
    call s:pick(['Local filter (never changes selected destination):'] + map(labels, 'printf("%d. %s", v:key + 1, v:val)'),
          \ function('s:filter_chosen', [origin, deepcopy(get(wbx#state(), 'sections', {})), choices, s:filter]))
    return
  endif
  if value =~# '^team:'
    let team = strpart(value, 5)
    if empty(filter(copy(get(wbx#state(), 'rooms', [])), 'get(v:val, "teamId", "") ==# team'))
      echoerr 'Choose an actual Server Team ID on loaded room metadata.' | return
    endif
    let s:filter = value | call wbx#redraw() | return
  endif
  if index(['all', 'unread', 'direct', 'group', 'drafts'], value) < 0
    let name = substitute(value, '^section:', '', '')
    let matches = filter(copy(get(get(wbx#state(), 'sections', {}), 'items', [])), 'v:val.name ==# name || v:val.id ==# name')
    if len(matches) != 1 | echoerr 'Choose an existing local section or all/unread/direct/group.' | return | endif
    let value = matches[0].id
  endif
  let s:filter = value
  call wbx#redraw()
endfunction
function! s:filter_chosen(origin, sections, choices, previous, choice) abort
  if a:choice < 1 || a:choice > len(a:choices) || !wbx#view#picker_valid(a:origin) || s:filter !=# a:previous
        \ || get(wbx#state(), 'sections', {}) !=# a:sections | return | endif
  call wbx#sections#filter(a:choices[a:choice - 1])
endfunction
function! wbx#sections#current_filter() abort
  return s:filter
endfunction
function! wbx#sections#reset() abort
  let s:filter = 'all'
endfunction
function! s:section(name) abort
  let items = get(get(wbx#state(), 'sections', {}), 'items', [])
  if !empty(a:name)
    let matches = filter(copy(items), 'v:val.name ==# a:name || v:val.id ==# a:name')
    return len(matches) == 1 ? matches[0].id : ''
  endif
  if wbx#view#owned(bufnr('%'), 'rooms') && !wbx#view#edited(bufnr('%'))
    let row = get(get(b:, 'wbx_row_ids', []), line('.') - 1, '')
    if !empty(row)
      let decoded = json_decode(row)
      if type(decoded) == v:t_list && decoded[0] ==# 'section' | return decoded[1] | endif
    endif
  endif
  return ''
endfunction
function! s:assignment_room() abort
  if wbx#view#owned(bufnr('%'), 'rooms') && !wbx#view#edited(bufnr('%'))
    return get(get(b:, 'wbx_room_ids', []), line('.') - 1, '')
  endif
  let selected = get(wbx#state(), 'room', v:null)
  return type(selected) == v:t_dict ? selected.id : ''
endfunction
function! wbx#sections#action(action, value) abort
  if !wbx#supports('local-sections-v1') | echoerr 'Local sections require a connected updated backend.' | return | endif
  let state = wbx#state()
  let origin = wbx#view#intent()
  let revision = get(get(state, 'sections', {}), 'revision', 0)
  if index(['load', 'save', 'clear'], a:action) >= 0
    if a:action !=# 'save' && confirm('Replace current local grouping? No Webex room is changed.', "&Cancel\n&Yes, continue", 1) != 2 | return | endif
    if !wbx#view#intent_valid(origin) || s:revision() != revision | return | endif
    return wbx#rpc('sections.preferences', {'revision': revision, 'action': a:action})
  endif
  let edit = {'action': a:action}
  if a:action ==# 'create'
    let edit.name = empty(a:value) ? input('New local section name: ') : a:value
    if empty(edit.name) | return | endif
  elseif a:action ==# 'assign'
    let edit.roomId = s:assignment_room()
    if empty(edit.roomId) | echoerr 'Choose an actual room row or a selected conversation.' | return | endif
    let edit.id = a:value ==# '-' ? '' : s:section(a:value)
  else
    let edit.id = s:section(index(['rename', 'move'], a:action) >= 0 ? '' : a:value)
  endif
  if has_key(edit, 'id') && empty(edit.id) && !(a:action ==# 'assign' && a:value ==# '-')
    if !empty(a:value) && index(['rename', 'move'], a:action) < 0 | return | endif
    let items = deepcopy(get(get(state, 'sections', {}), 'items', []))
    call s:pick(['Choose local section:'] + map(copy(items), 'printf("%d. %s", v:key + 1, v:val.name)'),
          \ function('s:section_chosen', [origin, revision, edit, a:value, items]))
    return
  endif
  if !wbx#view#intent_valid(origin) | return | endif
  call s:edit(edit, a:value, revision)
endfunction
function! s:section_chosen(origin, revision, edit, value, items, choice) abort
  if a:choice < 1 || a:choice > len(a:items) || !wbx#view#picker_valid(a:origin)
        \ || s:revision() != a:revision
        \ || has_key(a:edit, 'roomId') && a:edit.roomId !=# s:assignment_room() | return | endif
  let edit = copy(a:edit) | let edit.id = a:items[a:choice - 1].id
  call s:edit(edit, a:value, a:revision)
endfunction
function! s:edit(edit, value, revision) abort
  if !wbx#supports('local-sections-v1') || s:revision() != a:revision | return | endif
  let origin = wbx#view#intent()
  let edit = copy(a:edit)
  if edit.action ==# 'rename'
    let edit.name = empty(a:value) ? input('Rename local section: ') : a:value
    if empty(edit.name) | return | endif
  elseif edit.action ==# 'move'
    if a:value !~# '^\d\{1,2}$' || str2nr(a:value) < 1 || str2nr(a:value) > 32 | echoerr 'Section position must be 1–32.' | return | endif
    let edit.position = str2nr(a:value) - 1
  endif
  if !wbx#view#intent_valid(origin) || s:revision() != a:revision | return | endif
  return wbx#rpc('sections.edit', {'revision': a:revision, 'edit': edit})
endfunction
function! wbx#sections#enter() abort
  if !wbx#view#owned(bufnr('%'), 'rooms') || wbx#view#edited(bufnr('%')) | return 0 | endif
  let row = get(get(b:, 'wbx_row_ids', []), line('.') - 1, '')
  if empty(row) | return 0 | endif
  let value = json_decode(row)
  if type(value) != v:t_list || len(value) != 2 || value[0] !=# 'section' | return 0 | endif
  call wbx#sections#action('toggle', value[1])
  return 1
endfunction
function! wbx#sections#counts(rooms, displays, status) abort
  let counts = {'unread': 0, 'unknown': 0, 'stale': 0}
  for index in range(len(a:rooms))
    let room = a:rooms[index]
    let counts.unread += a:displays[index].unread is v:true
    if type(get(room, 'unread', v:null)) != v:t_bool
      let counts.unknown += 1
    elseif get(room, 'unreadStale', 0) || get(room, 'cached', 0) || a:status !=# 'ready'
      let counts.stale += 1
    endif
  endfor
  return counts
endfunction
function! wbx#sections#rows(rooms, selected, offset, displays, read_status, prefs) abort
  let s:projections += 1
  let items = get(a:prefs, 'items', [])
  let groups = []
  let assigned = {}
  let by_id = {}
  for item in items
    let by_id[item.id] = len(groups)
    call add(groups, {'id': item.id, 'name': item.name, 'collapsed': item.collapsed, 'rooms': [], 'displays': []})
    for id in item.rooms | let assigned[id] = item.id | endfor
  endfor
  call add(groups, {'id': '', 'name': empty(items) ? '' : 'Unassigned', 'collapsed': 0, 'rooms': [], 'displays': []})
  let filter = s:filter
  let team_filter = filter =~# '^team:'
  if !team_filter && index(['all', 'unread', 'direct', 'group', 'drafts'], filter) < 0 && !has_key(by_id, filter) | let filter = 'all' | let s:filter = 'all' | endif
  let index = 0
  for room in a:rooms
    let display = a:displays[index]
    let index += 1
    let section = get(assigned, room.id, '')
    if filter ==# 'unread' && display.unread isnot v:true
           \ || filter ==# 'drafts' && !get(room, 'localDraft', 0) && !get(room, 'localReplyDraft', 0)
           \    && !get(room, 'recoveryDraft', 0) && !get(room, 'recoveryUncertain', 0)
          \ || index(['direct', 'group'], filter) >= 0 && get(room, 'type', '') !=# filter
          \ || team_filter && get(room, 'teamId', '') !=# strpart(filter, 5)
          \ || has_key(by_id, filter) && section !=# filter | continue | endif
    let group = groups[get(by_id, section, len(groups) - 1)]
    let projected = copy(room)
    if !has_key(room, 'unread')
      let projected.title .= ' [unread unknown]'
    elseif get(room, 'unreadStale', 0) || a:read_status !=# 'ready'
      let projected.title .= ' [unread stale]'
    endif
    call add(group.rooms, projected)
    call add(group.displays, display)
  endfor
  let out = {'lines': [], 'ids': [], 'row_ids': [], 'unread': [], 'local_read': [], 'local_unread': [], 'cached': [], 'presence': [], 'unknown': 0, 'stale': 0, 'edge': 0}
  let matched = 0 | let selected_shown = empty(a:selected)
  for group in groups
    let matched += len(group.rooms)
    if !group.collapsed && !empty(filter(copy(group.rooms), 'v:val.id ==# a:selected')) | let selected_shown = 1 | endif
  endfor
  if filter !=# 'all' || !selected_shown
    let label = team_filter ? 'Server Team: ' . strpart(filter, 5) : has_key(by_id, filter) ? 'section: ' . groups[by_id[filter]].name : filter
    call add(out.lines, '[Local filter: ' . label . ' · ' . matched . '/' . len(a:rooms) . ' loaded'
          \ . (selected_shown ? '' : ' · selected hidden') . ' · :WebexFilter all]')
    call add(out.ids, '') | call add(out.row_ids, '')
  endif
  if !matched
    call add(out.lines, '[No matching loaded spaces · :WebexFilter all; no selection or fetch implied]')
    call add(out.ids, '') | call add(out.row_ids, '')
  endif
  for group in groups
    if has_key(by_id, filter) && group.id !=# filter | continue | endif
    if filter !=# 'all' && empty(group.rooms) && !has_key(by_id, filter) | continue | endif
    if !empty(group.name)
      let counts = wbx#sections#counts(group.rooms, group.displays, a:read_status)
      call add(out.lines, (group.collapsed ? '[+] ' : '[-] ') . group.name . ' (' . len(group.rooms) . ')'
            \ . ' [' . counts.unread . ' unread · ' . counts.unknown . ' unknown · ' . counts.stale . ' stale]')
      call add(out.ids, '') | call add(out.row_ids, empty(group.id) ? '' : json_encode(['section', group.id]))
    endif
    if group.collapsed | continue | endif
    let rows = wbx#rooms#rows(group.rooms, a:selected, a:offset + len(out.lines), group.displays, a:read_status)
    for key in ['lines', 'ids', 'row_ids', 'unread', 'local_read', 'local_unread', 'cached', 'presence'] | call extend(out[key], rows[key]) | endfor
    let out.unknown += rows.unknown | let out.stale += rows.stale
    if !empty(rows.ids) | let out.edge = a:offset + len(out.lines) | endif
  endfor
  return out
endfunction
augroup wbx_sections
  autocmd!
  autocmd User WbxDisconnected call wbx#sections#reset()
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
