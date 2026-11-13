" Pure observation-to-text projection; no application state, transport or native write ports.
set nocompatible encoding=utf-8 hidden noswapfile nomore lines=60 columns=160
execute 'set rtp^='.fnameescape($WBX_EDITOR_ROOT)
let s:checks=[] | let s:drawn=[]
let s:meeting={'active':v:true,'ready':v:true,'session':'wbx-observed','display':'kitty'}
function! s:lines(events, ...) abort
  return wbx#meeting_status#lines(a:0 ? a:1 : s:meeting,a:events,a:0>1 ? a:2 : 1)
endfunction
try
  enew | call setline(1,'Native work outside status projection') | call feedkeys("i\<Esc>",'xt')
  let native=[bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,&breakat]
  let cpo=&cpoptions
  call assert_equal([
        \ '# Webex meeting · ACTIVE','Presentation: kitty',"Session: 'wbx-observed'",'','Controls: ready',
        \ 'Closing a view or editor does not imply the meeting ended.','Sending starts OFF.','',
        \ 'Call: unknown','microphone: unknown (no observation)','camera: unknown (no observation)',
        \ 'screen: unknown (no observation)','Local preview: unknown · NOT SENT',
        \ 'Rx audio playback: unknown (not microphone sending)',
        \ 'Sources: bounded slots (max 16), NOT complete attendee/self/lobby coverage · unknown / no observation',
        \ 'Speaker layout: fixed main/secondary geometry, not active-speaker following.'],s:lines({}))
  call assert_equal(cpo,&cpoptions)
  call assert_equal(' · CALL reported mic:unknown cam:unknown share:unknown Rx:unknown controls:ready preview:NOT SENT',
        \ wbx#meeting#compact(s:meeting,{},1))
  let empty=wbx#meeting_status#lines({},{},1)
  call assert_equal('# Webex meeting · inactive / no call reported',empty[0])
  call assert_true(index(empty,'Last reported microphone: unknown (no observation)')>=0)
  call assert_equal('',wbx#meeting_status#compact({},{},1))
  call add(s:checks,'missing observations stay unknown, inactive compact stays empty, and exact default detailed ordering/wording and public compact compatibility are preserved')

  let descriptions={'on':'confirmed sending','off':'not sending','starting':'starting; not confirmed sending',
        \ 'awaiting':'pending trusted browser confirmation; not confirmed sending'}
  for kind in ['microphone','camera','screen']
    for [state,detail] in items(descriptions)
      let events={'send-state:'.kind:{'type':'send-state','kind':kind,'state':state,'requestId':1,'reason':'busy'}}
      call assert_true(index(s:lines(events),kind.': '.state.' ('.detail.') · reason: busy')>=0)
    endfor
  endfor
  let events={'camera-state':{'state':'on','sending':v:false,'reason':'denied'},'audio-state':{'enabled':v:true}}
  call assert_true(index(s:lines(events),'Local preview: on · NOT SENT · reason: denied')>=0)
  call assert_true(index(s:lines(events),'Rx audio playback: enabled (not microphone sending)')>=0)
  call assert_match('mic:unknown cam:unknown share:unknown Rx:on',wbx#meeting_status#compact(s:meeting,events,1))
  let events['audio-state'].enabled=v:false
  call assert_true(index(s:lines(events),'Rx audio playback: disabled (not microphone sending)')>=0)
  call add(s:checks,'on/off/starting/awaiting sending observations retain distinct meanings; local preview and received audio never imply microphone/camera/screen transmission')

  let events={'sources':{'sources':[
        \ {'id':'self','kind':'video','label':'Not a participant list','available':v:true},
        \ {'id':'presenting','kind':'share','label':'Meeting share','available':v:false},
        \ {'id':'local','kind':'local','label':'Preview','available':v:true},
        \ {'id':'video','kind':'video','label':"Received\tlabel\nsafe\e",'available':v:false,'present':v:false},
        \ {'id':'share','kind':'share','label':'Received share','available':v:true,'present':v:true}]},
        \ 'auth-state':{'state':'failed','reason':'expired'},'notice':{'message':"Notice\tline\nsafe\e"}}
  let before=deepcopy(events) | let lines=s:lines(events)
  call assert_equal([
        \ '  Meeting camera source · available','  Meeting screen source · unavailable',
        \ '  Local preview (NOT SENT) · available','  Rx video: Received label safe  · unavailable · participant not reported present',
        \ '  Rx share: Received share · available · participant present',
        \ 'Authentication: failed · reason: expired','Notice: Notice line safe '],lines[-7:])
  call assert_equal(before,events,'projection cannot sanitize/mutate observation evidence in place')
  call assert_true(index(s:lines({'sources':{'sources':[]}}),
        \ 'Sources: bounded slots (max 16), NOT complete attendee/self/lobby coverage · none reported')>=0)
  call add(s:checks,'bounded source availability/presence is not complete attendee/self/lobby coverage; fixed geometry, sanitized labels/notices and authentication ordering remain truthful')

  let events={'status':{'state':'connected'},'send-state:microphone':{'state':'on'},'audio-state':{'enabled':v:true}}
  for cause in ['disconnect','unready','inactive','failed','ended']
    let meeting=deepcopy(s:meeting) | let sample=deepcopy(events) | let connected=1
    if cause==# 'disconnect' | let connected=0 | endif
    if cause==# 'unready' | let meeting.ready=v:false | endif
    if cause==# 'inactive' | let meeting.active=v:false | endif
    if index(['failed','ended'],cause)>=0 | let sample.status.state=cause | endif
    let lines=wbx#meeting_status#lines(meeting,sample,connected)
    call assert_true(index(lines,'Observations STALE / current media state unknown; not proof of stopped sending.')>=0,cause)
    call assert_true(index(lines,'Last reported microphone: on (confirmed sending)')>=0,cause)
    call assert_equal(-1,index(lines,'microphone: off (not sending)'),cause)
    if cause!=# 'inactive'
      call assert_equal(' · CALL STALE/UNKNOWN mic:unknown cam:unknown share:unknown Rx:unknown controls:unavailable preview:NOT SENT',
            \ wbx#meeting_status#compact(meeting,sample,connected),cause)
    else
      call assert_equal('',wbx#meeting_status#compact(meeting,sample,connected))
    endif
  endfor
  call add(s:checks,'disconnected/unready/inactive/failed/ended details retain last reports with explicit unknown-current-media warning; compact hides stale transmission/Rx values instead of inventing off')

  let before=deepcopy([s:meeting,events])
  let lines=s:lines(events) | let lines[0]='Caller-owned output'
  call assert_equal('# Webex meeting · ACTIVE',s:lines(events)[0])
  call assert_equal(before,[s:meeting,events])
  call assert_equal(native,[bufnr('%'),win_getid(),getline(1,'$'),undotree(),b:changedtick,&breakat])
  call add(s:checks,'repeated projections are detached deterministic values with no state registry, global application reads, native text/undo/focus changes or recovery effects')
  if $WBX_EDITOR_SCREEN==# '1'
    redraw!
    let info=getwininfo(win_getid())[0] | let rows=[]
    for row in range(info.winrow,info.winrow+info.height-1)
      call add(rows,join(map(range(info.wincol,info.wincol+info.width-1),'screenstring(row,v:val)'), ''))
    endfor
    call assert_match('Native work outside status projection',join(rows,"\n"))
    call add(s:drawn,filter(rows,'v:val =~# "Native work outside status projection"'))
  endif
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call writefile([json_encode({'errors':v:errors,'checks':s:checks,'drawn':s:drawn,
      \ 'scope':'pure meeting presentation and public compact compatibility, no application/transport/device/UI write effects'})],$WBX_EDITOR_RESULT)
qa!
