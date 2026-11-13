if exists('g:loaded_wbx_tui')
  finish
endif
let g:loaded_wbx_tui = 1
let s:save_cpo = &cpoptions
set cpoptions&vim

command! -bar Webex call wbx#open()
command! -bar WebexDemo call wbx#open(1)
command! -bar WebexDisconnect call wbx#disconnect()
command! -bar WebexCompose call wbx#compose()
command! -bar WebexReply call wbx#reply()
command! -bar WebexCancelReply call wbx#cancel_reply()
command! -bar WebexBookmark call wbx#productivity#bookmark()
command! -bar WebexBookmarks call wbx#productivity#bookmarks()
command! -bar WebexQuote call wbx#productivity#quote()
command! -bar WebexQuoteInsert call wbx#productivity#insert()
command! -bar WebexQuoteDetach call wbx#productivity#detach()
command! -bar WebexThread call wbx#productivity#thread()
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexContent call wbx#productivity#content(<q-args>)
command! -bar WebexCards call wbx#productivity#content('cards')
command! -bar WebexJoinedTeams call wbx#joined_teams#show(0)
command! -bar WebexJoinedTeamsRefresh call wbx#joined_teams#show(2)
command! -bar WebexJoinedTeamsMore call wbx#joined_teams#show(1)
command! -bar WebexJoinedTeamFilter call wbx#joined_teams#filter()
command! -bar -nargs=? WebexDirectory call wbx#directory#show(<q-args>, 0)
command! -bar WebexDirectoryRefresh call wbx#directory#show('', 2)
command! -bar WebexDirectoryMore call wbx#directory#show('', 1)
command! -bar WebexDirectoryDirect call wbx#directory#direct()
command! -bar -nargs=? WebexProfile call wbx#profiles#show(<q-args>)
command! -bar WebexProfileRefresh call wbx#profiles#refresh()
command! -bar WebexThreadFetch call wbx#queries#thread()
command! -bar WebexMentions call wbx#queries#mentions()
command! -bar WebexQueryRefresh call wbx#queries#page(0)
command! -bar WebexQueryMore call wbx#queries#page(1)
command! -bar WebexQueryMessage call wbx#queries#message()
command! -bar WebexQueryJump call wbx#queries#jump()
command! -bar WebexQueryReply call wbx#queries#reply()
command! -bar WebexThreadReply call wbx#reply()
command! -bar WebexSpaces call wbx#rooms()
command! -bar WebexMarkRead call wbx#mark_read()
command! -bar WebexUnreadStatus call wbx#unread#show()
command! -bar WebexDestination call wbx#show_destination()
command! -bar WebexDrafts call wbx#saved_drafts#show()
command! -bar WebexDraftRestore call wbx#saved_drafts#restore()
command! -bar WebexDraftExport call wbx#saved_drafts#export()
command! -bar WebexDraftDiscard call wbx#saved_drafts#discard()
command! -bar WebexPeople call wbx#people#show()
command! -bar WebexPeopleRefresh call wbx#people#refresh()
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexFilter call wbx#sections#filter(<q-args>)
command! -bar WebexSections call wbx#sections#menu()
command! -bar -nargs=? WebexSectionCreate call wbx#sections#action('create', <q-args>)
command! -bar -nargs=? WebexSectionRename call wbx#sections#action('rename', <q-args>)
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexSectionRemove call wbx#sections#action('remove', <q-args>)
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexSectionToggle call wbx#sections#action('toggle', <q-args>)
command! -bar -nargs=1 -complete=customlist,wbx#commands#complete WebexSectionMove call wbx#sections#action('move', <q-args>)
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexSectionAssign call wbx#sections#action('assign', <q-args>)
command! -bar WebexSectionsLoad call wbx#sections#action('load', '')
command! -bar WebexSectionsSave call wbx#sections#action('save', '')
command! -bar WebexSectionsClear call wbx#sections#action('clear', '')
command! -bar -nargs=? -complete=file WebexAttach call wbx#uploads#stage(<q-args>)
command! -bar WebexAttachRemove call wbx#uploads#remove()
command! -bar WebexUploadCancel call wbx#uploads#cancel()
command! -bar WebexAttachmentStatus call wbx#uploads#status()
command! -bar WebexEdit call wbx#message_actions#prepare('edit')
command! -bar WebexEditSubmit call wbx#message_actions#submit()
command! -bar WebexEditCancel call wbx#message_actions#cancel()
command! -bar WebexDelete call wbx#message_actions#prepare('delete')
command! -bar WebexMutationResolve call wbx#message_actions#resolve()
command! -bar WebexReactions call wbx#reactions#show()
command! -bar WebexReadBy call wbx#read_by#show()
command! -bar WebexReadByToggle call wbx#read_by#toggle()
command! -bar WebexReactionAdd call wbx#reactions#choose('add')
command! -bar WebexReactionRemove call wbx#reactions#choose('remove')
command! -bar WebexReactionResolve call wbx#reactions#resolve()
command! -bar WebexReactionUnresolved call wbx#reactions#unresolved()
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexFormat call wbx#rich#format(<q-args>)
command! -bar WebexMention call wbx#rich#mention(0)
command! -bar WebexMentionAll call wbx#rich#mention(1)
command! -bar WebexMembers call wbx#members#show(0)
command! -bar WebexMembersMore call wbx#members#show(1)
command! -bar WebexDirectVisibility call wbx#members#visibility()
command! -bar WebexDirectVisibilityRefresh call wbx#members#visibility_refresh()
command! -bar WebexMemberAction call wbx#members#action()
command! -bar -nargs=? WebexDirect call wbx#conversations#direct(<q-args>)
command! -bar WebexDirectOpen call wbx#conversations#open_direct()
command! -bar WebexConversationOpen call wbx#conversations#open()
command! -bar WebexDirectResolve call wbx#conversations#resolve_direct()
command! -bar WebexDirectCancel call wbx#conversations#cancel_direct()
command! -bar -nargs=? WebexCreateSpace call wbx#conversations#action('create', <q-args>)
command! -nargs=? WebexRenameSpace call wbx#conversations#action('rename', <q-args>)
command! -nargs=? WebexRenameTeam call wbx#conversations#team_rename(<q-args>)
command! -bar WebexDescribeTeam call wbx#conversations#team_description()
command! -bar WebexTeamDescriptionSubmit call wbx#conversations#team_description_submit()
command! -bar WebexTeamDescriptionCancel call wbx#conversations#team_description_cancel()
command! -bar WebexDescribeSpace call wbx#conversations#description()
command! -bar WebexDescriptionSubmit call wbx#conversations#description_submit()
command! -bar WebexDescriptionCancel call wbx#conversations#description_cancel()
command! -bar WebexDescriptionClear call wbx#conversations#description_clear()
command! -bar WebexLockSpace call wbx#conversations#lock(v:true)
command! -bar WebexUnlockSpace call wbx#conversations#lock(v:false)
command! -bar WebexAnnouncementOn call wbx#conversations#announcement(v:true)
command! -bar WebexAnnouncementOff call wbx#conversations#announcement(v:false)
command! -bar -nargs=? WebexInvite call wbx#conversations#action('invite', <q-args>)
command! -bar WebexRemoveMember call wbx#conversations#action('remove', '')
command! -bar WebexLeaveSpace call wbx#conversations#action('leave', '')
command! -bar WebexConversationResolve call wbx#conversations#resolve()
command! -bar WebexTeams call wbx#teams#show(0)
command! -bar WebexTeamsMore call wbx#teams#show(1)
command! -bar -nargs=? WebexTeamFilter call wbx#teams#filter(<q-args>)
command! -bar WebexSend call wbx#send()
command! -bang -bar WebexRefresh call wbx#refresh(<bang>0)
command! -bar WebexMoreSpaces call wbx#page('rooms')
command! -bar WebexOlder call wbx#page('history')
command! -bar WebexLatest call wbx#latest()
command! -bar WebexUpcoming call wbx#upcoming()
command! -bar WebexCacheClear call wbx#cache_clear()
command! -bar WebexLayoutReset call wbx#layout_reset()
command! -bar WebexThreadFold call wbx#history#thread_fold()
command! -bar -nargs=? WebexImage call wbx#image_open('', <q-args>)
command! -bar -nargs=? WebexImageBuffer call wbx#image_open('buffer', <q-args>)
command! -bar -nargs=? WebexImageExternal call wbx#image_open('external', <q-args>)
command! -bar -nargs=? WebexAttachment call wbx#attachment_open('open', <q-args>)
command! -bar -nargs=? WebexAttachmentDownload call wbx#attachment_open('download', <q-args>)
command! -bar -nargs=? -complete=customlist,wbx#commands#complete WebexActions call wbx#commands#show(<q-args>)
command! -bar WebexResolveDelivery call wbx#resolve_delivery()
command! -bar WebexAuthRefresh call wbx#rpc('auth.refresh', {})
command! -bar WebexPickSpace call wbx#pick()
command! -bar WebexMeetingEditor call wbx#present('editor')
command! -bar WebexMeetingKitty call wbx#present('kitty')
command! -bar WebexMeetingDemo call wbx#meeting('', 1)
command! -bar WebexMeetingStatus call wbx#meeting_status()
command! -bar WebexMeetingSources call wbx#meeting#choose('sources')
command! -bar WebexMeetingLayout call wbx#meeting#choose('layout')
command! -bar WebexMeetingAuthRefresh call wbx#meeting#auth()
command! -bar WebexMeetingReconnect call wbx#meeting#reconnect()
command! -bar WebexMeetingDetach call wbx#detach()
command! -bar WebexLeave call wbx#rpc('meeting.leave', {})
command! -bar WebexMicrophone call wbx#control('microphone.toggle')
command! -bar WebexCamera call wbx#control('video.toggle')
command! -bar WebexPreview call wbx#control('camera.toggle')
command! -bar WebexShare call wbx#control('screen.toggle')
command! -bar WebexAudio call wbx#control('audio.toggle')
command! -bar WebexHealth call wbx#health()
command! -bar WebexNotificationsTest call wbx#notifications#test()
command! -bar WebexNotifications call wbx#notifications#menu()
command! -bar -nargs=? WebexNotificationsMute call wbx#notifications#mute(<q-args>)
command! -bar WebexNotificationsResume call wbx#notifications#resume()
command! -nargs=? WebexMeeting call wbx#meeting(<q-args>)

