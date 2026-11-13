" One effective command catalogue for plain Vim, health and optional which-key.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:installed = []
let s:conflicts = []
let s:group_modes = {'workspace': 'Workspace', 'messages': 'Messages', 'message-actions': 'Message actions', 'files': 'Files',
      \ 'conversations': 'Conversations', 'views': 'Views', 'meetings': 'Meetings', 'recovery': 'Recovery'}
function! wbx#commands#complete(lead, line, position) abort
  " Only local enums and already-published section metadata. Never dispatch a
  " command, ask a provider or derive authority from a completion candidate.
  let command = matchstr(strpart(a:line,0,a:position),'\<Webex\w\+\>')
  let values = get({'WebexFormat':['plain','markdown'],'WebexContent':['files','links','media','cards'],
        \ 'WebexFilter':['all','unread','direct','group','drafts'],
        \ 'WebexActions':['all','available','context'] + sort(keys(s:group_modes)),
        \ 'WebexSectionMove':map(range(1,32),'string(v:val)')},command,[])
  if index(['WebexFilter','WebexSectionAssign','WebexSectionRemove','WebexSectionToggle'],command) >= 0
    for item in get(get(wbx#state(),'sections',{}),'items',[])
      " Ex metacharacters must not be inserted by Tab. Such names remain
      " selectable through the native picker; their safe exact IDs also complete.
      if item.name !~# '[\\"|\r\n]' | call add(values,item.name) | endif
      call add(values,(command ==# 'WebexFilter' ? 'section:' : '') . item.id)
    endfor
    if command ==# 'WebexSectionAssign' | call add(values,'-') | endif
  endif
  return uniq(sort(filter(values,'stridx(v:val,a:lead) == 0')))
endfunction
" key, command, label, target context, backend capability, group, optional usage.
" Invocation is a finite registered Ex command, NEVER a caller-supplied RPC/Ex.
let s:actions = [
      \ ['al', 'WebexReactions', 'Reactions and people', 'reactions', 'message-actions-v1', 'Message actions'],
      \ ['av', 'WebexReadBy', 'Read by…', 'read-by', 'local-context-v1', 'Message actions'],
      \ ['aV', 'WebexReadByToggle', 'Fold reader list', 'history', 'local-context-v1', 'Message actions'],
      \ ['aa', 'WebexReactionAdd', 'Add reaction', 'reactions', 'message-actions-v1', 'Message actions'],
      \ ['ar', 'WebexReactionRemove', 'Remove own reaction', 'reactions', 'message-actions-v1', 'Message actions'],
      \ ['aI', 'WebexReactionResolve', 'Resolve reaction outcome', 'reactions', 'message-actions-v1', 'Message actions'],
      \ ['', 'WebexReactionUnresolved', 'Read-only retained reaction writes; no unlock/retry', 'any', '', 'Recovery'],
      \ ['o', 'WebexAttachment', 'Open attachment', 'history', '', 'Files'],
      \ ['A', 'WebexAttachmentDownload', 'Save attachment', 'history', '', 'Files'],
      \ ['w', 'Webex', 'Open workspace', 'any', '', 'Workspace'],
      \ ['s', 'WebexPickSpace', 'Pick space', 'session', '', 'Workspace'],
      \ ['c', 'WebexCompose', 'Compose', 'room', '', 'Messages'],
      \ ['p', 'WebexPeople', 'People details', 'any', '', 'Views'],
      \ ['r', 'WebexReply', 'Reply', 'history', 'message-replies', 'Messages'],
      \ ['R', 'WebexCancelReply', 'Cancel reply', 'cancel-reply', '', 'Messages'],
      \ ['t', 'WebexThreadFold', 'Toggle whole thread', 'history', '', 'Messages'],
      \ ['g', 'WebexLatest', 'Latest message', 'latest', '', 'Messages'],
      \ ['S', 'WebexSend', 'Send message', 'send', '', 'Messages'],
      \ ['f', 'WebexRefresh', 'Refresh', 'session', '', 'Workspace'],
      \ ['l', 'WebexLayoutReset', 'Reset owned layout', 'any', '', 'Workspace'],
      \ ['d', 'WebexDisconnect', 'Disconnect', 'session', '', 'Workspace'],
      \ ['ae', 'WebexEdit', 'Edit message', 'history', 'message-actions-v1', 'Message actions'],
      \ ['ad', 'WebexDelete', 'Delete message', 'history', 'message-actions-v1', 'Message actions'],
      \ ['as', 'WebexEditSubmit', 'Submit edit', 'edit', 'message-actions-v1', 'Message actions'],
      \ ['ac', 'WebexEditCancel', 'Cancel edit', 'edit', 'message-actions-v1', 'Message actions'],
      \ ['af', 'WebexFormat', 'Draft format', 'rich', '', 'Message actions', '[plain|markdown]'],
      \ ['am', 'WebexMention', 'Mention person', 'rich', 'markdown-send-v1', 'Message actions'],
      \ ['aM', 'WebexMentionAll', 'Mention everyone', 'rich', 'markdown-send-v1', 'Message actions'],
      \ ['ab', 'WebexBookmark', 'Local bookmark', 'history', 'local-context-v1', 'Message actions'],
      \ ['aq', 'WebexQuote', 'Copy quotation', 'history', 'local-context-v1', 'Message actions'],
      \ ['ai', 'WebexQuoteInsert', 'Insert quotation', 'draft', 'local-context-v1', 'Message actions'],
      \ ['', 'WebexQuoteDetach', 'Detach copied-text source guards (confirm)', 'draft-local', '', 'Message actions'],
      \ ['aR', 'WebexThreadReply', 'Reply to thread', 'thread-reply', 'message-replies', 'Message actions'],
      \ ['', 'WebexQueryReply', 'Reply to queried thread', 'query-thread', 'message-replies', 'Message actions'],
      \ ['ua', 'WebexAttach', 'Attach file', 'draft', 'uploads-v1', 'Files', '[path]'],
      \ ['ur', 'WebexAttachRemove', 'Remove staged file', 'draft-local', '', 'Files'],
      \ ['uc', 'WebexUploadCancel', 'Cancel upload', 'draft', 'uploads-v1', 'Files'],
      \ ['us', 'WebexAttachmentStatus', 'Attachment status', 'draft-local', '', 'Files'],
      \ ['nd', 'WebexDirect', 'New direct message', 'session', 'conversations-v1', 'Conversations', '[person ID or email]'],
      \ ['np', 'WebexDirectory', 'Find person', 'session', 'directory-search-v1', 'Conversations', '[name prefix]'],
      \ ['nP', 'WebexProfile', 'Person profile', 'profile-source', 'people-profile-v1', 'Conversations', '[exact person ID]'],
      \ ['', 'WebexProfileRefresh', 'Explicit same-person textual refresh', 'profile-local', 'people-profile-v1', 'Views'],
      \ ['', 'WebexDirectoryRefresh', 'Refresh this exact directory prefix', 'directory', 'directory-search-v1', 'Conversations'],
      \ ['', 'WebexDirectoryMore', 'Explicit next bounded directory page', 'directory', 'directory-search-v1', 'Conversations'],
      \ ['', 'WebexDirectoryDirect', 'Prepare exact directory person DM; never send', 'directory', 'directory-search-v1', 'Conversations'],
      \ ['ns', 'WebexCreateSpace', 'Create space', 'session', 'conversations-v1', 'Conversations', '[title]'],
      \ ['', 'WebexRenameSpace', 'Rename standalone group title only (confirm; non-atomic)', 'space-rename', 'conversations-v1', 'Conversations', '[title]'],
      \ ['', 'WebexRenameTeam', 'Rename exact joined Team; fresh moderator proof, non-atomic', 'team-rename', 'joined-teams-v1', 'Conversations', '[name]'],
      \ ['', 'WebexDescribeTeam', 'Prepare exact joined-Team description (read; no PUT)', 'team-description-prepare', 'joined-teams-v1', 'Conversations'],
      \ ['', 'WebexTeamDescriptionSubmit', 'Replace Team description with required name echo (confirm)', 'team-description-submit', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexTeamDescriptionCancel', 'Retire Team metadata preparation; retain native text/undo', 'team-description-local', '', 'Conversations'],
      \ ['', 'WebexDescribeSpace', 'Prepare standalone description edit (read; no PUT)', 'space-description-prepare', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexDescriptionSubmit', 'Replace description with required title echo (confirm)', 'space-description-submit', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexDescriptionCancel', 'Retire description edit; retain native text/undo', 'space-description-local', '', 'Conversations'],
      \ ['', 'WebexDescriptionClear', 'Remove description from unchanged preparation (confirm title echo)', 'space-description-clear', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexLockSpace', 'Moderate own private standalone space (confirm title echo)', 'space-lock', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexUnlockSpace', 'Unmoderate private standalone space (fresh moderator proof)', 'space-lock', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexAnnouncementOn', 'Enable moderated-space announcements (notify; confirm title echo)', 'space-announcement', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexAnnouncementOff', 'Disable announcements; stay moderated (fresh proof)', 'space-announcement', 'conversations-v1', 'Conversations'],
      \ ['no', 'WebexConversationOpen', 'Open conversation', 'session', 'conversations-v1', 'Conversations'],
      \ ['nc', 'WebexDirectCancel', 'Cancel direct draft', 'recipient', '', 'Conversations'],
      \ ['ni', 'WebexInvite', 'Invite person', 'room', 'memberships-write-v1', 'Conversations', '[person ID or email]'],
      \ ['nr', 'WebexRemoveMember', 'Remove member', 'members', 'memberships-write-v1', 'Conversations'],
      \ ['nl', 'WebexLeaveSpace', 'Leave space', 'room', 'memberships-write-v1', 'Conversations'],
      \ ['vp', 'WebexMembers', 'Participants', 'room', 'room-members-v1', 'Views'],
      \ ['', 'WebexDirectVisibility', 'Own direct-membership API flag; NOT Hide/mute/Favorites sync', 'member-visibility', 'room-members-v1', 'Views'],
      \ ['', 'WebexDirectVisibilityRefresh', 'Explicit same-session own-direct API flag reread', 'member-visibility-bound', 'room-members-v1', 'Views'],
      \ ['vP', 'WebexPeopleRefresh', 'Refresh presence', 'room', 'people-status', 'Views'],
      \ ['vt', 'WebexTeams', 'Loaded Teams', 'session', 'server-teams-v1', 'Views'],
      \ ['vT', 'WebexJoinedTeams', 'Joined Teams', 'session', 'joined-teams-v1', 'Views'],
      \ ['', 'WebexJoinedTeamsRefresh', 'Fresh same-session joined-Team query', 'joined-teams-bound', 'joined-teams-v1', 'Views'],
      \ ['', 'WebexJoinedTeamsMore', 'Explicit next bounded joined-Team page', 'joined-teams', 'joined-teams-v1', 'Views'],
      \ ['', 'WebexJoinedTeamFilter', 'Filter loaded spaces by exact joined-Team ID; never join', 'joined-teams', 'joined-teams-v1', 'Views'],
      \ ['vf', 'WebexFilter', 'Filter spaces', 'session', '', 'Views', '[filter]'],
      \ ['vs', 'WebexSections', 'Local sections', 'session', 'local-sections-v1', 'Views'],
      \ ['vn', 'WebexNotifications', 'Notifications', 'any', '', 'Views'],
      \ ['vb', 'WebexBookmarks', 'Local bookmarks', 'room', 'local-context-v1', 'Views'],
      \ ['vh', 'WebexThread', 'Loaded thread', 'history', 'local-context-v1', 'Views'],
      \ ['vH', 'WebexThreadFetch', 'Fetch thread', 'history', 'message-queries-v1', 'Views'],
      \ ['vi', 'WebexMentions', 'Mentions of me', 'room', 'message-queries-v1', 'Views'],
      \ ['', 'WebexQueryRefresh', 'Explicit query refresh; no automatic replay', 'message-query-bound', 'message-queries-v1', 'Views'],
      \ ['', 'WebexQueryMore', 'Explicit next bounded thread/mentions page', 'message-query', 'message-queries-v1', 'Views'],
      \ ['', 'WebexQueryMessage', 'Open inert selected query body; no provider request', 'message-query', 'message-queries-v1', 'Views'],
      \ ['', 'WebexQueryJump', 'Exact loaded main-history jump; never fetch/select', 'message-query', 'message-queries-v1', 'Views'],
      \ ['vg', 'WebexContent', 'Shared content', 'room', 'local-context-v1', 'Views', '[files|links|media|cards]'],
      \ ['vC', 'WebexCards', 'Card text', 'room', 'adaptive-card-text-v1', 'Views'],
      \ ['mj', 'WebexMeeting', 'Join meeting', 'any', '', 'Meetings', '[URL]'],
      \ ['ms', 'WebexMeetingStatus', 'Meeting status', 'any', '', 'Meetings'],
      \ ['mu', 'WebexUpcoming', 'Upcoming meetings', 'session', 'upcoming-meetings', 'Meetings'],
      \ ['me', 'WebexMeetingEditor', 'Present in editor', 'meeting', '', 'Meetings'],
      \ ['mk', 'WebexMeetingKitty', 'Present in kitty', 'meeting', '', 'Meetings'],
      \ ['md', 'WebexMeetingDetach', 'Detach meeting view', 'meeting', '', 'Meetings'],
      \ ['ml', 'WebexLeave', 'Leave meeting', 'meeting', '', 'Meetings'],
      \ ['mm', 'WebexMicrophone', 'Microphone', 'meeting', '', 'Meetings'],
      \ ['mc', 'WebexCamera', 'Camera', 'meeting', '', 'Meetings'],
      \ ['mp', 'WebexPreview', 'Local preview', 'meeting', '', 'Meetings'],
      \ ['mh', 'WebexShare', 'Share screen', 'meeting', '', 'Meetings'],
      \ ['ma', 'WebexAudio', 'Received audio', 'meeting', '', 'Meetings'],
      \ ['mP', 'WebexMeetingSources', 'Meeting sources', 'meeting-pane', '', 'Meetings'],
      \ ['mL', 'WebexMeetingLayout', 'Meeting layout', 'meeting-pane', '', 'Meetings'],
      \ ['mR', 'WebexMeetingAuthRefresh', 'Refresh meeting login', 'meeting-ready', '', 'Meetings'],
      \ ['', 'WebexMeetingReconnect', 'Reconnect original controls; no rejoin/replay', 'meeting-recovery', '', 'Recovery'],
      \ ['?', 'WebexActions', 'Actions', 'any', '', 'Workspace'],
      \ ['', 'WebexDemo', 'Open isolated local demo', 'any', '', 'Workspace'],
      \ ['', 'WebexSpaces', 'Return to spaces', 'session', '', 'Workspace'],
      \ ['', 'WebexDestination', 'Draft destination details', 'any', '', 'Workspace'],
      \ ['', 'WebexUnreadStatus', 'Highlighted Spaces row unread provenance; read-only', 'unread-status', '', 'Views'],
      \ ['', 'WebexDrafts', 'Verified recovery drafts', 'draft-index', '', 'Views'],
      \ ['', 'WebexDraftRestore', 'Restore exact selected saved draft; no fetch', 'saved-draft-restore', '', 'Recovery'],
      \ ['', 'WebexDraftExport', 'Export saved draft as inert native text', 'saved-draft-row', '', 'Recovery'],
      \ ['', 'WebexDraftDiscard', 'Discard saved text, not delivery evidence', 'saved-draft-row', '', 'Recovery'],
      \ ['', 'WebexHealth', 'Safe diagnostics', 'any', '', 'Workspace'],
      \ ['', 'WebexMoreSpaces', 'Next bounded spaces page', 'session', '', 'Workspace'],
      \ ['', 'WebexOlder', 'Older bounded history page', 'room', '', 'Messages'],
      \ ['', 'WebexMarkRead', 'Explicit read receipt (fresh display required)', 'read-receipt', '', 'Recovery'],
      \ ['', 'WebexResolveDelivery', 'Resolve unknown send after checking Webex', 'room', '', 'Recovery'],
      \ ['', 'WebexAuthRefresh', 'Explicit messaging-auth refresh', 'session', '', 'Recovery'],
      \ ['', 'WebexCacheClear', 'Clear local spaces cache', 'session', 'spaces-cache', 'Recovery'],
      \ ['', 'WebexMutationResolve', 'Resolve unknown edit/delete after checking', 'mutation', 'message-actions-v1', 'Recovery'],
      \ ['', 'WebexDirectResolve', 'Resolve unknown direct send after checking', 'recipient', 'conversations-v1', 'Recovery'],
      \ ['', 'WebexDirectOpen', 'Open confirmed returned DM', 'recipient', 'conversations-v1', 'Conversations'],
      \ ['', 'WebexConversationResolve', 'Resolve retained unknown conversation action', 'session', 'conversations-v1', 'Recovery'],
      \ ['', 'WebexMembersMore', 'Next bounded participant page', 'room', 'room-members-v1', 'Views'],
      \ ['', 'WebexMemberAction', 'Exact participant row actions (DM/remove)', 'members', 'room-members-v1', 'Views'],
      \ ['', 'WebexTeamsMore', 'Next loaded Team labels', 'session', 'server-teams-v1', 'Views'],
      \ ['', 'WebexTeamFilter', 'Filter loaded spaces by exact Team', 'teams', '', 'Views', '[Team ID]'],
      \ ['', 'WebexSectionCreate', 'Create client-local section', 'session', 'local-sections-v1', 'Views', '[name]'],
      \ ['', 'WebexSectionRename', 'Rename client-local section', 'session', 'local-sections-v1', 'Views', '[name]'],
      \ ['', 'WebexSectionRemove', 'Remove client-local grouping, not rooms', 'session', 'local-sections-v1', 'Views', '[section]'],
      \ ['', 'WebexSectionToggle', 'Collapse/expand local section', 'session', 'local-sections-v1', 'Views', '[section]'],
      \ ['', 'WebexSectionMove', 'Move local section', 'session', 'local-sections-v1', 'Views', 'position 1..32'],
      \ ['', 'WebexSectionAssign', 'Assign room to local section (- unassigns)', 'session', 'local-sections-v1', 'Views', '[section|-]'],
      \ ['', 'WebexSectionsLoad', 'Explicitly load saved local grouping', 'session', 'local-sections-v1', 'Views'],
      \ ['', 'WebexSectionsSave', 'Explicitly save local grouping', 'session', 'local-sections-v1', 'Views'],
      \ ['', 'WebexSectionsClear', 'Explicitly clear local grouping', 'session', 'local-sections-v1', 'Views'],
      \ ['', 'WebexImage', 'Image open using configured mode', 'history', '', 'Files', '[choice]'],
      \ ['', 'WebexImageBuffer', 'Image open in native buffer', 'history', '', 'Files', '[choice]'],
      \ ['', 'WebexImageExternal', 'Explicit image viewer launch', 'history', '', 'Files', '[choice]'],
      \ ['', 'WebexNotificationsTest', 'Explicit local notification test', 'any', '', 'Views'],
      \ ['', 'WebexNotificationsMute', 'Mute local alerts only', 'any', '', 'Views', '[minutes]'],
      \ ['', 'WebexNotificationsResume', 'Resume local alerts; no replay', 'any', '', 'Views'],
      \ ['', 'WebexMeetingDemo', 'Join synthetic meeting demo', 'any', '', 'Meetings']]
let s:help_buffer = 0
function! wbx#commands#key(lhs) abort
  return substitute(substitute(a:lhs, ' ', '<Space>', 'g'), '|', '<Bar>', 'g')
endfunction
function! s:global(lhs) abort
  if exists('*maplist')
    for mapping in maplist()
      if !get(mapping, 'buffer', 0) && mapping.lhs ==# a:lhs && (mapping.mode ==# 'n' || mapping.mode ==# ' ')
        return mapping
      endif
    endfor
    return {}
  endif
  if has('nvim')
    for mapping in nvim_get_keymap('n')
      if mapping.lhs ==# a:lhs | return mapping | endif
    endfor
    return {}
  endif
  let mapping = maparg(a:lhs, 'n', 0, 1)
  return get(mapping, 'buffer', 0) ? {} : mapping
endfunction
function! s:same(left, right) abort
  for key in ['lhs', 'rhs', 'noremap', 'expr', 'silent', 'sid', 'lnum', 'buffer', 'nowait', 'script']
    if get(a:left, key, 0) !=# get(a:right, key, 0) | return 0 | endif
  endfor
  return !empty(a:left)
endfunction
function! wbx#commands#setup() abort
  for window in win_findbuf(s:help_buffer)
    call win_execute(window, 'call wbx#commands#reference_setup()')
  endfor
  " Remappable targets remain available with mappings=false. Respect user plugs.
  for action in s:actions
    if empty(action[0]) || !empty(maparg('<Plug>(' . action[1] . ')', 'n')) | continue | endif
    execute 'nnoremap <silent> <Plug>(' . action[1] . ') :<C-u>call wbx#commands#invoke(' . string(action[1]) . ')<CR>'
  endfor
  " Remove only unchanged mappings this module installed (supports setup twice).
  for mapping in s:installed
    if s:same(s:global(mapping.lhs), mapping.map)
      execute 'silent! nunmap ' . wbx#commands#key(mapping.lhs)
    endif
  endfor
  let s:installed = []
  let s:conflicts = []
  let options = get(g:, 'wbx_tui', {})
  if !get(options, 'mappings', 1) | return | endif
  let prefix = get(options, 'leader_prefix', '<leader>W')
  if type(prefix) != v:t_string || empty(prefix) || prefix =~# '[\s|\r\n]'
    let s:conflicts = ['Invalid leader_prefix; command family disabled']
    return
  endif
  let leader = get(g:, 'mapleader', '\')
  let prefix = substitute(prefix, '<leader>', '\=leader', 'gi')
  for action in s:actions
    if empty(action[0]) | continue | endif
    let lhs = prefix . action[0]
    if !empty(mapcheck(lhs, 'n')) || !empty(maparg(lhs, 'n'))
      call add(s:conflicts, lhs . ' → :' . action[1])
      continue
    endif
    execute 'nnoremap <silent> ' . wbx#commands#key(lhs) . ' :<C-u>call wbx#commands#invoke(' . string(action[1]) . ')<CR>'
    let installed = maparg(lhs, 'n', 0, 1)
    call add(s:installed, {'lhs': installed.lhs, 'command': action[1], 'description': action[2], 'map': installed})
  endfor
endfunction
function! wbx#commands#bindings() abort
  return filter(deepcopy(s:installed), 'maparg(v:val.lhs, "n", 0, 1) ==# v:val.map')
endfunction
function! wbx#commands#local_bindings() abort
  let out = []
  for mapping in get(b:,'wbx_default_maps',[])
    if maparg(mapping[1],mapping[0],0,1) !=# mapping[2] | continue | endif
    let command = matchstr(mapping[2].rhs,'\<Webex\w\+\>')
    if empty(command) | continue | endif
    call add(out,{'command':command,'lhs':mapping[1],'mode':mapping[0]})
  endfor
  return out
endfunction
function! wbx#commands#groups() abort
  " Derive real prefixes from effective owned bindings; never label a leaf
  " (such as Ws, Pick space) or a user-shadowed/disabled family as a group.
  let groups = {}
  for binding in wbx#commands#bindings()
    let row = filter(copy(s:actions), 'v:val[1] ==# binding.command')[0]
    let prefix = strpart(binding.lhs, 0, strlen(binding.lhs) - strlen(row[0]))
    let groups[prefix] = 'Webex'
    if strlen(row[0]) > 1 | let groups[prefix . strpart(row[0], 0, 1)] = row[5] | endif
  endfor
  return map(sort(keys(groups)), '{"lhs": v:val, "name": groups[v:val]}')
endfunction
function! wbx#commands#conflicts() abort
  let conflicts = copy(s:conflicts)
  for binding in s:installed
    let current = maparg(binding.lhs, 'n', 0, 1)
    if !empty(current) && !s:same(current, binding.map)
      call add(conflicts, binding.lhs . ' → :' . binding.command . ' (current user mapping takes precedence)')
    endif
  endfor
  return conflicts
endfunction
function! wbx#commands#send_hint() abort
  " Discovery belongs in help/the action menu, not every draft's chrome.
  return ''
endfunction
function! wbx#commands#attachment_hint() abort
  return ''
endfunction
function! s:context(context, state) abort
  if a:context ==# 'any' | return '' | endif
  if a:context ==# 'unread-status'
    return exists('*wbx#room_unread_context') && !empty(wbx#room_unread_context())
          \ ? '' : 'Choose one unchanged Spaces room row; no open/fetch/receipt'
  endif
  if a:context ==# 'draft-index' | return wbx#draft_persistence#inventory().reason | endif
  if a:context ==# 'saved-draft-restore' | return wbx#saved_drafts#restore_reason() | endif
  if a:context ==# 'saved-draft-row'
    return wbx#saved_drafts#current() ? '' : 'Choose an unchanged verified recovery-index row'
  endif
  if index(['latest', 'cancel-reply', 'read-receipt'], a:context) >= 0
    return exists('*wbx#local_action_reason')
          \ ? wbx#local_action_reason(a:context ==# 'read-receipt' ? 'mark-read' : a:context)
          \ : 'Native session owner unavailable; this reference does not authorize the action'
  endif
  if a:context ==# 'team-description-local'
    return wbx#conversations#is_team_description(bufnr('%')) ? '' : 'Choose a privately owned Team-description edit'
  endif
  if a:context ==# 'space-description-local'
    return wbx#conversations#is_description(bufnr('%')) ? '' : 'Choose an owned description edit; native text is retained'
  endif
  if a:context ==# 'draft-local'
    return wbx#view#owned(bufnr('%'), 'compose') || wbx#conversations#is_direct(bufnr('%')) ? '' : 'Choose a destination-bound composer'
  endif
  if a:context ==# 'meeting'
    return get(wbx#meeting_state(), 'active', 0) ? '' : 'No active meeting owner; join explicitly'
  endif
  if a:context ==# 'meeting-recovery'
    return get(wbx#meeting_state(), 'active', 0) && wbx#meeting_supports('meeting-tmux', 1)
          \ ? '' : 'Original meeting owner/backend unavailable; no rejoin or action replay'
  endif
  if a:context ==# 'meeting-ready' || a:context ==# 'meeting-pane'
    let capability = a:context ==# 'meeting-pane' ? 'meeting-panes-v1' : 'meeting-tmux'
    return wbx#meeting_supports(capability) && (a:context !=# 'meeting-pane' || has_key(wbx#meeting_state(), 'panes'))
          \ ? '' : 'Meeting control/adapter unavailable: missing capability, initializing or disconnected owner'
  endif
  if get(a:state, 'state', '') !=# 'ready' | return 'Messaging disconnected; connect explicitly' | endif
  if a:context ==# 'session' | return '' | endif
  if a:context ==# 'reactions' | return wbx#reactions#reason() | endif
  if a:context ==# 'read-by' | return wbx#read_by#reason() | endif
  if a:context ==# 'space-rename' | return wbx#conversations#rename_reason() | endif
  if a:context ==# 'team-rename' | return wbx#conversations#team_rename_reason() | endif
  if index(['team-description-prepare', 'team-description-submit'], a:context) >= 0
    return wbx#conversations#team_description_reason(a:context ==# 'team-description-submit')
  endif
  if a:context ==# 'space-lock' | return wbx#conversations#lock_reason() | endif
  if a:context ==# 'space-announcement' | return wbx#conversations#announcement_reason() | endif
  if a:context ==# 'space-description-clear' | return wbx#conversations#description_clear_reason() | endif
  if index(['member-visibility', 'member-visibility-bound'], a:context) >= 0
    return wbx#members#visibility_reason(a:context ==# 'member-visibility-bound')
  endif
  if index(['space-description-prepare', 'space-description-submit'], a:context) >= 0
    return wbx#conversations#description_reason(a:context ==# 'space-description-submit')
  endif
  if a:context ==# 'directory'
    return wbx#directory#current() ? '' : 'Choose an unchanged, unexpired directory list in its original session'
  endif
  if a:context ==# 'profile-source'
    return !empty(wbx#profiles#selected()) ? '' : 'Choose a current-session directory/member row, or :WebexProfile exact-person-ID; updated backend required'
  endif
  if a:context ==# 'profile-local'
    return wbx#profiles#bound() ? '' : 'Choose an unchanged textual profile in its original session; no automatic refresh'
  endif
  if a:context ==# 'joined-teams' || a:context ==# 'joined-teams-bound'
    return (a:context ==# 'joined-teams-bound' ? wbx#joined_teams#bound() : wbx#joined_teams#current())
          \ ? '' : 'Choose an unchanged joined-Team list in its original session; paging/choices must be unexpired'
  endif
  if a:context ==# 'message-query-bound'
    return wbx#queries#bound() ? '' : 'Choose an unchanged queried view in its original selected space/session'
  endif
  if a:context ==# 'message-query' || a:context ==# 'query-thread'
        \ || a:context ==# 'thread-reply' && index(['remote-thread', 'mentions', 'query-message'], get(b:, 'wbx_list_kind', '')) >= 0
    return wbx#queries#current() && (a:context ==# 'message-query' || get(b:wbx_query_snapshot, 'kind', '') ==# 'thread')
          \ ? '' : 'Choose an unchanged, unexpired queried view in its original selected space/session'
  endif
  if a:context ==# 'recipient'
    return wbx#conversations#is_direct(bufnr('%')) ? '' : 'Choose the exact recipient-bound draft'
  endif
  if a:context ==# 'teams'
    return get(b:, 'wbx_teams_owned', 0) && &buftype ==# 'nofile' && bufname('%') ==# 'wbx://server-teams'
          \ && get(b:, 'wbx_teams_tick', -1) == b:changedtick ? '' : 'Choose an unchanged Server Team row'
  endif
  if a:context ==# 'edit' || a:context ==# 'rich'
    let context = get(b:, 'wbx_message_context', {})
    if !empty(context) && &buftype ==# 'nofile' && bufname('%') ==# 'wbx://edit/' . context.contextId
      return ''
    elseif a:context ==# 'edit'
      return 'Choose a dedicated own-message edit buffer'
    endif
  endif
  if wbx#conversations#is_direct(bufnr('%'))
    if a:context ==# 'send' | return wbx#conversations#send_reason() | endif
    if a:context ==# 'rich' | return wbx#supports_direct('markdown-v1') || wbx#supports_direct('markdown-single-file-v1') ? '' : 'Recipient Markdown needs explicit mode support' | endif
    if a:context ==# 'draft' | return wbx#supports_direct('single-file-v1') || wbx#supports_direct('markdown-single-file-v1') ? '' : 'Recipient files need explicit mode support' | endif
  endif
  if type(get(a:state, 'room', v:null)) != v:t_dict || !get(a:state, 'ready', 0)
    return 'Choose a ready selected conversation; stale/cache rows cannot authorize actions'
  endif
  if a:context ==# 'room' | return '' | endif
  if a:context ==# 'mutation'
    return wbx#message_actions#can_resolve() ? '' : 'Choose an explicit edit or a retained unknown mutation in its selected room'
  endif
  if index(['history', 'thread-reply'], a:context) >= 0
    if !wbx#view#owned(bufnr('%'), 'history') || wbx#view#edited(bufnr('%'))
          \ || get(b:, 'wbx_history_room', '') !=# a:state.room.id | return 'Choose an unchanged selected-history message' | endif
    return ''
  endif
  if a:context ==# 'members'
    let roster = get(b:, 'wbx_members_snapshot', {})
    return &buftype ==# 'nofile' && bufname('%') ==# 'wbx://members'
          \ && get(b:, 'wbx_members_tick', -1) == b:changedtick && get(roster, 'roomId', '') ==# a:state.room.id
          \ ? '' : 'Choose an unchanged selected-room participant view; fresh role proof is still required'
  endif
  if a:context ==# 'send' && wbx#view#owned(bufnr('%'), 'compose')
        \ && get(b:, 'wbx_format', 'plain') ==# 'markdown' && !empty(wbx#drafts#upload(bufnr('%')))
        \ && (!exists('*wbx#supports_upload') || !wbx#supports_upload('markdown-single-file-v1'))
    return 'Markdown plus one file needs explicit backend combination support; no downgrade or file drop'
  endif
  return wbx#view#owned(bufnr('%'), 'compose') && get(b:, 'wbx_room', '') ==# a:state.room.id
        \ ? '' : 'Choose the destination-bound composer or explicit edit buffer'
endfunction
function! wbx#commands#catalogue() abort
  let out = []
  let state = wbx#state()
  let bindings = wbx#commands#bindings()
  let local_bindings = wbx#commands#local_bindings()
  for row in s:actions
    let reason = s:context(row[3], state)
    if empty(reason) && !empty(row[4]) && !wbx#supports(row[4])
      let reason = 'Missing backend capability: ' . row[4] . '; provider/grant prerequisites are reported by its owner'
    endif
    if !exists(':' . row[1]) | let reason = 'Command unavailable in this plugin version' | endif
    call add(out, {'key': row[0], 'command': row[1], 'description': row[2], 'context': row[3],
          \ 'capability': row[4], 'group': row[5], 'usage': get(row, 6, ''),
          \ 'available': empty(reason), 'reason': reason,
          \ 'bindings': map(filter(copy(bindings), 'v:val.command ==# row[1]'), 'v:val.lhs'),
          \ 'localBindings': map(filter(deepcopy(local_bindings),'v:val.command ==# row[1]'),'{"lhs":v:val.lhs,"mode":v:val.mode}')})
  endfor
  return out
endfunction
function! wbx#commands#invoke(command) abort
  let actions = filter(wbx#commands#catalogue(), 'v:val.command ==# a:command')
  if empty(actions) | echomsg '[wbx-tui] Unsupported action; no command executed.' | return | endif
  let action = actions[0]
  if !action.available | echomsg '[wbx-tui] ' . action.reason | return | endif
  " Argument-taking common actions prompt inside their guarded owner.
  execute action.command
endfunction
function! s:help_owned() abort
  return s:help_buffer > 0 && bufexists(s:help_buffer) && getbufvar(s:help_buffer, '&buftype') ==# 'nofile'
        \ && bufname(s:help_buffer) ==# 'wbx://actions' && getbufvar(s:help_buffer, 'wbx_actions_owned', 0)
endfunction
function! wbx#commands#reference_setup() abort
  if bufnr('%') != s:help_buffer | return | endif
  if exists('b:wbx_actions_map') && maparg('q', 'n', 0, 1) ==# b:wbx_actions_map
    silent! nunmap <buffer> q
  endif
  unlet! b:wbx_actions_map
  if !s:help_owned() || !get(get(g:, 'wbx_tui', {}), 'mappings', 1) || !empty(mapcheck('q', 'n')) | return | endif
  nnoremap <silent> <buffer> q :call wbx#commands#close()<CR>
  let b:wbx_actions_map = maparg('q', 'n', 0, 1)
endfunction
function! wbx#commands#close() abort
  if bufnr('%') != s:help_buffer || !s:help_owned() || get(b:, 'wbx_actions_tick', -1) != b:changedtick
    echomsg '[wbx-tui] Action-reference annotations/promoted buffer retained.' | return
  endif
  let origin = get(w:,'wbx_actions_origin',{})
  if winnr('$') > 1 | close | endif
  let windows = getwininfo(get(origin,'window',0))
  if !empty(windows) && windows[0].bufnr == get(origin,'buffer',-1) | call win_gotoid(origin.window) | endif
endfunction
function! wbx#commands#show(...) abort
  call wbx#commands#reference_setup()
  let mode = a:0 && !empty(a:1) ? tolower(a:1) : 'all'
  let group_modes = s:group_modes
  if index(['all', 'available', 'context'], mode) < 0 && !has_key(group_modes, mode)
    echomsg '[wbx-tui] Actions: all / available / context / workspace / messages / message-actions / files / conversations / views / meetings / recovery.'
    return
  endif
  if bufnr('%') == s:help_buffer && s:help_owned()
    " A source-context snapshot, never action authority. Reopen from that source
    " to refresh availability; filtering here does not execute anything.
    if get(b:, 'wbx_actions_tick', -1) != b:changedtick
      echomsg '[wbx-tui] Action-reference annotations retained.' | return
    endif
    let actions = deepcopy(get(w:,'wbx_actions_catalogue',b:wbx_actions_catalogue))
    let kind = get(w:,'wbx_actions_context',b:wbx_actions_context)
  else
    let actions = wbx#commands#catalogue()
    let kind = empty(get(b:, 'wbx_kind', '')) ? expand('%:t') : b:wbx_kind
  endif
  let all_actions = deepcopy(actions)
  let total = len(actions)
  if mode ==# 'available' || mode ==# 'context'
    call filter(actions, 'v:val.available')
  elseif has_key(group_modes, mode)
    call filter(actions, 'v:val.group ==# group_modes[mode]')
  endif
  let lines = ['Webex actions · context snapshot: ' . kind . ' · ' . mode . ' · ' . len(actions) . '/' . total . ' commands',
        \ 'Send: :WebexSend · Edit: :WebexEditSubmit · Enter/write never send or submit',
        \ 'q returns · / searches · named commands remain usable without mappings/which-key',
        \ ':WebexActions all|available|context|group · reopen from source to refresh this inert snapshot',
        \ 'Discovery performs no provider lookup, mutation, receipt or tool launch.', '']
  let groups = {}
  for action in actions
    if !has_key(groups, action.group) | let groups[action.group] = [] | endif
    let effective = copy(action.bindings) + map(copy(get(action,'localBindings',[])),'v:val.lhs . " [buffer " . v:val.mode . "]"')
    let binding = !empty(effective) ? join(effective, ', ') : empty(action.key) ? '(named only)'
          \ : !get(get(g:, 'wbx_tui', {}), 'mappings', 1) ? '(defaults disabled)' : '(default shadowed/unbound)'
    call add(groups[action.group], '  ' . binding
          \ . '  :' . action.command . (empty(action.usage) ? '' : ' ' . action.usage) . ' — ' . action.description
          \ . (action.available ? '' : ' [Unavailable: ' . action.reason . ']'))
  endfor
  let order = ['Workspace', 'Messages', 'Message actions', 'Files', 'Conversations', 'Views', 'Meetings', 'Recovery']
  if mode ==# 'context'
    let first = kind ==# 'compose' ? ['Messages', 'Files'] : kind ==# 'history' ? ['Messages', 'Message actions', 'Views']
          \ : kind ==# 'meeting' ? ['Meetings', 'Recovery'] : ['Workspace', 'Conversations', 'Views']
    let order = first + filter(order, 'index(first, v:val) < 0')
  endif
  for group in order
    if has_key(groups, group) | call extend(lines, [group] + groups[group] + ['']) | endif
  endfor
  if empty(actions) | call add(lines, '[No commands in this index; :WebexActions all keeps the complete catalogue.]') | endif
  call extend(lines, map(wbx#commands#conflicts(), '"Preserved mapping conflict: " . v:val'))
  if s:help_buffer > 0 && bufexists(s:help_buffer) && (!s:help_owned()
        \ || getbufvar(s:help_buffer, 'wbx_actions_tick', -1) != getbufvar(s:help_buffer, 'changedtick'))
    echomsg '[wbx-tui] Action-reference annotations/promoted buffer retained. Close/wipe it explicitly before regenerating; :help wbx-tui-commands lists commands.'
    return
  endif
  let origin = bufnr('%') != s:help_buffer ? {'window': win_getid(), 'buffer': bufnr('%')} : {}
  let window = wbx#view#local_window(s:help_buffer)
  if !s:help_owned()
    if bufnr('wbx://actions') > 0 | echomsg '[wbx-tui] Existing user action buffer retained.' | return | endif
    botright new wbx://actions
    let s:help_buffer = bufnr('%')
    setlocal buftype=nofile bufhidden=hide noswapfile
    let b:wbx_actions_owned = 1
  elseif !window
    execute 'botright sbuffer ' . s:help_buffer
  else
    call win_gotoid(window)
  endif
  if !empty(origin) | let w:wbx_actions_origin = origin | endif
  call wbx#commands#reference_setup()
  setlocal modifiable
  call setline(1, lines)
  if line('$') > len(lines) | call deletebufline(s:help_buffer, len(lines) + 1, '$') | endif
  let b:wbx_actions_tick = b:changedtick
  let b:wbx_actions_catalogue = all_actions
  let b:wbx_actions_context = kind
  let w:wbx_actions_catalogue = deepcopy(all_actions)
  let w:wbx_actions_context = kind
  setlocal nomodifiable nomodified filetype=wbx-actions
endfunction
augroup wbx_action_reference_maps
  autocmd!
  autocmd BufEnter,BufFilePost * if exists('b:wbx_actions_owned') | call wbx#commands#reference_setup() | endif
  autocmd OptionSet buftype if exists('b:wbx_actions_owned') | call wbx#commands#reference_setup() | endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
