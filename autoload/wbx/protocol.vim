" Validate backend data before it reaches editor state, drafts or terminal jobs.
let s:save_cpo = &cpoptions
set cpoptions&vim
let s:sources = ['video', 'share', 'local', 'self', 'presenting']
      \ + map(range(1, 12), '"mock-" . v:val') + map(range(2, 12), '"remote-" . v:val')
let s:people_unsafe = '[[:cntrl:]' . join(map(range(0x7f, 0x9f) + [0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b,
      \ 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2065, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff], 'nr2char(v:val)'), '') . ']'
let s:title_whitespace = '[' . join(map([0x00a0, 0x1680, 0x202f, 0x205f, 0x3000] + range(0x2000, 0x200a), 'nr2char(v:val)'), '') . ']'

function! s:string(value, max) abort
  return type(a:value) == v:t_string && strlen(a:value) <= a:max
endfunction
function! s:enum(value, choices) abort
  return type(a:value) == v:t_string && index(a:choices, a:value) >= 0
endfunction
function! s:integer(value, min, max) abort
  return type(a:value) == v:t_number && a:value >= a:min && a:value <= a:max
endfunction
function! s:id(value) abort
  return s:string(a:value, 514) && a:value =~# '^[A-Za-z0-9_+/-]\{1,512}=\{0,2}$'
endfunction
function! s:flags(value, names) abort
  for name in a:names
    if has_key(a:value, name) && type(a:value[name]) != v:t_bool
      return 0
    endif
  endfor
  return 1
endfunction
function! s:room(value) abort
  return type(a:value) == v:t_dict && s:id(get(a:value, 'id', v:null))
        \ && s:string(get(a:value, 'title', v:null), 4096)
        \ && (!has_key(a:value, 'type') || s:enum(a:value.type, ['direct', 'group']))
        \ && (!has_key(a:value, 'lastActivity') || s:string(a:value.lastActivity, 128))
        \ && s:flags(a:value, ['unread', 'unreadStale', 'cached', 'notifications', 'isLocked', 'isReadOnly', 'isAnnouncementOnly'])
        \ && (!has_key(a:value, 'teamId') || s:id(a:value.teamId))
        \ && (!has_key(a:value, 'unreadStale') || has_key(a:value, 'unread'))
        \ && (!has_key(a:value, 'unreadActivity') || has_key(a:value, 'unread') && s:people_date(a:value.unreadActivity))
        \ && (!get(a:value, 'cached', 0) || !has_key(a:value, 'unread') && !has_key(a:value, 'unreadStale')
        \     || get(a:value, 'unreadStale', v:null) is v:true)