nnoremap <silent> <Plug>(WebexOpen) :Webex<CR>
nnoremap <silent> <Plug>(WebexSend) :WebexSend<CR>
inoremap <silent> <Plug>(WebexSend) <C-o>:WebexSend<CR>
nnoremap <silent> <Plug>(WebexCompose) :WebexCompose<CR>
nnoremap <silent> <Plug>(WebexComposeInsert) :call wbx#compose(1)<CR>
nnoremap <silent> <Plug>(WebexReply) :WebexReply<CR>
nnoremap <silent> <Plug>(WebexCancelReply) :WebexCancelReply<CR>
nnoremap <silent> <Plug>(WebexSelectSpace) :call wbx#select_current()<CR>
nnoremap <silent> <Plug>(WebexSpaces) :WebexSpaces<CR>
nnoremap <silent> <Plug>(WebexMarkRead) :WebexMarkRead<CR>
nnoremap <silent> <Plug>(WebexRefresh) :WebexRefresh<CR>
nnoremap <silent> <Plug>(WebexThreadFold) :WebexThreadFold<CR>
nnoremap <silent> <Plug>(WebexLatest) :WebexLatest<CR>
nnoremap <silent> <Plug>(WebexImage) :WebexImage<CR>
nnoremap <silent> <Plug>(WebexAttachment) :WebexAttachment<CR>
nnoremap <silent> <Plug>(WebexAttachmentDownload) :WebexAttachmentDownload<CR>
call wbx#commands#setup()

