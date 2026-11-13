" Explicit exact-person text only; no automatic enrichment, presence or avatars.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:pending = {}
let s:serial = 0
function! s:session() abort
  let state = wbx#state()
  let local = get(state, 'localContext', {})
  return get(state, 'state', '') ==# 'ready' && wbx#supports('people-profile-v1') && wbx#supports('local-context-v1')
        \ && wbx#protocol#local_context(local) ? local.sessionId : ''
endfunction
function! wbx#profiles#bound() abort
  return wbx#lists#clean(bufnr('%'), 'profile') && wbx#protocol#person_profile(get(b:, 'wbx_profile_snapshot', {}))
        \ && b:wbx_profile_snapshot.sessionId ==# s:session()
endfunction
function! wbx#profiles#selected() abort
  let session = s:session()
  if empty(session) | return '' | endif
  if wbx#profiles#bound() | return b:wbx_profile_snapshot.personId | endif
  let kind = get(b:, 'wbx_list_kind', '')
  if kind ==# 'directory'
    return get(wbx#directory#selected(), 'personId', '')
  elseif kind ==# 'members' && get(b:, 'wbx_members_session', '') ==# session
    return get(wbx#members#selected(), 'personId', '')
  endif
  return ''
endfunction
function! s:received(origin, response) abort
  if get(s:pending, 'serial', 0) == a:origin.serial | let s:pending = {} | endif
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#person_profile(value) || value.personId !=# a:origin.person || value.sessionId !=# a:origin.session
    call wbx#_protocol_error() | return
  endif
  if !wbx#view#intent_valid(a:origin.intent) || a:origin.serial != s:serial || s:session() !=# a:origin.session
        \ || a:origin.selected && wbx#profiles#selected() !=# a:origin.person | return | endif
  let age = localtime() * 1000 - value.observedAt
  if age < -999 || age >= 120000
    echomsg '[wbx-tui] Text profile response is stale/future-dated. Refresh explicitly; no result was installed.' | return
  endif
  let fields = value.fields
  let lines = ['TEXT profile · ' . value.personId,
        \ 'Observed ' . strftime('%H:%M:%S %Z', value.observedAt / 1000) . ' · '
        \ . (value.partial ? 'PARTIAL / normalized or not provided' : 'Documented text subset only; not a full profile'),
        \ 'r explicitly refreshes SAME ID · q returns · / searches · Enter never sends/opens',
        \ 'Presence/custom status excluded; avatars not fetched; no profile/status/DND writes.', '']
  for [key, label] in [['displayName', 'Display name'], ['firstName', 'First name'], ['lastName', 'Last name'],
        \ ['department', 'Department'], ['title', 'Title'], ['timezone', 'Time zone']]
    call add(lines, label . ': ' . get(fields, key, '[Not provided by API]'))
  endfor
  let buffer = wbx#lists#show('profile', lines)
  if buffer <= 0 || bufnr('%') != buffer || !wbx#lists#clean(buffer, 'profile') || s:session() !=# value.sessionId | return | endif
  let b:wbx_profile_snapshot = deepcopy(value)
endfunction
function! wbx#profiles#show(person) abort
  let session = s:session()
  if empty(session)
    echomsg '[wbx-tui] Text profiles need a connected people-profile-v1 backend. No connection, identity probe or read started.' | return
  endif
  if !wbx#lists#admit('profile') | return | endif
  let selected = empty(a:person)
  let person = selected ? wbx#profiles#selected() : a:person
  if !wbx#protocol#person_id(person)
    echomsg '[wbx-tui] Choose an unchanged current-session directory/member row, or :WebexProfile exact-person-ID. Names/emails/URLs are not identities.' | return
  endif
  if !empty(s:pending) && s:pending.session !=# session | let s:pending = {} | let s:serial += 1 | endif
  if !empty(s:pending) | echomsg '[wbx-tui] A textual profile read is pending. Nothing queued or automatically retried.' | return | endif
  let s:serial += 1
  let origin = {'serial': s:serial, 'session': session, 'person': person, 'selected': selected, 'intent': wbx#view#intent()}
  let s:pending = origin
  if wbx#rpc('people.profile', {'personId': person}, function('s:received', [origin])) < 0
        \ && get(s:pending, 'serial', 0) == origin.serial | let s:pending = {} | endif
endfunction
function! wbx#profiles#refresh() abort
  if !wbx#profiles#bound()
    echomsg '[wbx-tui] Refresh only an unchanged textual profile in its original session. An expired snapshot never reconnects or changes accounts.' | return
  endif
  " An explicit fresh GET is allowed after the old data ages; never reuse it as authority.
  call wbx#profiles#show(b:wbx_profile_snapshot.personId)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
