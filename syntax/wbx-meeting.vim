if exists('b:current_syntax')
  finish
endif

" This is a plain status view, not a Markdown document or editable controls.
syntax match WbxTitle /^# Webex meeting · .*/ contains=WbxWarning
syntax match WbxMeetingLabel /^\%(Presentation\|Session\|Controls\|Sources\|Call\|microphone\|video\|screen\|camera\|audio\):/
syntax match WbxMuted /^Closing a view or editor does not imply the meeting ended\.$/
syntax match WbxWarning /STATUS UNKNOWN (backend disconnected)/ contained
syntax match WbxWarning /^Controls: unavailable.*/ contains=WbxMeetingLabel
syntax match WbxWarning /^Last reported .*/ contains=WbxMeetingLabel
syntax match WbxMeetingLabel /\%(Last reported \)\@<=\%(Sources\|Call\|microphone\|video\|screen\|camera\|audio\):/ contained
syntax match WbxMeetingCommand /^:WebexLeave\>/

highlight default link WbxTitle Title
highlight default link WbxMeetingLabel Identifier
highlight default link WbxMeetingCommand Special
highlight default link WbxMuted Comment
highlight default link WbxWarning WarningMsg

let b:current_syntax = 'wbx-meeting'
