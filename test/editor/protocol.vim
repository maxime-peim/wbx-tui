set encoding=utf-8 hidden noswapfile
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let g:wbx_tui = {'demo': 1, 'backend': [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs']}
let g:wbx_protocol_disconnects = 0
augroup wbx_protocol_test
  autocmd!
  autocmd User WbxDisconnected let g:wbx_protocol_disconnects += 1
augroup END
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression)
      return
    endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! OpenFixture(mode) abort
  let g:wbx_tui.backend = [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs', a:mode]
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select('fixture-room')
  call WaitFor('wbx#state().ready')
  WebexCompose
endfunction
try
  let state = {'revision': 0, 'state': 'idle', 'mode': 'demo', 'rooms': [], 'messages': [], 'room': v:null, 'ready': v:false}
  let meeting = {'active': v:false, 'ready': v:false}
  call assert_true(wbx#protocol#hello({'version': 1, 'state': state, 'meeting': meeting}))
  call assert_false(wbx#protocol#hello({'version': v:true, 'state': state, 'meeting': meeting}))
  call assert_false(wbx#protocol#hello({'version': 1, 'state': [], 'meeting': meeting}))
  call assert_false(wbx#protocol#hello({'version': 1, 'state': state, 'meeting': []}))
  for capabilities in [{}, [1], ['unsafe capability'], repeat(['messaging'], 33)]
    call assert_false(wbx#protocol#hello({'version': 1, 'state': state, 'meeting': meeting, 'capabilities': capabilities}), 'malformed capability admission cannot enable reply sending')
  endfor
  for value in [[], v:null, 1, {'jsonrpc': ['2.0']}, {'jsonrpc': '2.0', 'id': 1},
        \ {'jsonrpc': '2.0', 'id': v:true, 'result': v:null},
        \ {'jsonrpc': '2.0', 'id': 1, 'result': v:null, 'error': {}},
        \ {'jsonrpc': '2.0', 'id': 1, 'error': {'code': -1, 'message': []}},
        \ {'jsonrpc': '2.0', 'id': 1, 'result': v:null, 'method': 'state'}]
    call assert_false(wbx#protocol#valid(value), 'malformed response rejected without raising')
  endfor
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'id': 1, 'result': v:null}))
  call assert_equal('worker:busy',wbx#protocol#reaction_read_error({'error':{
        \ 'message':'Reaction summary unavailable (worker:busy). PRIVATE provider body'}}))
  for error in [{}, {'message':[]}, {'message':'PRIVATE provider error'},
        \ {'message':'Reaction summary unavailable (provider:secret). PRIVATE'},
        \ {'message':'Reaction summary unavailable (worker:busy) PRIVATE'}]
    call assert_equal('summary:unavailable',wbx#protocol#reaction_read_error({'error':error}),'unknown reaction read errors reduce to a finite local category')
  endfor
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': state}))
  for source in [{'epoch':0,'revision':0,'degraded':v:false},{'epoch':12,'revision':3,'degraded':v:true}]
    let update = extend(copy(state),{'readStatus':'failed','reactionSource':source})
    call assert_true(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':update}),'finite presentation source metadata is optional, not a capability or authority')
  endfor
  for source in [v:null,{}, {'epoch':v:true,'revision':0,'degraded':v:false},{'epoch':-1,'revision':0,'degraded':v:false},
        \ {'epoch':1,'revision':v:true,'degraded':v:true},{'epoch':1,'revision':-1,'degraded':v:true},
        \ {'epoch':1,'degraded':v:true},{'epoch':1,'revision':0,'degraded':1},{'epoch':1,'revision':0,'degraded':v:true,'grant':v:true}]
    let update = extend(copy(state),{'readStatus':'failed','reactionSource':source})
    call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':update}),'invalid/extra source fields cannot enable retention')
  endfor
  call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'state','params':
        \ extend(copy(state),{'readStatus':'ready','reactionSource':{'epoch':1,'revision':0,'degraded':v:true}})}),'degraded presentation requires the corresponding failed read state')
  for update in [{'rooms': [{}]}, {'messages': ['not a message']}, {'ready': 1}, {'mode': ['demo']}, {'room': []}, {'revision': 0.5}]
    call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': extend(copy(state), update)}))
  endfor
  for metadata in [{'markdown': []}, {'markdown': repeat('x', 65537)}, {'quoted': 'true'}, {'parentId': []}, {'parentId': 'rich'}, {'parentId': '../bad'}]
    let rich = {'id': 'rich', 'author': 'Synthetic', 'created': '', 'text': 'plain'}
    call extend(rich, metadata)
    let rich_state = extend(copy(state), {'room': {'id': 'space', 'title': 'Synthetic'}, 'messages': [rich]})
    call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'state', 'params': rich_state}), 'malformed rich metadata is rejected before rendering')
  endfor
  for params in [{}, {'requestId': 'send', 'roomId': 'fixture-room', 'status': ['sent'], 'message': 'bad'},
        \ {'requestId': 'send', 'roomId': [], 'status': 'sent', 'message': 'bad'},
        \ {'requestId': 'send', 'roomId': 'fixture-room', 'status': 'sent', 'message': []},
        \ {'requestId': 'send', 'roomId': 'fixture-room', 'parentId': [], 'status': 'sent', 'message': 'bad'}]
    call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'delivery', 'params': params}))
  endfor
  for params in [{'active': [], 'ready': v:false}, {'active': v:false, 'ready': v:true},
        \ {'active': v:true, 'ready': v:false, 'session': 'wbx-fixture', 'display': 'editor', 'attach': ['sh', '-c', 'touch canary']},
        \ {'active': v:true, 'ready': v:false, 'session': 'wbx-fixture', 'attach': [0, 0, '/private/socket', 0, 0, 'wbx-fixture']},
        \ {'active': v:true, 'ready': v:false, 'session': 'wbx-fixture', 'attach': ['tmux', '-S', '/private/socket', 'attach-session', '-t', 'wbx-other']}]
    call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'meeting', 'params': params}))
  endfor
  call assert_true(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'meeting', 'params':
        \ {'active': v:true, 'ready': v:false, 'session': 'wbx-fixture', 'display': 'editor',
        \ 'attach': ['tmux', '-S', '/private/socket', 'attach-session', '-t', 'wbx-fixture']}}))
  let p = {'version': 1, 'revision': 1, 'layouts': ['gallery'], 'sources': []}
  for invalid in [{'version':v:true}, {'revision':v:true}, {'layouts':['gallery','gallery']}, {'sources':v:null}, {'command':'quit'}]
    call assert_false(wbx#protocol#valid({'jsonrpc':'2.0','method':'meeting','params':
          \ {'active':v:true,'ready':v:true,'session':'wbx-fixture','panes':extend(copy(p),invalid)}}), 'strict finite native capability admission')
  endfor
  for params in [{'type': 'sources', 'sources': [v:null]}, {'type': 'sources', 'sources': [{'id': 'video', 'label': []}]},
        \ {'type': 'sources', 'sources': [{'id': 'video', 'label': 'Missing fields'}]},
        \ {'type': 'send-state', 'kind': [], 'state': 'on'}, {'type': 'status', 'state': {}}, {'type': 'unknown'},
        \ {'type': 'send-state', 'kind': 'camera', 'state': 'off', 'requestId': []},
        \ {'type': 'camera-state', 'state': 'on', 'sending': v:true, 'requestId': 1},
        \ {'type': 'auth-state', 'method': 'oauth', 'state': 'ready', 'expiresAt': []}]
    call assert_false(wbx#protocol#valid({'jsonrpc': '2.0', 'method': 'meeting.event', 'params': params}))
  endfor
  call assert_equal(0, wbx#transport#running(), 'schema inspection never starts a backend')

  for mode in ['bad-ack-missing', 'bad-ack-type', 'bad-ack-room', 'bad-ack-status']
    call OpenFixture(mode)
    WebexResolveDelivery
    call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
    call setline(1, 'Retain this pending ' . mode . ' draft')
    let submitted = getline(1)
    let disconnects_before = g:wbx_protocol_disconnects
    WebexSend
    call WaitFor('!wbx#transport#running()')
    call assert_true(wbx#destination().uncertain, 'stop cleanup records delivery uncertainty synchronously')
    call assert_false(wbx#destination().pending, 'a stopped job cannot leave pending admission stuck')
    call assert_equal(submitted, getline(1), 'malformed ACK and later valid bytes cannot clear a draft')
    let audit_count = len(readfile($WBX_EDITOR_AUDIT))
    call OpenFixture('normal')
    WebexSend
    sleep 50m
    call assert_equal(disconnects_before + 1, g:wbx_protocol_disconnects, 'late old-job exits do not repeat cleanup or disrupt the replacement')
    call assert_equal(audit_count, len(readfile($WBX_EDITOR_AUDIT)), 'malformed delivery remains blocked across restart')
    WebexResolveDelivery
    call WaitFor('!wbx#drafts#uncertain(wbx#state().room.id)')
    call setline(1, 'Explicitly resolved ' . mode)
    WebexSend
    call WaitFor('getline(1) ==# ""')
    call assert_equal(audit_count + 1, len(readfile($WBX_EDITOR_AUDIT)))
    call wbx#shutdown()
  endfor
  let g:wbx_tui.backend = [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs', 'bad-hello']
  WebexDemo
  call WaitFor('!wbx#transport#running()')
  call assert_equal('idle', wbx#state().state, 'malformed hello never admits queued session.start')
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'editor': has('nvim') ? 'neovim' : 'vim'})], $WBX_EDITOR_RESULT)
qa!
