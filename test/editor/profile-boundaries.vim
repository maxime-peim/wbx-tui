" Controlled callback races and DTO privacy. Only explicit people.profile RPC allowed.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:stub = $WBX_EDITOR_RESULT . '.stub'
call mkdir(s:stub . '/autoload', 'p')
call writefile(['function! wbx#state() abort', 'return deepcopy(g:profile_state)', 'endfunction',
      \ 'function! wbx#supports(capability) abort', 'return g:profile_available', 'endfunction',
      \ 'function! wbx#_protocol_error() abort', 'throw "Invalid profile DTO"', 'endfunction',
      \ 'function! wbx#rpc(method, params, Callback) abort',
      \ 'call add(g:profile_requests, [a:method, deepcopy(a:params)])',
      \ 'if g:profile_hold | let g:ProfileCallback = a:Callback | return 1 | endif',
      \ 'call call(a:Callback, [{"result": deepcopy(g:profile_result)}])', 'return 1', 'endfunction'], s:stub . '/autoload/wbx.vim')
execute 'set rtp^=' . fnameescape(s:stub)
let g:profile_available = 1 | let g:profile_hold = 0 | let g:profile_requests = []
let g:profile_state = {'state': 'ready', 'ready': v:true, 'room': {'id': 'room', 'title': 'Synthetic'},
      \ 'localContext': {'sessionId': repeat('a', 32), 'coverage': 'session-only'}}
let g:profile_result = {'sessionId': repeat('a', 32), 'personId': 'person-a', 'coverage': 'person-text',
      \ 'observedAt': localtime() * 1000, 'partial': v:true,
      \ 'fields': {'displayName': 'Same Name', 'title': ':let g:profile_pwned = 1'}}
