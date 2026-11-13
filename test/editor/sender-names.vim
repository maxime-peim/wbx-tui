" Names may enrich only a matching queued event, never replay an already sent alert.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
let $TZ = 'UTC'
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_notification_records = []
if has('nvim')
  lua vim.notify = function(body, _, opts) local log=vim.g.wbx_notification_records;log[#log+1]={body=body,title=opts.title};vim.g.wbx_notification_records=log end
endif
let s:audit = $WBX_EDITOR_RESULT . '.names'
call writefile([], s:audit)
let s:notifier = $WBX_EDITOR_RESULT . '.notifier.mjs'
call writefile(["import{appendFileSync,existsSync}from'node:fs';appendFileSync(process.argv[2],JSON.stringify({title:process.argv[3],body:process.argv[4]})+'\\n');if(existsSync(process.argv[2]+'.fail'))setTimeout(()=>process.exit(1),400);"], s:notifier)
let g:wbx_tui = {'backend': ['/bin/false'], 'images': 0, 'mark_read_on_open': 0, 'upcoming_meetings': 0,
      \ 'notifications': {'mode': 'desktop', 'sender_names': 1, 'suppress_visible': 0, 'command': [$WBX_NODE, s:notifier, s:audit]}}
let s:state = {'revision': 0, 'state': 'ready', 'mode': 'demo', 'ready': v:false, 'senderNames': v:true, 'room': v:null, 'messages': [],
      \ 'rooms': [{'id': 'other', 'title': 'Synthetic other', 'type': 'group'}],
      \ 'messageEvents': {'state': 'live', 'received': 0, 'preview': v:true, 'senderNames': v:true, 'items': []}}
function! s:publish() abort
  let s:state.revision += 1
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': s:state}))
  call wbx#notifications#observe(deepcopy(s:state))
endfunction
function! s:event(id, text, ...) abort
  return extend({'id': a:id, 'roomId': 'other', 'created': strftime('%Y-%m-%dT%H:%M:%S.000Z', localtime()),
        \ 'observedAt': localtime() * 1000, 'self': v:false, 'preview': a:text}, a:0 ? {'senderName': a:1} : {})
endfunction
function! s:sent(number) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if wbx#notifications#status().submitted.desktop >= a:number
      return json_decode(readfile(s:audit)[-1]).body
    endif
    sleep 10m
  endwhile
  throw 'Synthetic sender notifier timeout'
endfunction
try
  let invalid = deepcopy(s:state)
  let invalid.messageEvents.items = [s:event('invalid', 'Excerpt', "Unsafe\nName")]
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': invalid}))
  let invalid.messageEvents.items = [extend(s:event('invalid', 'Excerpt'), {'senderId': 'must-stay-in-Node'})]
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': invalid}))
  let invalid.messageEvents.items = [s:event('invalid', 'Excerpt', 'Alice')]
  let invalid.messageEvents.senderNames = v:false
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': invalid}))
  let invalid.messageEvents.senderNames = v:true
  let invalid.messageEvents.items[0].senderName = repeat('😀', 120)
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': invalid}))
  let invalid.messageEvents.items[0].senderName .= '😀'
  call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': invalid}))
  call s:publish()
  let s:state.messageEvents.items = [s:event('first', 'First excerpt')]
  let s:state.messageEvents.received = 1
  call s:publish()
  let s:state.messageEvents.items[0].senderName = 'Alice <tag> & literal'
  call s:publish()
  call assert_equal('Alice <tag> & literal: First excerpt', s:sent(1))
  call s:publish()
  sleep 300m
  call assert_equal(1, len(readfile(s:audit)), 'a late name snapshot is not another creation')

  call add(s:state.messageEvents.items, s:event('second', 'Second excerpt', 'Bob'))
  let s:state.messageEvents.received += 1
  call s:publish()
  call add(s:state.messageEvents.items, s:event('third', 'Third excerpt'))
  let s:state.messageEvents.received += 1
  call s:publish()
  let s:state.messageEvents.items[1].senderName = 'Changed Bob'
  call s:publish()
  call assert_equal('Third excerpt', s:sent(2), 'coalescing never pairs an earlier sender with a later excerpt')
  let s:state.messageEvents.items[2].senderName = 'Carol'
  call s:publish()
  sleep 300m
  call assert_equal(2, len(readfile(s:audit)), 'a post-dispatch lookup cannot replay the alert')

  call add(s:state.messageEvents.items, s:event('fourth', 'Fourth excerpt', 'Dora'))
  let s:state.messageEvents.received += 1
  call s:publish()
  let g:wbx_tui.notifications.sender_names = 0
  call assert_equal('Fourth excerpt', s:sent(3), 'name opt-out is rechecked at dispatch')
  let g:wbx_tui.notifications.sender_names = 1
  call add(s:state.messageEvents.items, s:event('fifth', 'Fifth excerpt', 'Eve'))
  let s:state.messageEvents.received += 1
  call s:publish()
  let g:wbx_tui.notifications.preview = 0
  call assert_equal('New message', s:sent(4), 'preview opt-out hides both name and excerpt')
  let g:wbx_tui.notifications.preview = 1
  call add(s:state.messageEvents.items, s:event('sixth', 'Sixth excerpt', 'Frank'))
  let s:state.messageEvents.received += 1
  call s:publish()
  let s:state.senderNames = v:false
  let s:state.messageEvents.senderNames = v:false
  for item in s:state.messageEvents.items | if has_key(item, 'senderName') | call remove(item, 'senderName') | endif | endfor
  call s:publish()
  call assert_equal('Sixth excerpt', s:sent(5), 'backend name revocation strips already queued labels')
  call assert_notmatch('Alice\|Frank\|excerpt', string(wbx#notifications#status()), 'health has no names/excerpts')

  " Backend revocation must also protect fallback from an already-running tool;
  " the plugin cannot recall that tool's original argv or a submitted OS alert.
  call writefile([], s:audit . '.fail')
  let s:state.senderNames = v:true
  let s:state.messageEvents.senderNames = v:true
  call add(s:state.messageEvents.items, s:event('seventh', 'Seventh excerpt', 'Greta'))
  let s:state.messageEvents.received += 1
  let editor_before = wbx#notifications#status().submitted.editor
  call s:publish()
  let start = reltime()
  while !wbx#notifications#status().active && reltimefloat(reltime(start)) < 3 | sleep 10m | endwhile
  call assert_true(wbx#notifications#status().active)
  let s:state.senderNames = v:false
  let s:state.messageEvents.senderNames = v:false
  call remove(s:state.messageEvents.items[-1], 'senderName')
  call s:publish()
  let start = reltime()
  while wbx#notifications#status().submitted.editor == editor_before && reltimefloat(reltime(start)) < 3 | sleep 10m | endwhile
  call assert_equal(editor_before + 1, wbx#notifications#status().submitted.editor)
  if has('nvim') | call assert_equal('Seventh excerpt', g:wbx_notification_records[-1].body, 'fallback rechecks backend name consent') | endif

  " Actual native rendering still treats name changes as presentation, not writes
  " authorized to discard user annotations or trigger a backend/receipt.
  call wbx#buffers()
  let sid = filter(getscriptinfo(), 'v:val.name =~# "/autoload/wbx.vim$"')[0].sid
  call call(function('<SNR>' . sid . '_layout'), [])
  let s:state.senderNames = v:true
  let s:state.room = deepcopy(s:state.rooms[0])
  let s:state.ready = v:true
  let s:state.messages = [{'id': 'history', 'author': 'Grace', 'senderName': 'Grace', 'created': '', 'text': 'Synthetic body'}]
  let s:state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': deepcopy(s:state)})
  let history = wbx#buffers().history
  call assert_match('Grace', join(getbufline(history, 1, '$'), "\n"))
  call setbufvar(history, '&modifiable', 1)
  call setbufline(history, 1, 'Private native annotation')
  let s:state.messages[0].author = 'Renamed Grace'
  let s:state.messages[0].senderName = 'Renamed Grace'
  let s:state.revision += 1
  call wbx#_receive({'jsonrpc': '2.0', 'method': 'state', 'params': deepcopy(s:state)})
  call assert_equal('Private native annotation', getbufline(history, 1)[0])
  call assert_false(wbx#transport#running())
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#notifications#stop()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
