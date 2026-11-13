" Transport/handshake lifecycle, composing one request channel.
" Domain sessions, views, write uncertainty and physical jobs have other owners.
let s:save_cpo = &cpoptions
set cpoptions&vim
function! wbx#connection#new(root, ports) abort
  let owner = {'root':a:root, 'ports':a:ports, 'ready':0, 'disconnected':0, 'features':wbx#features#empty()}
  let owner.rpc = wbx#rpc_channel#new({'Ensure':function('wbx#connection#ensure',[owner]),
        \ 'Status':function('s:status',[owner]), 'Send':function('s:send',[owner]), 'Notify':a:ports.Notify})
  return owner
endfunction
function! wbx#connection#ready(owner) abort
  return a:owner.ready
endfunction
function! wbx#connection#disconnected(owner) abort
  return a:owner.disconnected
endfunction
function! wbx#connection#feature(owner, field) abort
  return copy(get(a:owner.features,a:field,[]))
endfunction
function! s:status(owner) abort
  return {'ready':a:owner.ready, 'passiveReady':a:owner.ready && !a:owner.disconnected && call(a:owner.ports.Running,[])}
endfunction
function! wbx#connection#ensure(owner) abort
  if call(a:owner.ports.Running,[]) | return 1 | endif
  let backend = call(a:owner.ports.Backend,[])
  if empty(backend) && !filereadable(a:owner.root . '/dist/editor-main.js')
    call call(a:owner.ports.Notify,['Backend is not built. Run npm ci && npm run build in the plugin directory.'])
    return 0
  endif
  let command = empty(backend) ? [exepath('node'), a:owner.root . '/dist/editor-main.js'] : backend
  if type(command) != v:t_list || empty(command) || empty(command[0]) || !executable(command[0])
    call call(a:owner.ports.Notify,['Node/backend unavailable. Run npm ci && npm run build in the plugin directory, or set backend argv.'])
    return 0
  endif
  " Validate configuration before retiring anything; never replay replaced work.
  let a:owner.ready = 0
  let a:owner.features = wbx#features#reset(a:owner.features,'transport')
  call wbx#rpc_channel#reset(a:owner.rpc)
  call call(a:owner.ports.Prepare,[])
  if !call(a:owner.ports.Start,[command])
    call call(a:owner.ports.Notify,['Could not start the backend.'])
    return 0
  endif
  call call(a:owner.ports.Started,[])
  let a:owner.disconnected = 0
  call wbx#connection#request(a:owner,'hello',{'version':1},function('wbx#connection#hello',[a:owner]))
  return 1
endfunction
function! wbx#connection#hello(owner, message) abort
  if has_key(a:message,'error')
    call call(a:owner.ports.Notify,['Unsupported backend protocol. Update and rebuild wbx-tui.'])
    call wbx#connection#stop(a:owner)
    return
  endif
  if !wbx#protocol#hello(get(a:message,'result',v:null))
    call wbx#connection#invalid(a:owner)
    return
  endif
  let a:owner.ready = 1
  let a:owner.features = wbx#features#copy(a:message.result)
  " Application/meeting projections are accepted before startup requests drain.
  call call(a:owner.ports.Accept,[a:message.result])
  call wbx#rpc_channel#flush(a:owner.rpc)
endfunction
function! s:send(owner, wire) abort
  let request = json_decode(a:wire)
  if request.method ==# 'session.start'
    let changed = 0
    for [field, capability] in [['upcomingMeetings', 'upcoming-meetings'], ['spacesCache', 'spaces-cache'], ['notificationPreview', 'notification-previews'], ['senderNames', 'sender-names-v1']]
      if has_key(request.params,field) && index(a:owner.features.capabilities,capability) < 0
        call remove(request.params,field)
        let changed = 1
        if field ==# 'spacesCache' | call call(a:owner.ports.Notify,['Spaces cache requires an updated backend. Ordinary messaging will continue without it.']) | endif
        if field ==# 'notificationPreview' | call call(a:owner.ports.Notify,['Other-space notification previews require an updated backend. Notifications will continue without excerpts.']) | endif
        if field ==# 'senderNames' | call call(a:owner.ports.Notify,['Sender names require an updated backend. Existing message labels and excerpts are unchanged.']) | endif
      endif
    endfor
    if changed | return call(a:owner.ports.Write,[json_encode(request) . "\n"]) | endif
  endif
  return call(a:owner.ports.Write,[a:wire])
endfunction
function! wbx#connection#request(owner, method, params, ...) abort
  return call('wbx#rpc_channel#call',[a:owner.rpc,a:method,a:params] + a:000)
endfunction
function! wbx#connection#response(owner, message) abort
  " The application validates all wire envelopes before this correlation port.
  call wbx#rpc_channel#response(a:owner.rpc,a:message)
endfunction
function! wbx#connection#session(owner) abort
  " Messaging replacement/failure cannot discard independent meeting assertions.
  let a:owner.features = wbx#features#reset(a:owner.features,'session')
endfunction
function! wbx#connection#lost(owner) abort
  let a:owner.ready = 0
  let a:owner.features = wbx#features#reset(a:owner.features,'transport')
  let a:owner.disconnected = 1
  call wbx#rpc_channel#reset(a:owner.rpc)
endfunction
function! wbx#connection#stop(owner) abort
  " Physical transport stop synchronously reports exit for domain cleanup.
  call call(a:owner.ports.Stop,[])
endfunction
function! wbx#connection#invalid(owner) abort
  call call(a:owner.ports.Notify,['Invalid backend protocol; disconnected without interpreting output as editor commands.'])
  call wbx#connection#stop(a:owner)
endfunction
function! wbx#connection#next_id(owner) abort
  return wbx#rpc_channel#next_id(a:owner.rpc)
endfunction
function! wbx#connection#requests(owner) abort
  return wbx#rpc_channel#diagnostics(a:owner.rpc)
endfunction
let &cpoptions = s:save_cpo
unlet s:save_cpo