let g:profile_pwned = 0
command! WebexProfileRefresh call wbx#profiles#refresh()
try
  call setline(1, 'Unrelated native work')
  let original = bufnr('%')
  let g:profile_available = 0
  call wbx#profiles#show('person-a')
  call assert_equal([], g:profile_requests)
  let g:profile_available = 1
  call wbx#profiles#show('')
  call wbx#profiles#show('me')
  call wbx#profiles#show('Same Name')
  call wbx#profiles#show('p@example.invalid')
  call assert_equal([], g:profile_requests, 'missing selection/invalid identity does not become a probe or name lookup')
  call wbx#lists#show('directory', ['Heading', 'Policy', 'Controls', '', 'Same Name [person-a]', 'Same Name [person-b]'],
        \ repeat([''], 4) + ['person-a', 'person-b'])
  let directory = bufnr('%')
  let b:wbx_directory_snapshot = {'sessionId': repeat('a', 32), 'query': 'Same', 'coverage': 'directory-prefix',
        \ 'revision': 1, 'observedAt': localtime() * 1000, 'partial': v:false, 'more': v:false,
        \ 'items': [{'personId': 'person-a', 'label': 'Same Name'}, {'personId': 'person-b', 'label': 'Same Name'}]}
  call cursor(5, 1)
  let g:profile_hold = 1
  call wbx#profiles#show('')
  let Held = g:ProfileCallback
  call cursor(6, 1)
  call call(Held, [{'result': g:profile_result}])
  call assert_equal(directory, bufnr('%'), 'cursor-selected person changes cannot install another same-name profile')
  let g:profile_result.personId = 'person-b' | let g:profile_hold = 0
  call wbx#profiles#show('')
  let profile = bufnr('%')
  call assert_equal('person-b', b:wbx_profile_snapshot.personId)
  call assert_match('Not provided by API', join(getline(1, '$'), ' '))
  call assert_equal(0, g:profile_pwned)
  call assert_equal([['people.profile', {'personId': 'person-a'}], ['people.profile', {'personId': 'person-b'}]], g:profile_requests)
  let invalid = deepcopy(g:profile_result) | let invalid.fields.avatar = 'https://evil.invalid'
  call assert_false(wbx#protocol#person_profile(invalid))
  let invalid = deepcopy(g:profile_result) | let invalid.fields.status = 'DoNotDisturb'
  call assert_false(wbx#protocol#person_profile(invalid))
  let invalid = deepcopy(g:profile_result) | let invalid.token = 'PRIVATE'
  call assert_false(wbx#protocol#person_profile(invalid))
  let invalid = deepcopy(g:profile_result) | let invalid.partial = v:false
  call assert_false(wbx#protocol#person_profile(invalid), 'missing fields never masquerade as complete selected subset')
  let invalid = deepcopy(g:profile_result) | let invalid.fields.displayName = repeat('x', 121)
  call assert_false(wbx#protocol#person_profile(invalid))
  let g:profile_hold = 1
  normal r
  setlocal modifiable
  call setline(1, 'New profile note during GET')
  let tree = undotree()
  call call(g:ProfileCallback, [{'result': g:profile_result}])
  call assert_equal('New profile note during GET', getline(1))
  call assert_equal(tree, undotree())
  let request_count = len(g:profile_requests)
  normal r
  normal q
  call assert_equal(request_count, len(g:profile_requests))
  execute 'bwipeout! ' . profile
  execute 'buffer ' . original
  let g:profile_hold = 1
  call wbx#profiles#show('person-b')
  let BeforeLeave = g:ProfileCallback
  split
  close
  call call(BeforeLeave, [{'result': g:profile_result}])
  call assert_equal(original, bufnr('%'), 'away-and-return cannot steal focus for an old profile')
  call wbx#profiles#show('person-b')
  let OldCallback = g:ProfileCallback
  let old = deepcopy(g:profile_result)
  let g:profile_state.localContext.sessionId = repeat('b', 32)
  let g:profile_result.sessionId = repeat('b', 32)
  let g:profile_hold = 0
  call wbx#profiles#show('person-b')
  call assert_true(wbx#profiles#bound(), 'new session can invalidate a dropped old callback without automatic replay')
  call call(OldCallback, [{'result': old}])
  call assert_equal(repeat('b', 32), b:wbx_profile_snapshot.sessionId)
  let g:profile_result.observedAt = localtime() * 1000 - 120001
  let before = deepcopy(b:wbx_profile_snapshot)
  normal r
  call assert_equal(before, b:wbx_profile_snapshot, 'replayed stale response cannot become a current profile')
  let g:profile_result.observedAt = localtime() * 1000 + 120000
  normal r
  call assert_equal(before, b:wbx_profile_snapshot, 'future responses cannot prolong freshness')
  let g:profile_result.observedAt = localtime() * 1000
  let b:wbx_profile_snapshot.observedAt -= 120001
  normal r
  call assert_true(b:wbx_profile_snapshot.observedAt > before.observedAt - 120000, 'expired data permits only a deliberate fresh same-ID GET')
  let profile = bufnr('%')
  normal q
  call assert_equal(original, bufnr('%'))
  call wbx#lists#show('members', ['Heading', 'Policy', 'Controls', 'Member [person-a]'], repeat([''], 3) + ['member-a'])
  let b:wbx_members_snapshot = {'roomId': 'room', 'items': [{'id': 'member-a', 'personId': 'person-a', 'label': 'Member'}]}
  let b:wbx_members_session = repeat('a', 32)
  call cursor(4, 1)
  let request_count = len(g:profile_requests)
  call wbx#profiles#show('')
  call assert_equal(request_count, len(g:profile_requests), 'old-session roster never supplies a new-session person target')
  let b:wbx_members_session = repeat('b', 32)
  call assert_equal('person-a', wbx#profiles#selected())
  execute 'buffer ' . profile
  let projection = getline(1, '$')
  enew
  execute 'bunload! ' . profile
  execute 'buffer ' . profile
  call assert_equal(projection, getline(1, '$'), 'profile uses shared safe unload restoration')
  setlocal modifiable
  call setline(1, 'Retained promoted text')
  let tree = undotree()
  setlocal buftype=
  let request_count = len(g:profile_requests)
  call wbx#profiles#refresh()
  call wbx#profiles#show('person-a')
  call assert_equal(request_count, len(g:profile_requests))
  call assert_equal('Retained promoted text', getline(1))
  call assert_equal(tree, undotree())
  call assert_notmatch('wbx#lists#close', maparg('q', 'n'))
  execute 'bwipeout! ' . profile
  let g:profile_result.personId = 'person-b'
  call wbx#profiles#show('person-b')
  let g:wbx_tui = {'mappings': 0}
  call wbx#lists#setup()
  call assert_equal('', maparg('r', 'n'))
  call assert_equal('', maparg('q', 'n'))
  let g:profile_state.localContext.sessionId = repeat('c', 32)
  let request_count = len(g:profile_requests)
  call wbx#profiles#refresh()
  call assert_equal(request_count, len(g:profile_requests), 'old-session refresh cannot retarget a new account')
  call assert_equal(0, g:profile_pwned)
  call assert_true(empty(filter(copy(g:profile_requests), 'v:val[0] !=# "people.profile"')), 'no presence, avatar, DM, mutation, scan or receipt operations')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
