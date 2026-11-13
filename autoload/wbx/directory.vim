" Explicit prefix lookup; no per-key request, auto refresh, presence or mutation.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:pending = 0
let s:serial = 0
let s:pending_session = ''
function! s:session() abort
  let state = wbx#state()
  let context = get(state, 'localContext', {})
  return wbx#supports('directory-search-v1') && wbx#supports('local-context-v1')
        \ && get(state, 'state', '') ==# 'ready' && wbx#protocol#local_context(context) ? context.sessionId : ''
endfunction
function! wbx#directory#current() abort
  let value = get(b:, 'wbx_directory_snapshot', {})
  let age = localtime() * 1000 - get(value, 'observedAt', 0)
  return wbx#lists#clean(bufnr('%'), 'directory') && wbx#protocol#directory(value)
        \ && value.sessionId ==# s:session() && age >= -999 && age < 120000
endfunction
function! s:input() abort
  return input('Directory name PREFIX (2–120 characters; no presence/scan): ')
endfunction
function! s:received(origin, response) abort
  if s:pending == a:origin.serial | let s:pending = 0 | endif
  if has_key(a:response, 'error') | return | endif
  let value = get(a:response, 'result', {})
  if !wbx#protocol#directory(value) || value.query !=# a:origin.query || value.sessionId !=# a:origin.session
    call wbx#_protocol_error() | return
  endif
  if !wbx#view#intent_valid(a:origin.intent) || a:origin.session !=# s:session()
        \ || a:origin.serial != s:serial || !wbx#lists#admit('directory') | return | endif
  let lines = ['Directory NAME PREFIX · ' . value.query . ' · no presence or membership inference',
        \ (value.partial ? 'PARTIAL query results' : 'API query exhausted at observation; not an organization census')
        \ . ' · ' . len(value.items) . '/250 loaded · expires after two minutes',
        \ 'Enter prepares exact-person DM, NEVER sends · r refresh · ]p next explicit page · q return · / loaded search', '']
  call extend(lines, map(copy(value.items), 'v:val.label . " [" . v:val.personId . "]"'))
  let rows = repeat([''], 4) + map(copy(value.items), 'v:val.personId')
  if empty(value.items)
    call add(lines, '[No matching visible people; not proof of absence outside this policy-limited query]') | call add(rows, '')
  endif
  let buffer = wbx#lists#show('directory', lines, rows)
  if buffer <= 0 || bufnr('%') != buffer || !wbx#lists#clean(buffer, 'directory') || s:session() !=# value.sessionId | return | endif
  let b:wbx_directory_snapshot = deepcopy(value)
endfunction
function! wbx#directory#show(query, mode) abort
  let session = s:session()
  if empty(session) | echomsg '[wbx-tui] Directory needs a connected directory-search-v1 backend; no connection or lookup started.' | return | endif
  if !wbx#lists#admit('directory') | return | endif
  if s:pending && s:pending_session !=# session | let s:pending = 0 | let s:serial += 1 | endif
  if s:pending
    echomsg '[wbx-tui] A directory read is pending. Nothing queued; cancellation/expiry never starts another automatically.' | return
  endif
  let query = a:query
  let params = {}
  if a:mode
    if !wbx#directory#current() || a:mode == 1 && !b:wbx_directory_snapshot.more
      echomsg '[wbx-tui] No valid next/current directory page. Start a fresh explicit query.' | return
    endif
    let query = b:wbx_directory_snapshot.query
    if a:mode == 1 | let params = {'more': v:true, 'revision': b:wbx_directory_snapshot.revision} | endif
  endif
  let intent = wbx#view#intent()
  if empty(query) | let query = s:input() | endif
  if !wbx#view#intent_valid(intent) || session !=# s:session() || empty(query) | return | endif
  if !wbx#protocol#directory_query(query)
    echomsg '[wbx-tui] Use a literal 2–120 character name prefix, no controls/wildcards/outer whitespace. Nothing queried.' | return
  endif
  let params.query = query
  let s:serial += 1
  let s:pending = s:serial
  let s:pending_session = session
  let origin = {'session': session, 'query': query, 'intent': intent, 'serial': s:serial}
  if wbx#rpc('people.search', params, function('s:received', [origin])) < 0 && s:pending == origin.serial | let s:pending = 0 | endif
endfunction
function! wbx#directory#selected() abort
  if line('.') < 5 || !wbx#directory#current() | return {} | endif
  let id = wbx#lists#selected_id()
  return empty(id) ? {} : deepcopy(get(filter(copy(b:wbx_directory_snapshot.items), 'v:val.personId ==# id'), 0, {}))
endfunction
function! wbx#directory#direct() abort
  let person = wbx#directory#selected()
  if empty(person) | echomsg '[wbx-tui] Choose an exact, unchanged, unexpired directory person row.' | return | endif
  " The existing recipient owner performs fresh identity/grant preparation.
  call wbx#conversations#direct(person.personId)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
