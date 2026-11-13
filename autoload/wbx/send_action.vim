" One composer consent-to-dispatch action. Drafts own pending/uncertainty, not this adapter.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#send_action#new(ports) abort
  return {'ports':a:ports}
endfunction
function! wbx#send_action#send(owner) abort
  if wbx#conversations#is_direct(bufnr('%')) | call wbx#conversations#send() | return | endif
  if !wbx#view#owned(bufnr('%'), 'compose') || get(b:, 'wbx_room', '_none') ==# '_none'
    call call(a:owner.ports.Notify, ['Send only from a destination-bound Webex composer.'])
    return
  endif
  if !wbx#productivity#draft_valid(bufnr('%'), call(a:owner.ports.State, [])) | return | endif
  if !wbx#draft_persistence#valid(bufnr('%')) | return | endif
  if wbx#drafts#is_sent(bufnr('%'))
    call call(a:owner.ports.Notify, ['This unchanged copy was already sent but could not be cleared. Edit it before deliberately sending a new message.']) | return
  endif
  if !get(call(a:owner.ports.Destination, []), 'ready', 0)
    call call(a:owner.ports.Notify, ['Destination is not selected/ready. Text retained; connect/select explicitly before sending.']) | return
  endif
  let draft_id = wbx#drafts#draft_id(bufnr('%'))
  let origin = wbx#view#intent()
  if !wbx#drafts#length(bufnr('%')).valid
    call call(a:owner.ports.Notify, ['Draft exceeds 1000 UTF-16 units / 4000 UTF-8 bytes. Native text retained; nothing was sent.']) | return
  endif
  let text = join(getline(1, '$'), "\n")
  let staged = wbx#drafts#upload(bufnr('%'))
  let rich = get(b:, 'wbx_format', 'plain') ==# 'markdown'
  if rich && (!call(a:owner.ports.Supports, ['markdown-send-v1']) || !empty(staged) && !call(a:owner.ports.SupportsUpload, ['markdown-single-file-v1']))
    call call(a:owner.ports.Notify, ['Markdown plus one file needs explicit backend combination support. No file was dropped, format downgraded or send performed.']) | return
  endif
  if empty(substitute(text, '\_s', '', 'g')) && (rich || empty(staged))
    call call(a:owner.ports.Notify, ['Compose a message first.'])
    return
  endif
  if wbx#drafts#uncertain(b:wbx_room)
    call call(a:owner.ports.Notify, ['Delivery unresolved. Check Webex/history, then :WebexResolveDelivery before explicitly retrying.'])
    return
  endif
  if wbx#drafts#pending()
    call call(a:owner.ports.Notify, ['Wait for the pending delivery; nothing was retried.'])
    return
  endif
  let parent = get(b:, 'wbx_parent', '')
  if !empty(parent) && index(call(a:owner.ports.Capabilities, []), 'message-replies') < 0
    call call(a:owner.ports.Notify, ['Reply sending needs an updated connected backend. No message was sent.'])
    return
  endif
  let params = {'roomId': b:wbx_room, 'text': text}
  if rich
    let consent = call(a:owner.ports.Consent, [text])
    if has_key(consent, 'cancelled') | return | endif
    let params.format = 'markdown'
    let params.draftId = draft_id
    call extend(params, consent)
  endif
  if !empty(staged)
    if get(staged, 'stale', 0) || !call(a:owner.ports.Supports, ['uploads-v1'])
      call call(a:owner.ports.Notify, ['Staged file is stale/unavailable. Reselect explicitly; nothing was sent.']) | return
    endif
    let params.attachmentId = staged.attachmentId
    let params.draftId = draft_id
  endif
  if !empty(parent)
    let params.parentId = parent
  endif
  if !wbx#view#intent_valid(origin) || wbx#drafts#upload(bufnr('%')) !=# staged
        \ || wbx#drafts#draft_id(bufnr('%')) !=# draft_id || join(getline(1, '$'), "\n") !=# text
        \ || wbx#drafts#pending() || wbx#drafts#uncertain(params.roomId)
    call call(a:owner.ports.Notify, ['Draft/target changed during consent. Nothing was sent or queued; submit again deliberately.']) | return
  endif
  if !wbx#productivity#draft_valid(bufnr('%'), call(a:owner.ports.State, [])) | return | endif
  let request = 'editor-' . call(a:owner.ports.NextId, [])
  let params.requestId = request
  call wbx#drafts#register(request, params, bufnr('%'), b:changedtick)
  let wire = copy(params)
  if rich && empty(staged) | call remove(wire, 'format') | endif
  let id = call(a:owner.ports.Request, [!empty(staged) ? 'uploads.send' : rich ? 'messages.sendRich' : 'messages.send', wire, function('s:response', [a:owner, request])])
  if id < 0 | call wbx#drafts#failed(request, 0) | endif
  call call(a:owner.ports.Render, [])
endfunction
function! s:response(owner, request, message) abort
  if has_key(a:message, 'error') && wbx#drafts#failed(a:request, get(a:message.error, 'code', 0) == -32004)
    call call(a:owner.ports.Render, [])
  endif
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