endfunction
function! wbx#protocol#spaces_cache(value) abort
  return type(a:value) == v:t_dict && s:enum(get(a:value, 'state', v:null), ['off', 'loading', 'miss', 'stale', 'ready', 'unavailable'])
        \ && empty(filter(keys(a:value), 'index(["state", "reason", "observedAt", "verified"], v:val) < 0'))
        \ && s:flags(a:value, ['verified'])
        \ && (!has_key(a:value, 'reason') || s:enum(a:value.reason, ['scope-required', 'identity-unavailable', 'cache-unavailable', 'refresh-failed', 'expired', 'cleared']))
        \ && (!has_key(a:value, 'observedAt') || s:integer(a:value.observedAt, 0, 9007199254740991))
        \ && (get(a:value, 'state', '') !=# 'stale' || has_key(a:value, 'observedAt'))
endfunction
function! s:people_date(value) abort
  if !s:string(a:value, 24) || a:value !~# '^\d\{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\{3}Z$'
    return 0
  endif
  let year = str2nr(a:value[0:3])
  let month = str2nr(a:value[5:6])
  let day = str2nr(a:value[8:9])
  let days = [31, 28 + (year % 400 == 0 || year % 4 == 0 && year % 100 != 0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
        \ && str2nr(a:value[11:12]) <= 23 && str2nr(a:value[14:15]) <= 59 && str2nr(a:value[17:18]) <= 59
endfunction
function! wbx#protocol#people(value) abort
  try
    let value = a:value
    if type(value) != v:t_dict || get(value, 'customStatus', '') !=# 'unsupported'
          \ || !s:enum(get(value, 'capability', v:null), ['off', 'scope-required', 'ready', 'unavailable'])
          \ || !s:enum(get(value, 'state', v:null), ['fresh', 'stale', 'unknown', 'unavailable', 'loading'])
          \ || !s:enum(get(value, 'presence', v:null), ['active', 'call', 'DoNotDisturb', 'inactive', 'meeting', 'OutOfOffice', 'pending', 'presenting', 'unknown'])
      return 0
    endif
    for key in keys(value)
      if index(['capability', 'state', 'presence', 'customStatus', 'roomId', 'reason', 'requiredScope', 'observedAt', 'displayName', 'lastActivity', 'retryAt'], key) < 0
        return 0
      endif
    endfor
    if has_key(value, 'roomId') && (!s:id(value.roomId) || value.roomId ==# 'me')
          \ || has_key(value, 'reason') && !s:enum(value.reason, ['off', 'scope-required', 'closed', 'denied', 'not-shared', 'identity-missing', 'not-relevant', 'not-loaded',
          \ 'missing-status', 'unknown-status', 'pending', 'unsupported-person', 'aged', 'expired', 'invalid-data', 'not-found', 'failed', 'rate-limited',
          \ 'busy', 'canceled', 'timeout', 'not-direct', 'not-selected', 'incomplete-memberships', 'invalid-memberships', 'demo', 'not-connected'])
          \ || has_key(value, 'requiredScope') && !s:enum(value.requiredScope, ['spark:people_read', 'spark:memberships_read'])
      return 0
    endif
    for key in ['observedAt', 'retryAt']
      if has_key(value, key) && !s:integer(value[key], 0, 9007199254740991)
        return 0
      endif
    endfor
    if has_key(value, 'displayName') && (!s:string(value.displayName, 480) || strchars(value.displayName) > 120 || value.displayName =~# s:people_unsafe)
          \ || has_key(value, 'lastActivity') && !s:people_date(value.lastActivity)
      return 0
    endif
    if index(['fresh', 'stale'], value.state) >= 0 && (value.capability !=# 'ready' || !has_key(value, 'observedAt') || !has_key(value, 'roomId'))
          \ || value.state ==# 'unavailable' && value.presence !=# 'unknown'
          \ || value.state ==# 'unknown' && index(['unknown', 'pending'], value.presence) < 0
      return 0
    endif
    return value.capability ==# 'ready' || value.state ==# 'unavailable' && value.presence ==# 'unknown'
  catch
    return 0
  endtry
endfunction
function! wbx#protocol#joined_meetings(value) abort
  if type(a:value) != v:t_dict || !s:enum(get(a:value, 'state', v:null), ['off', 'loading', 'ready', 'unavailable'])
        \ || get(a:value, 'partial', v:null) isnot v:true || type(get(a:value, 'items', v:null)) != v:t_list || len(a:value.items) > 3
        \ || !empty(filter(keys(a:value), 'index(["state", "partial", "items", "observedAt"], v:val) < 0')) | return 0 | endif
  if a:value.state !=# 'ready' | return empty(a:value.items) && !has_key(a:value, 'observedAt') | endif
  if !s:integer(get(a:value, 'observedAt', v:null), 0, 9007199254740991) | return 0 | endif
  let seen = {}
  for item in a:value.items
    if type(item) != v:t_dict || sort(keys(item)) !=# ['id', 'title'] || !s:string(item.id, 64) || item.id !~# '^[a-f0-9]\{64}$'
          \ || has_key(seen, item.id) || !s:string(item.title, 1024) || empty(item.title) || strchars(item.title) > 120
          \ || item.title =~# s:people_unsafe || trim(item.title) !=# item.title | return 0 | endif
    let seen[item.id] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#upcoming(value) abort
  if type(a:value) != v:t_dict || !s:enum(get(a:value, 'state', v:null), ['off', 'scope-required', 'loading', 'ready', 'stale', 'unavailable'])
        \ || get(a:value, 'coverage', '') !=# 'webex-current-series' || get(a:value, 'requiredScope', '') !=# 'meeting:schedules_read'
        \ || !s:integer(get(a:value, 'revision', v:null), 1, 9007199254740991) || type(get(a:value, 'complete', v:null)) != v:t_bool
        \ || type(get(a:value, 'items', v:null)) != v:t_list || len(a:value.items) > 3
        \ || !empty(filter(keys(a:value), 'index(["state", "coverage", "requiredScope", "revision", "complete", "items", "reason", "observedAt", "retryAt"], v:val) < 0'))
    return 0
  endif
  for name in ['observedAt', 'retryAt']
    if has_key(a:value, name) && !s:integer(a:value[name], 0, 9007199254740991) | return 0 | endif
  endfor
  if has_key(a:value, 'reason') && !s:enum(a:value.reason, ['off', 'closed', 'scope-required', 'identity-missing', 'transport-unavailable', 'not-loaded',
        \ 'denied', 'failed', 'invalid-data', 'unsafe-pagination', 'rate-limited', 'timeout', 'canceled', 'busy', 'expired', 'limit', 'partial-data']) | return 0 | endif
  let seen = {}
  for item in a:value.items
    if type(item) != v:t_dict || !s:id(get(item, 'id', v:null)) || has_key(seen, item.id)
          \ || !s:string(get(item, 'title', v:null), 1024) || item.title =~# s:people_unsafe
          \ || type(get(item, 'joinable', v:null)) != v:t_bool || item.joinable && a:value.state !=# 'ready'
          \ || !s:enum(get(item, 'meetingType', v:null), ['meetingSeries', 'scheduledMeeting'])
          \ || !s:enum(get(item, 'meetingState', v:null), item.meetingType ==# 'meetingSeries' ? ['active', 'inProgress'] : ['scheduled', 'ready'])
          \ || !empty(filter(keys(item), 'index(["id", "title", "start", "end", "meetingType", "meetingState", "joinable", "joinReason"], v:val) < 0'))
      return 0
    endif
    for name in ['start', 'end']
      if !s:string(get(item, name, v:null), 24) || item[name] !~# '^\d\{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\{3}Z$' | return 0 | endif
    endfor
    if item.end <=# item.start || has_key(item, 'joinReason') && !s:enum(item.joinReason, ['link-unavailable', 'stale']) | return 0 | endif
    let seen[item.id] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#sections(value) abort
  let value = a:value
  if type(value) != v:t_dict || !s:integer(get(value, 'revision', v:null), 0, 9007199254740991)
        \ || !s:enum(get(value, 'persistence', v:null), ['session', 'saved', 'unavailable'])
        \ || !empty(filter(keys(value), 'index(["revision", "persistence", "items"], v:val) < 0'))
        \ || type(get(value, 'items', v:null)) != v:t_list || len(value.items) > 32 | return 0 | endif
  let ids = {} | let names = {} | let rooms = {}
  for item in value.items
    if type(item) != v:t_dict || !s:string(get(item, 'id', v:null), 24) || item.id !~# '^[a-f0-9]\{24}$'
          \ || !s:string(get(item, 'name', v:null), 240) || empty(item.name) || strchars(item.name) > 60
          \ || item.name =~# s:people_unsafe || trim(item.name) !=# item.name
          \ || type(get(item, 'collapsed', v:null)) != v:t_bool || type(get(item, 'rooms', v:null)) != v:t_list || len(item.rooms) > 500
          \ || !empty(filter(keys(item), 'index(["id", "name", "collapsed", "rooms"], v:val) < 0'))
          \ || has_key(ids, item.id) || has_key(names, tr(item.name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')) | return 0 | endif
    let ids[item.id] = 1 | let names[tr(item.name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')] = 1
    for id in item.rooms
      if !s:id(id) || has_key(rooms, id) | return 0 | endif
      let rooms[id] = 1
    endfor
    if len(rooms) > 500 | return 0 | endif
  endfor
  return 1
endfunction
function! s:sender_name(value) abort
  return s:string(a:value, 480) && !empty(a:value) && strchars(a:value) <= 120
        \ && a:value !~# s:people_unsafe && trim(a:value) ==# a:value && a:value !~# '\s\{2}'
endfunction
function! wbx#protocol#space_title(value) abort
  return s:sender_name(a:value) && strlen(a:value) <= 320 && strchars(a:value) <= 80
        \ && a:value !~# s:title_whitespace
endfunction
function! wbx#protocol#description_text(value, nonblank) abort
  if !s:string(a:value, 4000) || substitute(a:value, "\n", '', 'g') =~# s:people_unsafe | return 0 | endif
  if a:nonblank && empty(substitute(substitute(a:value, '\_s', '', 'g'), s:title_whitespace, '', 'g')) | return 0 | endif
  let units = 0
  for code in str2list(a:value)
    if code >= 0xd800 && code <= 0xdfff | return 0 | endif
    let units += code > 65535 ? 2 : 1
    if units > 1000 | return 0 | endif
  endfor
  return 1
endfunction
function! wbx#protocol#space_description(value) abort
  let v = a:value
  return type(v) == v:t_dict && s:string(get(v, 'sessionId', v:null), 32) && v.sessionId =~# '^[a-f0-9]\{32}$'
        \ && s:id(get(v, 'roomId', v:null)) && wbx#protocol#space_title(get(v, 'expectedTitle', v:null))
        \ && wbx#protocol#description_text(get(v, 'expectedDescription', v:null), 0)
        \ && s:integer(get(v, 'observedAt', v:null), 1, 9007199254740991)
        \ && empty(filter(keys(v), 'index(["sessionId", "roomId", "expectedTitle", "expectedDescription", "observedAt"], v:val) < 0'))
        \ && strlen(json_encode(v)) <= 16384
endfunction
function! s:message_events(value) abort
  if type(a:value) != v:t_dict || !s:enum(get(a:value, 'state', v:null), ['off', 'connecting', 'live', 'polling', 'failed'])
        \ || !s:integer(get(a:value, 'received', v:null), 0, 9007199254740991)
        \ || type(get(a:value, 'items', v:null)) != v:t_list || len(a:value.items) > 64
        \ || !s:flags(a:value, ['preview', 'senderNames'])
        \ || get(a:value, 'senderNames', 0) && !get(a:value, 'preview', 0)
        \ || !empty(filter(keys(a:value), 'index(["state", "received", "items", "preview", "senderNames"], v:val) < 0')) | return 0 | endif
  let seen = {}
  for item in a:value.items
    if type(item) != v:t_dict || !s:id(get(item, 'id', v:null)) || !s:id(get(item, 'roomId', v:null))
          \ || !s:people_date(get(item, 'created', v:null)) || type(get(item, 'self', v:null)) != v:t_bool
          \ || !s:integer(get(item, 'observedAt', v:null), 0, 9007199254740991)
          \ || !empty(filter(keys(item), 'index(["id", "roomId", "created", "self", "observedAt", "preview", "senderName"], v:val) < 0')) | return 0 | endif
    if has_key(item, 'preview') && (!get(a:value, 'preview', 0) || !s:string(item.preview, 640)
           \ || empty(item.preview) || strchars(item.preview) > 160 || item.preview =~# s:people_unsafe) | return 0 | endif
    if has_key(item, 'senderName') && (!get(a:value, 'senderNames', 0) || !has_key(item, 'preview') || !s:sender_name(item.senderName)) | return 0 | endif
    let key = json_encode([item.roomId, item.id])
    if has_key(seen, key) | return 0 | endif
    let seen[key] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#local_context(value) abort
  return type(a:value) == v:t_dict && sort(keys(a:value)) ==# ['coverage', 'sessionId']
        \ && get(a:value, 'coverage', '') ==# 'session-only'
        \ && s:string(get(a:value, 'sessionId', v:null), 32) && a:value.sessionId =~# '^[a-f0-9]\{32}$'
endfunction
function! wbx#protocol#person_id(value) abort
  return s:id(a:value) && a:value !=# 'me' && a:value =~# '^[A-Za-z0-9_+-]'
endfunction
function! wbx#protocol#readers(value) abort
  let v = a:value
  if type(v) != v:t_dict || !s:id(get(v, 'roomId', v:null)) || !s:id(get(v, 'messageId', v:null))
        \ || get(v, 'coverage', '') !=# 'space-read-watermark' || !s:integer(get(v, 'observedAt', v:null), 1, 9007199254740991)
        \ || type(get(v, 'partial', v:null)) != v:t_bool || type(get(v, 'readers', v:null)) != v:t_list || len(v.readers) > 128
        \ || sort(keys(v)) !=# ['coverage', 'messageId', 'observedAt', 'partial', 'readers', 'roomId'] | return 0 | endif
  let seen = {}
  for reader in v.readers
    if type(reader) != v:t_dict || !wbx#protocol#person_id(get(reader, 'personId', v:null))
          \ || has_key(seen, reader.personId) || has_key(reader, 'name') && !s:sender_name(reader.name)
          \ || !empty(filter(keys(reader), 'index(["personId", "name"], v:val) < 0')) | return 0 | endif
    let seen[reader.personId] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#person_profile(value) abort
  let value = a:value
  if type(value) != v:t_dict || !s:string(get(value, 'sessionId', v:null), 32) || value.sessionId !~# '^[a-f0-9]\{32}$'
        \ || !wbx#protocol#person_id(get(value, 'personId', v:null)) || get(value, 'coverage', '') !=# 'person-text'
        \ || !s:integer(get(value, 'observedAt', v:null), 0, 9007199254740991)
        \ || type(get(value, 'partial', v:null)) != v:t_bool || type(get(value, 'fields', v:null)) != v:t_dict
        \ || sort(keys(value)) !=# ['coverage', 'fields', 'observedAt', 'partial', 'personId', 'sessionId']
        \ || !empty(filter(keys(value.fields), 'index(["displayName", "firstName", "lastName", "department", "title", "timezone"], v:val) < 0'))
    return 0
  endif
  for field in values(value.fields)
    if !s:sender_name(field) | return 0 | endif
  endfor
  return (value.partial || len(value.fields) == 6) && strlen(json_encode(value)) <= 4096
endfunction
function! wbx#protocol#directory_query(value) abort
  return s:string(a:value, 480) && strchars(a:value) >= 2 && strchars(a:value) <= 120
        \ && trim(a:value) ==# a:value && a:value !~# s:people_unsafe && a:value !~# '\*'
endfunction
function! wbx#protocol#joined_teams(value) abort
  let value = a:value
  if type(value) != v:t_dict || !s:string(get(value, 'sessionId', v:null), 32) || value.sessionId !~# '^[a-f0-9]\{32}$'
        \ || get(value, 'coverage', '') !=# 'joined-teams' || !s:integer(get(value, 'revision', v:null), 1, 9007199254740991)
        \ || !s:integer(get(value, 'observedAt', v:null), 0, 9007199254740991)
        \ || type(get(value, 'partial', v:null)) != v:t_bool || type(get(value, 'more', v:null)) != v:t_bool
        \ || !s:enum(get(value, 'limit', v:null), ['none', 'items', 'pages', 'bytes', 'cycle'])
        \ || value.more && !value.partial || value.limit !=# 'none' && (!value.partial || value.more)
        \ || type(get(value, 'items', v:null)) != v:t_list || len(value.items) > 250
        \ || sort(keys(value)) !=# ['coverage', 'items', 'limit', 'more', 'observedAt', 'partial', 'revision', 'sessionId']
    return 0
  endif
  let ids = {}
  for item in value.items
    if type(item) != v:t_dict || sort(keys(item)) !=# ['label', 'teamId'] || !s:id(get(item, 'teamId', v:null))
          \ || !s:sender_name(get(item, 'label', v:null)) || has_key(ids, item.teamId) | return 0 | endif
    let ids[item.teamId] = 1
  endfor
  " Node owns the 64 KiB quota; allow bounded differences in native JSON encoding.
  return strlen(json_encode(value.items)) <= 131072
endfunction
function! wbx#protocol#directory(value) abort
  let value = a:value
  if type(value) != v:t_dict || !s:string(get(value, 'sessionId', v:null), 32) || value.sessionId !~# '^[a-f0-9]\{32}$'
        \ || !wbx#protocol#directory_query(get(value, 'query', v:null)) || get(value, 'coverage', '') !=# 'directory-prefix'
        \ || !s:integer(get(value, 'revision', v:null), 1, 9007199254740991)
        \ || !s:integer(get(value, 'observedAt', v:null), 0, 9007199254740991)
        \ || type(get(value, 'partial', v:null)) != v:t_bool || type(get(value, 'more', v:null)) != v:t_bool
        \ || value.more && !value.partial || type(get(value, 'items', v:null)) != v:t_list || len(value.items) > 250
        \ || !empty(filter(keys(value), 'index(["sessionId", "query", "revision", "coverage", "observedAt", "partial", "more", "items"], v:val) < 0'))
    return 0
  endif
  let ids = {}
  for item in value.items
    if type(item) != v:t_dict || sort(keys(item)) !=# ['label', 'personId'] || !s:id(get(item, 'personId', v:null))
          \ || item.personId ==# 'me' || !s:sender_name(get(item, 'label', v:null)) || has_key(ids, item.personId) | return 0 | endif
    let ids[item.personId] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#message_query(value) abort
  let value = a:value
  if type(value) != v:t_dict || !s:enum(get(value, 'kind', v:null), ['thread', 'mentions'])
        \ || !s:string(get(value, 'sessionId', v:null), 32) || value.sessionId !~# '^[a-f0-9]\{32}$'
        \ || !s:id(get(value, 'roomId', v:null)) || !s:integer(get(value, 'revision', v:null), 1, 9007199254740991)
        \ || !s:integer(get(value, 'observedAt', v:null), 0, 9007199254740991)
        \ || type(get(value, 'partial', v:null)) != v:t_bool || type(get(value, 'more', v:null)) != v:t_bool
        \ || value.more && !value.partial || !s:enum(get(value, 'limit', v:null), ['none', 'items', 'pages', 'bytes', 'cycle'])
        \ || value.limit !=# 'none' && (!value.partial || value.more)
        \ || type(get(value, 'items', v:null)) != v:t_list
        \ || !empty(filter(keys(value), 'index(["kind", "coverage", "sessionId", "roomId", "revision", "observedAt", "partial", "more", "limit", "items", "sourceId", "rootId"], v:val) < 0'))
    return 0
  endif
  let thread = value.kind ==# 'thread'
  if get(value, 'coverage', '') !=# (thread ? 'room-thread' : 'room-mentions-me') || len(value.items) > (thread ? 251 : 250)
        \ || (thread ? !s:id(get(value, 'sourceId', v:null)) || !s:id(get(value, 'rootId', v:null)) || empty(value.items)
        \ : has_key(value, 'sourceId') || has_key(value, 'rootId')) | return 0 | endif
  let ids = {}
  let index = 0
  for item in value.items
    if type(item) != v:t_dict || !s:id(get(item, 'id', v:null)) || has_key(ids, item.id)
          \ || !s:string(get(item, 'author', v:null), 320) || !s:people_date(get(item, 'created', v:null))
          \ || !s:string(get(item, 'text', v:null), 65536) || !s:integer(get(item, 'fileCount', v:null), 0, 10)
          \ || type(get(item, 'contentPartial', v:null)) != v:t_bool || item.fileCount > 0 && !item.contentPartial
          \ || has_key(item, 'markdown') && !s:string(item.markdown, 65536)
          \ || has_key(item, 'updated') && !s:people_date(item.updated) || !s:flags(item, ['quoted', 'edited'])
          \ || has_key(item, 'parentId') && (!s:id(item.parentId) || item.parentId ==# item.id)
          \ || !empty(filter(keys(item), 'index(["id", "author", "created", "updated", "edited", "text", "markdown", "quoted", "parentId", "fileCount", "contentPartial"], v:val) < 0'))
      return 0
    endif
    if thread && (index == 0 ? item.id !=# value.rootId || has_key(item, 'parentId') : get(item, 'parentId', '') !=# value.rootId) | return 0 | endif
    let ids[item.id] = 1
    let index += 1
  endfor
  return strlen(json_encode(value.items)) <= 524288
endfunction
function! s:state(value) abort
  if type(a:value) != v:t_dict || !s:integer(get(a:value, 'revision', v:null), 0, 9007199254740991)
        \ || !s:enum(get(a:value, 'state', v:null), ['idle', 'connecting', 'ready', 'failed'])
        \ || !s:enum(get(a:value, 'mode', v:null), ['demo', 'live'])
        \ || type(get(a:value, 'ready', v:null)) != v:t_bool
        \ || type(get(a:value, 'rooms', v:null)) != v:t_list || len(a:value.rooms) > 500
        \ || type(get(a:value, 'messages', v:null)) != v:t_list || len(a:value.messages) > 500
        \ || !has_key(a:value, 'room') || !(a:value.room is v:null || s:room(a:value.room))
        \ || !s:flags(a:value, ['loading', 'loadingRooms', 'sending', 'moreRooms', 'moreHistory', 'historyLatest', 'uncertain', 'truncated', 'senderNames', 'uploadPending', 'directPending', 'historyCached'])
    return 0
  endif
  if has_key(a:value, 'readStatus') && !s:enum(a:value.readStatus, ['off', 'connecting', 'ready', 'failed'])
    return 0
  endif
  if has_key(a:value, 'roomsStatus') && !s:enum(a:value.roomsStatus, ['unverified', 'loading', 'ready', 'failed'])
    return 0
  endif
  if has_key(a:value,'reactionSource')
    let source = a:value.reactionSource
    if type(source) != v:t_dict || !empty(filter(keys(source),'index(["degraded","epoch","revision","readable"],v:val) < 0'))
          \ || !s:integer(get(source,'epoch',v:null),0,9007199254740991)
          \ || !s:integer(get(source,'revision',v:null),0,9007199254740991)
          \ || type(get(source,'degraded',v:null)) != v:t_bool || !s:flags(source,['readable'])
          \ || get(source,'readable',0) && !source.degraded
          \ || source.degraded && get(a:value,'readStatus','off') !=# 'failed' | return 0 | endif
  endif
  if get(a:value,'historyCached',0) && (a:value.ready || get(a:value,'historyLatest',0) || a:value.room is v:null) | return 0 | endif
  if has_key(a:value,'cachedReactions')
    if type(a:value.cachedReactions) != v:t_list || len(a:value.cachedReactions) > 32 || a:value.room is v:null | return 0 | endif
    let reaction_ids = {}
    for snapshot in a:value.cachedReactions
      if !wbx#protocol#reactions(snapshot) || snapshot.roomId !=# a:value.room.id
            \ || has_key(reaction_ids,snapshot.messageId) | return 0 | endif
      let reaction_ids[snapshot.messageId] = 1
      for group in snapshot.groups | if has_key(group,'own') | return 0 | endif | endfor
    endfor
  endif
  " Validate rooms once; reuse exact live/direct eligibility for presence lists.
  let rooms = {}
  let cached_rooms = 0
  for room in a:value.rooms
    if !s:room(room) || has_key(rooms, room.id)
      return 0
    endif
    let rooms[room.id] = get(room, 'type', '') ==# 'direct' && !get(room, 'cached', 0)
    let cached_rooms += get(room, 'cached', 0) ? 1 : 0
    if get(room, 'cached', 0) && (get(get(a:value, 'spacesCache', {}), 'state', '') !=# 'stale'
          \ || get(get(a:value, 'spacesCache', {}), 'verified', 0)
          \ || a:value.room isnot v:null || a:value.ready || !empty(a:value.messages) || get(a:value, 'moreRooms', 0)) | return 0 | endif
  endfor
  if cached_rooms > 0 && cached_rooms != len(a:value.rooms) | return 0 | endif
  if has_key(a:value, 'peopleStatus') && (!wbx#protocol#people(a:value.peopleStatus)
        \ || has_key(a:value.peopleStatus, 'roomId') && (type(a:value.room) != v:t_dict || a:value.peopleStatus.roomId !=# a:value.room.id)
        \ || index(['fresh', 'stale'], a:value.peopleStatus.state) >= 0 && get(a:value.room, 'type', '') !=# 'direct')
    return 0
  endif
  for field in ['peopleSpaces', 'peopleViewport']
    if !has_key(a:value, field) | continue | endif
    if type(a:value[field]) != v:t_list || len(a:value[field]) > (field ==# 'peopleViewport' ? 128 : 8) | return 0 | endif
    let peers = {}
    for value in a:value[field]
      if !wbx#protocol#people(value) || !has_key(value, 'roomId') || has_key(peers, value.roomId) | return 0 | endif
      if !get(rooms, value.roomId, 0) | return 0 | endif
      let peers[value.roomId] = 1
    endfor
  endfor
  for name in ['auth', 'notice', 'readStatusNotice']
    if has_key(a:value, name) && !s:string(a:value[name], 65536)
      return 0
    endif
  endfor
  if has_key(a:value, 'upcomingMeetings') && !wbx#protocol#upcoming(a:value.upcomingMeetings) | return 0 | endif
  if has_key(a:value, 'joinedMeetings') && !wbx#protocol#joined_meetings(a:value.joinedMeetings) | return 0 | endif
  if has_key(a:value, 'spacesCache') && !wbx#protocol#spaces_cache(a:value.spacesCache) | return 0 | endif
  if has_key(a:value, 'sections') && !wbx#protocol#sections(a:value.sections) | return 0 | endif
  if has_key(a:value, 'localContext') && (a:value.state !=# 'ready' || !wbx#protocol#local_context(a:value.localContext)) | return 0 | endif
  if has_key(a:value, 'messageEvents') && !s:message_events(a:value.messageEvents) | return 0 | endif
  if get(get(a:value, 'messageEvents', {}), 'senderNames', 0) && !get(a:value, 'senderNames', 0) | return 0 | endif
  if type(a:value.room) == v:t_dict && get(a:value.room, 'cached', 0) | return 0 | endif
  let messages = {}
  for message in a:value.messages
    if type(message) != v:t_dict || !s:id(get(message, 'id', v:null))
          \ || !s:string(get(message, 'author', v:null), 4096)
          \ || !s:string(get(message, 'created', v:null), 128)
           \ || !s:string(get(message, 'text', v:null), 65536)
           \ || (has_key(message, 'markdown') && !s:string(message.markdown, 65536))
          \ || (has_key(message, 'parentId') && (!s:id(message.parentId) || message.parentId ==# message.id))
            \ || !s:flags(message, ['quoted', 'edited'])
            \ || (has_key(message, 'updated') && (!s:string(message.updated, 128) || wbx#notify_events#time(message.updated) < 0))
            \ || (has_key(message, 'images') && !wbx#protocol#images(message.images))
             \ || (has_key(message, 'attachments') && !wbx#protocol#attachments(message.attachments))
             \ || (has_key(message, 'cards') && !wbx#protocol#cards(message.cards))
            \ || (has_key(message, 'senderName') && (!get(a:value, 'senderNames', 0) || !s:sender_name(message.senderName) || message.author !=# message.senderName))
      return 0
    endif
    if has_key(messages, message.id)
      return 0
    endif
    let messages[message.id] = 1
  endfor
  for snapshot in get(a:value,'cachedReactions',[])
    if !has_key(messages,snapshot.messageId) | return 0 | endif
  endfor
  return empty(a:value.messages) || s:room(a:value.room)
endfunction
function! wbx#protocol#cards(value) abort
  return type(a:value) == v:t_dict && sort(keys(a:value)) ==# ['count', 'partial']
        \ && s:integer(get(a:value, 'count', v:null), 1, 10) && type(get(a:value, 'partial', v:null)) == v:t_bool
endfunction
function! wbx#protocol#images(images) abort
  if type(a:images) != v:t_list || len(a:images) > 4 | return 0 | endif
  let seen = {}
  for image in a:images
    if type(image) != v:t_dict || type(get(image, 'id', 0)) != v:t_string || image.id !~# '^[a-f0-9]\{64}$'
          \ || has_key(seen, image.id) || !s:enum(get(image, 'state', ''), ['pending', 'ready', 'unsupported', 'unavailable'])
          \ || !empty(filter(keys(image), 'index(["id", "state", "png", "lines"], v:val) < 0')) | return 0 | endif
    let seen[image.id] = 1
    if image.state !=# 'ready'
      if has_key(image, 'png') || has_key(image, 'lines') | return 0 | endif
    elseif !s:string(get(image, 'png', v:null), 150000) || empty(image.png) || image.png !~# '^iVBORw0KGgo[A-Za-z0-9+/]*=\{0,2}$'
          \ || strlen(image.png) % 4 != 0 || type(get(image, 'lines', 0)) != v:t_list || len(image.lines) != 12
      return 0
    else
      for row in image.lines
        if type(row) != v:t_string || strchars(row) != 40 || row !~# '^[⠀-⣿]\{40}$' | return 0 | endif
      endfor
    endif
  endfor
  return 1
endfunction
function! wbx#protocol#opened_image(image) abort
  let image = a:image
  if type(image) != v:t_dict || get(image, 'state', '') !=# 'ready'
        \ || type(get(image, 'id', 0)) != v:t_string || image.id !~# '^[a-f0-9]\{64}$'
        \ || !empty(filter(keys(image), 'index(["id", "state", "png", "lines", "width", "height"], v:val) < 0'))
        \ || !s:integer(get(image, 'width', 0), 1, 1600) || !s:integer(get(image, 'height', 0), 1, 1200)
        \ || !s:string(get(image, 'png', v:null), 8000000) || image.png !~# '^iVBORw0KGgo[A-Za-z0-9+/]*=\{0,2}$'
        \ || strlen(image.png) % 4 != 0 || type(get(image, 'lines', 0)) != v:t_list || len(image.lines) != 12 | return 0 | endif
  for row in image.lines
    if type(row) != v:t_string || strchars(row) != 40 || row !~# '^[⠀-⣿]\{40}$' | return 0 | endif
  endfor
  return 1
endfunction
function! wbx#protocol#attachments(files) abort
  if type(a:files) != v:t_list || len(a:files) > 10 | return 0 | endif
  let seen = {}
  for file in a:files
    if type(file) != v:t_dict || type(get(file, 'id', 0)) != v:t_string
          \ || file.id !~# '^[a-f0-9]\{64}$' || has_key(seen, file.id)
          \ || !empty(filter(keys(file), 'index(["id", "name", "mime"], v:val) < 0'))
          \ || has_key(file, 'name') != has_key(file, 'mime') | return 0 | endif
    if has_key(file, 'name') && (!s:string(file.name, 120) || file.name !~# '^[A-Za-z0-9_][A-Za-z0-9._ -]*$'
          \ || !s:string(file.mime, 129) || file.mime !~# '^[a-z0-9!#$&^_.+-]\{1,64}/[a-z0-9!#$&^_.+-]\{1,64}$') | return 0 | endif
    let seen[file.id] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#opened_attachment(file) abort
  let file = a:file
  if type(file) != v:t_dict || !wbx#protocol#attachments([{'id': get(file, 'id', 0)}])
        \ || !empty(filter(keys(file), 'index(["id", "name", "mime", "size", "text", "data"], v:val) < 0'))
        \ || !s:string(get(file, 'name', 0), 120) || file.name !~# '^[A-Za-z0-9_][A-Za-z0-9._ -]*$'
        \ || !s:string(get(file, 'mime', 0), 129) || file.mime !~# '^[a-z0-9!#$&^_.+-]\+/[a-z0-9!#$&^_.+-]\+$'
        \ || !s:integer(get(file, 'size', -1), 0, 6000000) || type(get(file, 'text', 0)) != v:t_bool
        \ || file.text && file.size > 1048576 || !s:string(get(file, 'data', 0), 8000000)
        \ || file.data !~# '^[A-Za-z0-9+/]*=\{0,2}$' || strlen(file.data) != ((file.size + 2) / 3) * 4 | return 0 | endif
  return 1
endfunction
function! s:canonical_base64(data, bytes) abort
  if type(a:data) != v:t_string || strlen(a:data) != ((a:bytes + 2) / 3) * 4
        \ || a:data !~# '^[A-Za-z0-9+/]*=\{0,2}$' | return 0 | endif
  let padding = a:data =~# '==$' ? 2 : (a:data =~# '=$' ? 1 : 0)
  if strlen(a:data) / 4 * 3 - padding != a:bytes | return 0 | endif
  let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  return padding == 0 || stridx(alphabet, strpart(a:data, strlen(a:data) - padding - 1, 1)) % (padding == 2 ? 16 : 4) == 0
endfunction
function! wbx#protocol#resolved_attachment(value, ...) abort
  let value = a:value
  if type(value) != v:t_dict || sort(keys(value)) !=# ['body', 'meta'] | return 0 | endif
  let meta = value.meta
  let body = value.body
  if type(meta) != v:t_dict || sort(keys(meta)) !=# ['id', 'mime', 'name', 'sourceBytes']
        \ || !wbx#protocol#attachments([{'id': get(meta, 'id', 0)}])
        \ || !s:string(get(meta, 'name', 0), 120) || meta.name !~# '^[A-Za-z0-9_][A-Za-z0-9._ -]*$'
        \ || !s:string(get(meta, 'mime', 0), 129) || meta.mime !~# '^[a-z0-9!#$&^_.+-]\{1,64}/[a-z0-9!#$&^_.+-]\{1,64}$'
        \ || !s:integer(get(meta, 'sourceBytes', -1), 0, 8388608)
        \ || type(body) != v:t_dict || !s:integer(get(body, 'decodedBytes', -1), 0, 6000000)
        \ || !s:enum(get(body, 'kind', 0), ['original', 'png'])
        \ || type(get(body, 'payload', 0)) != v:t_dict | return 0 | endif
  let payload = body.payload
  let chunks = type(get(payload, 'mode', 0)) == v:t_string && payload.mode ==# 'chunks'
  if chunks
    if !a:0 || sort(keys(payload)) !=# ['chunkBytes', 'chunks', 'encodedBytes', 'encoding', 'mode', 'requestId', 'sha256', 'transferId']
          \ || !s:integer(payload.requestId, 1, 2147483647) || payload.requestId != a:1
          \ || !s:enum(payload.encoding, ['base64']) || !s:integer(payload.chunkBytes, 49152, 49152)
          \ || !s:integer(payload.chunks, 0, 123) || payload.chunks != (body.decodedBytes + 49151) / 49152
          \ || !s:integer(payload.encodedBytes, 0, 8000000) || payload.encodedBytes != ((body.decodedBytes + 2) / 3) * 4
          \ || type(payload.transferId) != v:t_string || payload.transferId !~# '^[a-f0-9]\{32}$'
          \ || type(payload.sha256) != v:t_string || payload.sha256 !~# '^[a-f0-9]\{64}$'
          \ || strlen(json_encode(value)) > 8192 | return 0 | endif
  elseif sort(keys(payload)) !=# ['data', 'encoding', 'mode'] || !s:enum(get(payload, 'mode', ''), ['inline'])
        \ || !s:enum(get(payload, 'encoding', ''), ['base64']) || !s:canonical_base64(get(payload, 'data', 0), body.decodedBytes) | return 0 | endif
  if get(body, 'kind', '') ==# 'original'
    return sort(keys(body)) ==# ['decodedBytes', 'kind', 'payload', 'text'] && meta.sourceBytes == body.decodedBytes
          \ && type(get(body, 'text', 0)) == v:t_bool && (!body.text || body.decodedBytes <= 1048576)
  endif
  if get(body, 'kind', '') !=# 'png' || sort(keys(body)) !=# ['decodedBytes', 'height', 'kind', 'lines', 'payload', 'width']
        \ || index(['image/png', 'image/jpeg', 'image/gif', 'image/webp'], meta.mime) < 0
        \ || meta.sourceBytes < get({'image/png': 8, 'image/jpeg': 3, 'image/gif': 6, 'image/webp': 12}, meta.mime, 1)
        \ || body.decodedBytes < 45 || !s:integer(get(body, 'width', 0), 1, 1600) || !s:integer(get(body, 'height', 0), 1, 1200)
        \ || !chunks && payload.data !~# '^iVBORw0KGgo' || type(get(body, 'lines', 0)) != v:t_list || len(body.lines) != 12 | return 0 | endif
  for row in body.lines
    if type(row) != v:t_string || strchars(row) != 40 || row !~# '^[⠀-⣿]\{40}$' | return 0 | endif
  endfor
  return chunks || wbx#protocol#png_header(payload.data, body.width, body.height)
endfunction
function! wbx#protocol#attachment_chunk(chunk, value, seq) abort
  let c = a:chunk
  let body = a:value.body
  let p = body.payload
  let bytes = min([49152, body.decodedBytes - a:seq * 49152])
  return type(c) == v:t_dict && sort(keys(c)) ==# ['data', 'decodedBytes', 'offset', 'requestId', 'seq', 'transferId']
        \ && s:integer(c.requestId, 1, 2147483647) && c.requestId == p.requestId && type(c.transferId) == v:t_string
        \ && c.transferId ==# p.transferId && s:integer(c.seq, 0, p.chunks - 1) && c.seq == a:seq
        \ && s:integer(c.offset, 0, 6000000) && c.offset == a:seq * 49152 && bytes > 0
        \ && s:integer(c.decodedBytes, 1, 49152) && c.decodedBytes == bytes && s:canonical_base64(c.data, bytes)
        \ && (body.kind !=# 'png' || a:seq != 0 || wbx#protocol#png_header(c.data, body.width, body.height))
endfunction
function! wbx#protocol#png_header(data, expected_width, expected_height) abort
  if strlen(a:data) < 32 || a:data !~# '^iVBORw0KGgo' | return 0 | endif
  " Decode only the fixed header, not another multi-megabyte copy in Vim.
  let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let header = []
  for offset in range(0, 28, 4)
    let n = 0
    for character in split(strpart(a:data, offset, 4), '\zs')
      let n = n * 64 + stridx(alphabet, character)
    endfor
    call extend(header, [n / 65536, n / 256 % 256, n % 256])
  endfor
  let width = 0
  let height = 0
  for offset in range(16, 19) | let width = width * 256 + header[offset] | let height = height * 256 + header[offset + 4] | endfor
  return width == a:expected_width && height == a:expected_height
endfunction
function! s:meeting(value) abort
  if type(a:value) != v:t_dict || type(get(a:value, 'active', v:null)) != v:t_bool
        \ || type(get(a:value, 'ready', v:null)) != v:t_bool
        \ || (a:value.ready && !a:value.active)
        \ || (has_key(a:value, 'display') && !s:enum(a:value.display, ['kitty', 'editor']))
    return 0
  endif
  if has_key(a:value, 'panes')
    let p = a:value.panes
    if type(p) != v:t_dict || type(get(p, 'version', v:null)) != v:t_number || p.version != 1 || !s:integer(get(p, 'revision', v:null), 1, 9007199254740991)
          \ || type(get(p, 'layouts', v:null)) != v:t_list || len(p.layouts) > 32
          \ || !empty(filter(copy(p.layouts), 'type(v:val) != v:t_string || v:val !~# "^[A-Za-z0-9_-]\\{1,40}$"'))
          \ || len(uniq(sort(copy(p.layouts)))) != len(p.layouts)
          \ || !s:meeting_event({'type': 'sources', 'sources': get(p, 'sources', v:null)})
          \ || len(uniq(sort(map(copy(p.sources), 'v:val.id')))) != len(p.sources)
          \ || !empty(filter(keys(p), 'index(["version", "revision", "layouts", "sources"], v:val) < 0'))
      return 0
    endif
  endif
  let session = get(a:value, 'session', v:null)
  if !(session is v:null || s:string(session, 128) && session =~# '^wbx-[A-Za-z0-9_-]\+$')
    return 0
  endif
  let attach = get(a:value, 'attach', [])
  if type(attach) != v:t_list
    return 0
  endif
  if empty(attach)
    return 1
  endif
  for argument in attach
    if !s:string(argument, 4096)
      return 0
    endif
  endfor
  " A presentation is a validated tmux client, not arbitrary executable argv.
  return len(attach) == 6 && type(session) == v:t_string
        \ && attach[0] ==# 'tmux' && attach[1] ==# '-S'
        \ && s:string(attach[2], 4096) && attach[2] =~# '^/' && attach[2] !~# '[\x00-\x1f\x7f]'
        \ && attach[3] ==# 'attach-session' && attach[4] ==# '-t' && attach[5] ==# session
endfunction
function! wbx#protocol#staged_upload(value) abort
  return type(a:value) == v:t_dict && s:string(get(a:value, 'attachmentId', v:null), 32) && a:value.attachmentId =~# '^[a-f0-9]\{32}$'
        \ && s:string(get(a:value, 'name', v:null), 240) && !empty(a:value.name) && strchars(a:value.name) <= 120 && a:value.name !~# s:people_unsafe
        \ && s:integer(get(a:value, 'bytes', v:null), 0, 10485760)
        \ && empty(filter(keys(a:value), 'index(["attachmentId", "name", "bytes"], v:val) < 0'))
endfunction
let s:reactions = {'thumbsup':'Thumbs up', 'heart':'Heart', 'celebrate':'Celebrate', 'smiley':'Smile', 'haha':'Laugh', 'confused':'Confused', 'sad':'Sad'}
function! wbx#protocol#reaction_name(value) abort
  if type(a:value) != v:t_string || empty(a:value) || strlen(a:value) > 256 | return 0 | endif
  if has_key(s:reactions,a:value) | return 1 | endif
  " Native Vim has no RGI property. The backend checks the exact Unicode sequence.
  let points = str2list(a:value,1)
  if index([35,42]+range(48,57),points[0]) >= 0
    return len(points) == 2 && points[1] == 0x20e3 || len(points) == 3 && points[1:] == [0xfe0f,0x20e3]
  endif
  let emoji = 0
  for point in points
    if point >= 0x1f000 && point <= 0x1faff || point >= 0x2300 && point <= 0x27ff
          \ || point >= 0x2190 && point <= 0x21ff || point >= 0x2b00 && point <= 0x2bff
          \ || index([0xa9,0xae,0x203c,0x2049,0x2122,0x2139,0x2934,0x2935,0x3030,0x303d,0x3297,0x3299],point) >= 0
      let emoji = 1
    elseif index([0x200d,0xfe0e,0xfe0f],point) < 0 && !(point >= 0xe0020 && point <= 0xe007f)
      return 0
    endif
  endfor
  return emoji
endfunction
function! wbx#protocol#reaction_label(reaction) abort
  return get(s:reactions,a:reaction,a:reaction)
endfunction
function! wbx#protocol#reaction_failure(value) abort
  if type(a:value) != v:t_string | return 0 | endif
  let parts = split(a:value,':',1)
  return len(parts) == 2 && s:enum(parts[0],['admission','context','worker','identity','actor','message','conversation','parent','summary'])
        \ && s:enum(parts[1],['busy','unverified','denied','not-found','rate-limited','network','timeout','unavailable'])
endfunction
function! wbx#protocol#reaction_read_error(response) abort
  " Retain only a finite category. No provider text, body, URL or ID escapes.
  let message = get(get(a:response,'error',{}),'message','')
  let match = type(message) == v:t_string ? matchlist(message,'^Reaction summary unavailable (\([a-z-]\+:[a-z-]\+\))\.') : []
  return len(match) > 1 && wbx#protocol#reaction_failure(match[1]) ? match[1] : 'summary:unavailable'
endfunction
function! wbx#protocol#reaction_context(value) abort
  let v = a:value
  return type(v) == v:t_dict && s:string(get(v, 'contextId', v:null), 32) && v.contextId =~# '^[a-f0-9]\{32}$'
        \ && s:id(get(v, 'roomId', v:null)) && s:id(get(v, 'messageId', v:null))
        \ && s:enum(get(v, 'action', v:null), ['add', 'remove']) && wbx#protocol#reaction_name(get(v, 'reaction', v:null))
        \ && get(v, 'label', v:null) ==# wbx#protocol#reaction_label(v.reaction)
        \ && s:integer(get(v, 'expiresAt', v:null), 1, 9007199254740991)
        \ && empty(filter(keys(v), 'index(["contextId", "roomId", "messageId", "action", "reaction", "label", "expiresAt"], v:val) < 0'))
endfunction
function! wbx#protocol#reaction_outcome(value) abort
  let v = a:value
  return type(v) == v:t_dict && s:string(get(v, 'contextId', v:null), 32) && v.contextId =~# '^[a-f0-9]\{32}$'
        \ && s:string(get(v, 'requestId', v:null), 64) && v.requestId =~# '^[A-Za-z0-9_-]\{1,64}$'
        \ && s:id(get(v, 'roomId', v:null)) && s:id(get(v, 'messageId', v:null))
        \ && s:enum(get(v, 'action', v:null), ['add', 'remove']) && s:enum(get(v, 'status', v:null), ['changed', 'failed', 'unknown'])
        \ && s:string(get(v, 'notice', v:null), 4096) && v.notice !~# s:people_unsafe
        \ && empty(filter(keys(v), 'index(["contextId", "requestId", "roomId", "messageId", "action", "status", "notice"], v:val) < 0'))
endfunction
function! wbx#protocol#reactions(value) abort
  let v = a:value
  if type(v) != v:t_dict || !s:id(get(v, 'roomId', v:null)) || !s:id(get(v, 'messageId', v:null))
        \ || !s:integer(get(v, 'observedAt', v:null), 0, 9007199254740991)
        \ || type(get(v, 'partial', v:null)) != v:t_bool || type(get(v, 'unknown', v:null)) != v:t_bool
        \ || type(get(v, 'groups', v:null)) != v:t_list || len(v.groups) > 16
        \ || !empty(filter(keys(v), 'index(["roomId", "messageId", "observedAt", "partial", "unknown", "groups"], v:val) < 0')) | return 0 | endif
  let seen = {}
  for g in v.groups
    if type(g) != v:t_dict || !wbx#protocol#reaction_name(get(g, 'reaction', v:null))
          \ || get(g, 'label', v:null) !=# wbx#protocol#reaction_label(g.reaction) || has_key(seen, g.reaction)
          \ || has_key(g, 'count') && !s:integer(g.count, 0, 9007199254740991)
          \ || has_key(g, 'mine') && (type(g.mine) != v:t_bool || !g.mine)
          \ || has_key(g, 'own') && (!s:string(g.own, 32) || g.own !~# '^[a-f0-9]\{32}$')
          \ || !empty(filter(keys(g), 'index(["reaction", "label", "count", "mine", "own"], v:val) < 0')) | return 0 | endif
    let seen[g.reaction] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#reaction_details(value) abort
  let v = a:value
  if type(v) != v:t_dict || sort(filter(keys(v),'v:val !=# "activityReadFailure"')) !=# ['actors','partial','snapshot']
        \ || has_key(v,'activityReadFailure') && !wbx#protocol#reaction_failure(v.activityReadFailure)
        \ || type(v.partial) != v:t_bool || !v.partial || !wbx#protocol#reactions(v.snapshot)
        \ || type(v.actors) != v:t_list || len(v.actors) > 10 | return 0 | endif
  for group in v.snapshot.groups | if has_key(group,'own') | return 0 | endif | endfor
  let seen = {}
  let reactions = map(copy(v.snapshot.groups),'v:val.reaction')
  for actor in v.actors
    if type(actor) != v:t_dict || index(reactions,get(actor,'reaction',0)) < 0
          \ || !s:id(get(actor,'personId',v:null)) || actor.personId ==# 'me'
          \ || has_key(actor,'name') && !s:sender_name(actor.name)
          \ || !empty(filter(keys(actor),'index(["reaction","personId","name"],v:val) < 0')) | return 0 | endif
    let key = json_encode([actor.reaction,actor.personId])
    if has_key(seen,key) | return 0 | endif
    let seen[key] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#reaction_batch(value) abort
  let v = a:value
  if type(v) != v:t_dict || sort(keys(v)) !=# ['items','roomId'] || !s:id(v.roomId)
        \ || type(v.items) != v:t_list || empty(v.items) || len(v.items) > 8 | return 0 | endif
  let seen = {}
  for item in v.items
    if type(item) != v:t_dict || !s:id(get(item,'messageId',v:null)) || has_key(seen,item.messageId) | return 0 | endif
    if has_key(item,'reason')
      if sort(keys(item)) !=# ['messageId','reason'] || !wbx#protocol#reaction_failure(item.reason) | return 0 | endif
    elseif !wbx#protocol#reactions(item) || item.roomId !=# v.roomId
      return 0
    endif
    let seen[item.messageId] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#reaction_progress(value) abort
  if type(a:value) != v:t_dict || sort(keys(a:value)) !=# ['requestId','snapshot']
        \ || !s:integer(a:value.requestId,1,2147483647) || !wbx#protocol#reactions(a:value.snapshot) | return 0 | endif
  for group in a:value.snapshot.groups | if has_key(group,'own') | return 0 | endif | endfor
  return 1
endfunction
function! wbx#protocol#message_context(value) abort
  let v = a:value
  return type(v) == v:t_dict && s:string(get(v, 'contextId', v:null), 32) && v.contextId =~# '^[a-f0-9]\{32}$'
        \ && s:id(get(v, 'roomId', v:null)) && s:id(get(v, 'messageId', v:null))
        \ && s:enum(get(v, 'action', v:null), ['edit', 'delete']) && s:enum(get(v, 'format', v:null), ['plain', 'markdown'])
        \ && s:string(get(v, 'content', v:null), 4000) && strchars(v.content) <= 1000
        \ && s:integer(get(v, 'expiresAt', v:null), 1, 9007199254740991)
        \ && empty(filter(keys(v), 'index(["contextId", "roomId", "messageId", "action", "content", "format", "expiresAt"], v:val) < 0'))
endfunction
function! wbx#protocol#mutation(value) abort
  let v = a:value
  return type(v) == v:t_dict && s:string(get(v, 'contextId', v:null), 32) && v.contextId =~# '^[a-f0-9]\{32}$'
        \ && s:string(get(v, 'requestId', v:null), 64) && v.requestId =~# '^[A-Za-z0-9_-]\{1,64}$'
        \ && s:id(get(v, 'roomId', v:null)) && s:id(get(v, 'messageId', v:null))
        \ && s:enum(get(v, 'action', v:null), ['edit', 'delete']) && s:enum(get(v, 'status', v:null), ['changed', 'failed', 'unknown', 'conflict'])
        \ && s:integer(get(v, 'revision', v:null), 0, 9007199254740991) && s:string(get(v, 'notice', v:null), 4096)
        \ && empty(filter(keys(v), 'index(["requestId", "contextId", "roomId", "messageId", "action", "revision", "status", "notice"], v:val) < 0'))
endfunction
function! wbx#protocol#members(value) abort
  let v = a:value
  if type(v) != v:t_dict || !s:id(get(v, 'roomId', v:null)) || !s:integer(get(v, 'revision', v:null), 0, 9007199254740991)
        \ || !s:enum(get(v, 'state', v:null), ['empty', 'ready', 'failed']) || type(get(v, 'partial', v:null)) != v:t_bool
        \ || type(get(v, 'more', v:null)) != v:t_bool || type(get(v, 'items', v:null)) != v:t_list || len(v.items) > 500
        \ || !empty(filter(keys(v), 'index(["roomId", "revision", "state", "partial", "more", "items"], v:val) < 0')) | return 0 | endif
  let seen = {}
  for item in v.items
    if type(item) != v:t_dict || !s:id(get(item, 'id', v:null)) || !s:id(get(item, 'personId', v:null))
          \ || !s:sender_name(get(item, 'label', v:null)) || type(get(item, 'moderator', v:null)) != v:t_bool
          \ || has_key(seen, item.id) || !empty(filter(keys(item), 'index(["id", "personId", "label", "moderator"], v:val) < 0')) | return 0 | endif
    let seen[item.id] = 1
  endfor
  return 1
endfunction
function! wbx#protocol#member_visibility(value) abort
  let v = a:value
  return type(v) == v:t_dict && len(v) == 5 && strlen(json_encode(v)) <= 4096
        \ && wbx#protocol#local_context({'sessionId': get(v, 'sessionId', v:null), 'coverage': 'session-only'})
        \ && s:id(get(v, 'roomId', v:null)) && get(v, 'coverage', v:null) is# 'own-direct-membership-flag'
        \ && s:integer(get(v, 'observedAt', v:null), 1, 9007199254740991)
        \ && has_key(v, 'isRoomHidden') && (v.isRoomHidden is v:null || type(v.isRoomHidden) == v:t_bool)
        \ && empty(filter(keys(v), 'index(["sessionId", "roomId", "coverage", "observedAt", "isRoomHidden"], v:val) < 0'))
endfunction
function! wbx#protocol#recipient(value) abort
  let v = a:value
  return type(v) == v:t_dict && s:string(get(v, 'targetId', v:null), 32) && v.targetId =~# '^[a-f0-9]\{32}$'
        \ && s:id(get(v, 'personId', v:null)) && s:sender_name(get(v, 'label', v:null))
        \ && s:integer(get(v, 'expiresAt', v:null), 1, 9007199254740991)
        \ && (!has_key(v, 'roomId') || s:id(v.roomId))
        \ && empty(filter(keys(v), 'index(["targetId", "personId", "label", "expiresAt", "roomId"], v:val) < 0'))
endfunction
function! wbx#protocol#conversation(value) abort
  let v = a:value
  if type(v) == v:t_dict && get(v, 'action', '') ==# 'team-describe'
    return len(v) == 8 && strlen(json_encode(v)) <= 16384
          \ && s:string(get(v, 'requestId', v:null), 64) && v.requestId =~# '^[A-Za-z0-9_-]\{1,64}$'
          \ && s:enum(get(v, 'status', v:null), ['changed', 'failed', 'conflict', 'unknown']) && s:string(get(v, 'notice', v:null), 4096)
          \ && s:id(get(v, 'teamId', v:null)) && wbx#protocol#space_title(get(v, 'expectedName', v:null))
          \ && wbx#protocol#description_text(get(v, 'expectedDescription', v:null), 0)
          \ && wbx#protocol#description_text(get(v, 'description', v:null), 1) && v.expectedDescription !=# v.description
          \ && empty(filter(keys(v), 'index(["requestId", "action", "status", "notice", "teamId", "expectedName", "expectedDescription", "description"], v:val) < 0'))
  endif
  if type(v) == v:t_dict && get(v, 'action', '') ==# 'team-rename'
    return len(v) == 7 && strlen(json_encode(v)) <= 16384
          \ && s:string(get(v, 'requestId', v:null), 64) && v.requestId =~# '^[A-Za-z0-9_-]\{1,64}$'
          \ && s:enum(get(v, 'status', v:null), ['changed', 'failed', 'conflict', 'unknown']) && s:string(get(v, 'notice', v:null), 4096)
          \ && s:id(get(v, 'teamId', v:null)) && wbx#protocol#space_title(get(v, 'expectedName', v:null))
          \ && wbx#protocol#space_title(get(v, 'name', v:null)) && v.expectedName !=# v.name
          \ && empty(filter(keys(v), 'index(["requestId", "action", "status", "notice", "teamId", "expectedName", "name"], v:val) < 0'))
  endif
  return type(v) == v:t_dict && s:string(get(v, 'requestId', v:null), 64) && v.requestId =~# '^[A-Za-z0-9_-]\{1,64}$'
        \ && s:enum(get(v, 'action', v:null), ['create', 'invite', 'remove', 'leave', 'direct', 'rename', 'describe', 'lock', 'announcement', 'description-clear'])
        \ && s:enum(get(v, 'status', v:null), ['changed', 'failed', 'unknown', 'conflict']) && s:string(get(v, 'notice', v:null), 4096)
        \ && (v.status !=# 'conflict' || index(['rename', 'describe', 'lock', 'announcement', 'description-clear'], v.action) >= 0)
        \ && (index(['rename', 'describe', 'lock', 'announcement', 'description-clear'], v.action) >= 0 ? s:id(get(v, 'roomId', v:null))
        \     && wbx#protocol#space_title(get(v, 'expectedTitle', v:null)) : !has_key(v, 'expectedTitle'))
        \ && (v.action ==# 'rename' ? wbx#protocol#space_title(get(v, 'title', v:null))
        \     && v.expectedTitle !=# v.title : !has_key(v, 'title'))
        \ && (index(['describe', 'description-clear'], v.action) >= 0
        \     ? wbx#protocol#description_text(get(v, 'expectedDescription', v:null), v.action ==# 'description-clear')
        \     && strlen(json_encode(v)) <= 16384 : !has_key(v, 'expectedDescription'))
        \ && (v.action ==# 'describe' ? wbx#protocol#description_text(get(v, 'description', v:null), 1)
        \     && v.expectedDescription !=# v.description : !has_key(v, 'description'))
        \ && (v.action ==# 'lock' ? type(get(v, 'expectedLocked', v:null)) == v:t_bool
        \     && type(get(v, 'locked', v:null)) == v:t_bool && v.expectedLocked != v.locked
        \     : !has_key(v, 'expectedLocked') && !has_key(v, 'locked'))
        \ && (v.action ==# 'announcement' ? type(get(v, 'expectedAnnouncementOnly', v:null)) == v:t_bool
        \     && type(get(v, 'announcementOnly', v:null)) == v:t_bool && v.expectedAnnouncementOnly != v.announcementOnly
        \     : !has_key(v, 'expectedAnnouncementOnly') && !has_key(v, 'announcementOnly'))
        \ && (!has_key(v, 'roomId') || s:id(v.roomId))
        \ && (v.status !=# 'changed' || has_key(v, 'roomId'))
        \ && (!has_key(v, 'messageId') || v.action ==# 'direct' && v.status ==# 'changed' && s:id(v.messageId))
        \ && (v.action !=# 'direct' || s:string(get(v, 'targetId', v:null), 32) && v.targetId =~# '^[a-f0-9]\{32}$'
        \     && s:string(get(v, 'draftId', v:null), 64) && v.draftId =~# '^[A-Za-z0-9_-]\{1,64}$' && (v.status !=# 'changed' || has_key(v, 'messageId')))
        \ && (v.action ==# 'direct' || !has_key(v, 'targetId') && !has_key(v, 'draftId'))
        \ && (!has_key(v, 'format') || v.action ==# 'direct' && v.format ==# 'markdown')
        \ && (!has_key(v, 'attachmentId') || v.action ==# 'direct' && s:string(v.attachmentId, 32) && v.attachmentId =~# '^[a-f0-9]\{32}$')
        \ && (!has_key(v, 'text') || v.action ==# 'direct' && s:string(v.text, 4000))
        \ && (!(has_key(v, 'format') || has_key(v, 'attachmentId')) || has_key(v, 'text'))
        \ && empty(filter(keys(v), 'index(["requestId", "action", "status", "notice", "roomId", "messageId", "targetId", "draftId", "format", "attachmentId", "text", "expectedTitle", "title", "expectedDescription", "description", "expectedLocked", "locked", "expectedAnnouncementOnly", "announcementOnly"], v:val) < 0'))
endfunction
function! wbx#protocol#team_rename_preparation(value) abort
  let v = a:value
  return type(v) == v:t_dict && len(v) == 5 && strlen(json_encode(v)) <= 4096
        \ && wbx#protocol#local_context({'sessionId': get(v, 'sessionId', v:null), 'coverage': 'session-only'})
        \ && s:id(get(v, 'teamId', v:null)) && s:integer(get(v, 'revision', v:null), 1, 9007199254740991)
        \ && s:integer(get(v, 'observedAt', v:null), 1, 9007199254740991)
        \ && wbx#protocol#space_title(get(v, 'expectedName', v:null))
        \ && empty(filter(keys(v), 'index(["sessionId", "teamId", "revision", "observedAt", "expectedName"], v:val) < 0'))
endfunction
function! wbx#protocol#team_description(value) abort
  let v = a:value
  return type(v) == v:t_dict && len(v) == 6 && strlen(json_encode(v)) <= 16384
        \ && wbx#protocol#local_context({'sessionId': get(v, 'sessionId', v:null), 'coverage': 'session-only'})
        \ && s:id(get(v, 'teamId', v:null)) && s:integer(get(v, 'revision', v:null), 1, 9007199254740991)
        \ && s:integer(get(v, 'observedAt', v:null), 1, 9007199254740991)
        \ && wbx#protocol#space_title(get(v, 'expectedName', v:null))
        \ && wbx#protocol#description_text(get(v, 'expectedDescription', v:null), 0)
        \ && empty(filter(keys(v), 'index(["sessionId", "teamId", "revision", "observedAt", "expectedName", "expectedDescription"], v:val) < 0'))
endfunction
function! wbx#protocol#teams(value) abort
  let v = a:value
  if type(v) != v:t_dict || !s:integer(get(v, 'revision', v:null), 0, 9007199254740991)
        \ || type(get(v, 'more', v:null)) != v:t_bool || get(v, 'partial', v:null) isnot v:true
        \ || type(get(v, 'items', v:null)) != v:t_list || len(v.items) > 8
        \ || !empty(filter(keys(v), 'index(["revision", "more", "partial", "items"], v:val) < 0')) | return 0 | endif
  let ids = {} | let rooms = {}
  for item in v.items
    if type(item) != v:t_dict || !s:id(get(item, 'id', v:null)) || has_key(ids, item.id)
          \ || !s:sender_name(get(item, 'label', v:null)) || !s:enum(get(item, 'state', v:null), ['known', 'unavailable', 'not-loaded'])
          \ || type(get(item, 'roomIds', v:null)) != v:t_list || len(item.roomIds) > 500
          \ || !empty(filter(keys(item), 'index(["id", "label", "state", "roomIds"], v:val) < 0')) | return 0 | endif
    let ids[item.id] = 1
    for id in item.roomIds
      if !s:id(id) || has_key(rooms, id) | return 0 | endif
      let rooms[id] = 1
    endfor
  endfor
  return len(rooms) <= 500
endfunction
function! s:upload_progress(value) abort
  let value = a:value
  return type(value) == v:t_dict
        \ && (has_key(value, 'targetId') ? !has_key(value, 'roomId') && !has_key(value, 'parentId')
        \     && s:string(value.targetId, 32) && value.targetId =~# '^[a-f0-9]\{32}$'
        \     : s:id(get(value, 'roomId', v:null)) && (!has_key(value, 'parentId') || s:id(value.parentId)))
        \ && s:string(get(value, 'draftId', v:null), 64) && value.draftId =~# '^[A-Za-z0-9_-]\{1,64}$'
        \ && s:string(get(value, 'attachmentId', v:null), 32) && value.attachmentId =~# '^[a-f0-9]\{32}$'
        \ && s:enum(get(value, 'phase', v:null), ['stage', 'send'])
        \ && s:integer(get(value, 'total', v:null), 0, 10485760) && s:integer(get(value, 'bytes', v:null), 0, value.total)
        \ && empty(filter(keys(value), 'index(["roomId", "parentId", "targetId", "draftId", "attachmentId", "phase", "bytes", "total"], v:val) < 0'))
endfunction
function! s:delivery(value) abort
  return type(a:value) == v:t_dict
        \ && s:string(get(a:value, 'requestId', v:null), 64) && a:value.requestId =~# '^[A-Za-z0-9_-]\+$'
        \ && s:id(get(a:value, 'roomId', v:null))
        \ && (!has_key(a:value, 'parentId') || s:id(a:value.parentId))
        \ && (!has_key(a:value, 'messageId') || get(a:value, 'status', '') ==# 'sent' && s:id(a:value.messageId))
        \ && (!has_key(a:value, 'attachmentId') || s:string(a:value.attachmentId, 32) && a:value.attachmentId =~# '^[a-f0-9]\{32}$'
        \     && s:string(get(a:value, 'draftId', v:null), 64) && a:value.draftId =~# '^[A-Za-z0-9_-]\{1,64}$')
        \ && (!has_key(a:value, 'format') || a:value.format ==# 'markdown'
        \     && s:string(get(a:value, 'draftId', v:null), 64) && a:value.draftId =~# '^[A-Za-z0-9_-]\{1,64}$')
        \ && (!has_key(a:value, 'text') || s:string(a:value.text, 4000))
        \ && (!(has_key(a:value, 'format') && has_key(a:value, 'attachmentId')) || s:string(get(a:value, 'text', v:null), 4000))
        \ && (!has_key(a:value, 'draftId') || has_key(a:value, 'attachmentId') || has_key(a:value, 'format'))
        \ && s:enum(get(a:value, 'status', v:null), ['sent', 'failed', 'unknown'])
        \ && s:string(get(a:value, 'message', v:null), 65536)
endfunction
function! s:meeting_event(value) abort
  if type(a:value) != v:t_dict || type(get(a:value, 'type', v:null)) != v:t_string
    return 0
  endif
  let kind = a:value.type
  if kind ==# 'status'
    return s:enum(get(a:value, 'state', v:null), ['ready', 'demo', 'registering', 'joining', 'lobby', 'negotiating', 'connected', 'ended', 'failed'])
  elseif kind ==# 'send-state'
    return s:enum(get(a:value, 'kind', v:null), ['microphone', 'camera', 'screen'])
          \ && s:enum(get(a:value, 'state', v:null), ['off', 'awaiting', 'starting', 'on'])
          \ && s:integer(get(a:value, 'requestId', v:null), 0, 4294967295)
          \ && (!has_key(a:value, 'reason') || s:enum(a:value.reason, ['denied', 'unavailable', 'busy', 'unsupported', 'failed', 'ended', 'not-connected', 'host-muted']))
  elseif kind ==# 'sources'
    if type(get(a:value, 'sources', v:null)) != v:t_list || len(a:value.sources) > 16
      return 0
    endif
    let seen = {}
    for source in a:value.sources
      if type(source) != v:t_dict || !s:string(get(source, 'label', v:null), 4096)
            \ || !s:enum(get(source, 'id', v:null), s:sources)
            \ || !s:enum(get(source, 'kind', v:null), ['mock', 'video', 'share', 'local'])
            \ || type(get(source, 'available', v:null)) != v:t_bool || has_key(seen, source.id)
            \ || !s:flags(source, ['available', 'present'])
            \ || (has_key(source, 'generation') && !s:integer(source.generation, 0, 4294967295))
        return 0
      endif
      let seen[source.id] = 1
    endfor
    return 1
  elseif kind ==# 'audio-state'
    return type(get(a:value, 'enabled', v:null)) == v:t_bool
  elseif kind ==# 'camera-state'
    return s:enum(get(a:value, 'state', v:null), ['off', 'starting', 'on'])
          \ && get(a:value, 'sending', v:null) is v:false
          \ && s:integer(get(a:value, 'requestId', v:null), 0, 4294967295)
          \ && (!has_key(a:value, 'reason') || s:enum(a:value.reason, ['denied', 'unavailable', 'busy', 'unsupported', 'failed', 'ended']))
  elseif kind ==# 'auth-state'
    return s:enum(get(a:value, 'method', v:null), ['token', 'oauth'])
          \ && s:enum(get(a:value, 'state', v:null), ['ready', 'refreshing', 'failed'])
          \ && (!has_key(a:value, 'expiresAt') || s:integer(a:value.expiresAt, 1, 8640000000000000))
          \ && (!has_key(a:value, 'reason') || s:enum(a:value.reason, ['denied', 'expired', 'failed', 'canceled']))
  elseif kind ==# 'presentation'
    return s:enum(get(a:value, 'renderer', v:null), ['kitty', 'blocks'])
  elseif kind ==# 'notice'
    return s:string(get(a:value, 'message', v:null), 65536)
  endif
  return 0
endfunction

function! wbx#protocol#drafts(value, contents) abort
  let value = a:value
  if type(value) != v:t_dict || sort(keys(value)) !=# (a:contents ? ['items', 'profile', 'revision', 'sessionId'] : ['profile', 'revision', 'sessionId'])
        \ || type(value.sessionId) != v:t_string || value.sessionId !~# '^[a-f0-9]\{32}$'
        \ || type(value.profile) != v:t_string || value.profile !~# '^[a-f0-9]\{64}$'
        \ || type(value.revision) != v:t_string || value.revision !~# '^[a-f0-9]\{64}$' | return 0 | endif
  if !a:contents | return 1 | endif
  if type(value.items) != v:t_list || len(value.items) > 64 | return 0 | endif
  let seen = {}
  for item in value.items
    if type(item) != v:t_dict || !empty(filter(keys(item), 'index(["roomId", "parentId", "text", "format", "uncertain"], v:val) < 0'))
          \ || !s:id(get(item, 'roomId', v:null)) || has_key(item, 'parentId') && !s:id(item.parentId)
          \ || !s:string(get(item, 'text', v:null), 262144) || !s:enum(get(item, 'format', v:null), ['plain', 'markdown'])
          \ || type(get(item, 'uncertain', v:null)) != v:t_bool | return 0 | endif
    let key = json_encode([item.roomId, get(item, 'parentId', '')])
    if has_key(seen, key) | return 0 | endif
    let seen[key] = 1
  endfor
  return strlen(json_encode(value)) <= 1048576
endfunction
function! wbx#protocol#hello(value) abort
  try
    return wbx#features#valid(a:value) && get(a:value, 'version', v:null) is# 1
          \ && s:state(get(a:value, 'state', v:null)) && s:meeting(get(a:value, 'meeting', v:null))
  catch
    return 0
  endtry
endfunction
function! wbx#protocol#valid(value) abort
  try
    if type(a:value) != v:t_dict || get(a:value, 'jsonrpc', v:null) isnot# '2.0'
      return 0
    endif
    if has_key(a:value, 'id')
      if !s:integer(a:value.id, 1, 2147483647) || has_key(a:value, 'method') || has_key(a:value, 'params')
            \ || has_key(a:value, 'result') == has_key(a:value, 'error')
        return 0
      endif
      if has_key(a:value, 'error')
        return type(a:value.error) == v:t_dict
              \ && s:integer(get(a:value.error, 'code', v:null), -2147483648, 2147483647)
              \ && s:string(get(a:value.error, 'message', v:null), 65536)
      endif
      return 1
    endif
    if has_key(a:value, 'result') || has_key(a:value, 'error') || type(get(a:value, 'method', v:null)) != v:t_string
      return 0
    endif
    let params = get(a:value, 'params', v:null)
    if a:value.method ==# 'state'
      return s:state(params)
    elseif a:value.method ==# 'messages.reactionProgress'
      return wbx#protocol#reaction_progress(params)
    elseif a:value.method ==# 'messages.readersChanged'
      return type(params) == v:t_dict && sort(keys(params)) ==# ['roomId','sessionId','sourceEpoch','sourceRevision']
            \ && s:id(params.roomId) && s:string(params.sessionId,32) && params.sessionId =~# '^[a-f0-9]\{32}$'
            \ && s:integer(params.sourceEpoch,0,9007199254740991) && s:integer(params.sourceRevision,0,9007199254740991)
    elseif a:value.method ==# 'meeting'
      return s:meeting(params)
    elseif a:value.method ==# 'delivery'
      return s:delivery(params)
    elseif a:value.method ==# 'upload.progress'
      return s:upload_progress(params)
    elseif a:value.method ==# 'uploads.invalidated'
      return type(params) == v:t_dict && empty(params)
    elseif a:value.method ==# 'direct.delivery'
      return wbx#protocol#conversation(params) && params.action ==# 'direct'
    elseif a:value.method ==# 'room.revoked'
      return type(params) == v:t_dict && keys(params) ==# ['roomId'] && s:id(params.roomId)
    elseif a:value.method ==# 'meeting.event'
      return s:meeting_event(params)
    elseif a:value.method ==# 'notice'
      return type(params) == v:t_dict && s:string(get(params, 'message', v:null), 65536)
    endif
    return 0
  catch
    " A malformed shape must be data rejection, never an editor callback error.
    return 0
  endtry
endfunction

let &cpoptions = s:save_cpo
unlet s:save_cpo