highlight default link WbxTitle Title
highlight default link WbxMuted Comment
highlight default link WbxSelected Directory
highlight default link WbxWarning WarningMsg
highlight default link WbxReplyContext Comment
highlight default link WbxMessageBorder Comment

augroup wbx_tui_lifecycle
  autocmd!
  autocmd VimLeavePre * call wbx#shutdown()
  if exists('##FocusGained')
    autocmd FocusGained * call wbx#notifications#focus(1)
    autocmd FocusLost * call wbx#notifications#focus(0)
  endif
  autocmd BufEnter,BufWinEnter * if exists('b:wbx_kind') | call wbx#_setup_buffer() | elseif exists('w:wbx_saved_statusline') || exists('w:wbx_geometry') || &l:statusline ==# '%!wbx#statusline()' | call wbx#_window_enter() | endif
  autocmd WinNew * if exists('b:wbx_kind') || exists('w:wbx_saved_statusline') || &l:statusline ==# '%!wbx#statusline()' | call wbx#_window_enter() | endif
  autocmd BufWinLeave * if exists('w:wbx_saved_statusline') | call wbx#_window_leave() | endif
  autocmd BufUnload * if exists('b:wbx_kind') | call wbx#view#unload(str2nr(expand('<abuf>'))) | endif
  autocmd BufWipeout * call wbx#drafts#forget(str2nr(expand('<abuf>')))
  autocmd CursorMoved * if exists('b:wbx_kind') | call wbx#_navigation() | endif
  autocmd TextChanged,TextChangedI * if get(b:, 'wbx_kind', '') ==# 'compose' | call wbx#_draft_setup() | call wbx#redraw_status() | endif
  autocmd BufEnter,TextChanged,TextChangedI * if exists('b:wbx_message_context') | call wbx#message_actions#setup() | endif
  if exists('##WinScrolled')
    autocmd WinScrolled * call wbx#_scrolled(expand('<amatch>'))
  endif
  if exists('##WinResized')
    autocmd WinResized * call wbx#layout#observe()
  endif
  autocmd VimResized * call wbx#layout#resized()
  autocmd BufLeave,WinLeave * if exists('*wbx#_cancel_selection_focus') | call wbx#_cancel_selection_focus() | endif
  autocmd BufFilePre * if exists('b:wbx_kind') | call wbx#_rename_pre() | endif
  autocmd BufFilePost * if exists('b:wbx_kind') | call wbx#_rename_post() | endif
  autocmd OptionSet buftype if exists('b:wbx_kind') | call wbx#_setup_buffer() | endif
  autocmd BufWipeout * if getbufvar(str2nr(expand('<abuf>')), 'wbx_meeting_terminal', 0) && wbx#transport#closed_buffer(str2nr(expand('<abuf>'))) | call wbx#_meeting_view_closed() | endif
augroup END
let &cpoptions = s:save_cpo
unlet s:save_cpo
