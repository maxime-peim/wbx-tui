" ACK/destination-bound uncertainty resolution; no Webex or live receipt.
set nocompatible encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:backend =<< trim END
  import {createInterface} from 'node:readline';
  import {appendFileSync} from 'node:fs';
  const rooms = ['a','b'].map(id=>({id,title:id,type:'group'}));
  let revision = 0, held, fail = false;
  let state = {revision,state:'ready',mode:'demo',rooms,room:rooms[0],messages:[],ready:true};
  const write = v=>process.stdout.write(JSON.stringify(v)+'\n');
  const publish=()=>{state.revision=++revision;write({jsonrpc:'2.0',method:'state',params:state});};
  createInterface({input:process.stdin}).on('line', line=>{
    const r=JSON.parse(line), p=r.params||{}, reply=result=>write({jsonrpc:'2.0',id:r.id,result});
    appendFileSync(process.env.WBX_EDITOR_AUDIT,JSON.stringify(r)+'\n');
    if(r.method==='hello') return reply({version:1,capabilities:['delivery-resolution-v1'],state,meeting:{active:false,ready:false}});
    if(r.method==='rooms.select'){state.room=rooms.find(room=>room.id===p.roomId);publish();return reply(null);}
    if(r.method.startsWith('delivery.resolve')){held=r;return;}
    if(r.method==='test.release'){write(fail?{jsonrpc:'2.0',id:held.id,error:{code:-1,message:'Synthetic refusal'}}:{jsonrpc:'2.0',id:held.id,result:{roomId:held.params.roomId}});return reply(null);}
    if(r.method==='test.fail'){fail=p.fail;return reply(null);}
    if(r.method==='shutdown'){reply(null);process.exit(0);}
    reply(null);
  });
END
call writefile(s:backend,$WBX_EDITOR_RESULT.'.backend.mjs')
let g:wbx_tui = {'backend':[$WBX_NODE,$WBX_EDITOR_RESULT.'.backend.mjs'],'images':0,'notifications':0,'people_status':0,'upcoming_meetings':0,'mark_read_on_open':0}
let s:acks = 0
function! s:ack(response) abort
  let s:acks += 1
endfunction
function! s:wait(expression) abort
  let start = reltime()
  while !eval(a:expression) && reltimefloat(reltime(start)) < 5 | sleep 10m | endwhile
  call assert_true(eval(a:expression), a:expression)
endfunction
function! s:control(method, params) abort
  let next=s:acks+1
  call wbx#rpc(a:method,a:params,function('s:ack'))
  call s:wait('s:acks == '.next)
endfunction
function! s:unknown(room, request) abort
  call wbx#drafts#register(a:request,{'roomId':a:room,'text':'Retained native text'},bufnr('%'),b:changedtick)
  call wbx#drafts#failed(a:request,1)
endfunction
try
  WebexDemo
  call s:wait('get(wbx#state(),"ready",0)')
  call s:unknown('a','one')
  WebexResolveDelivery
  call assert_true(wbx#drafts#uncertain('a'),'dispatch alone is NOT a successful resolution ACK')
  call s:control('test.fail',{'fail':v:true})
  call s:control('test.release',{})
  call assert_true(wbx#drafts#uncertain('a'),'failed resolution retains uncertainty')
  call s:control('test.fail',{'fail':v:false})
  WebexResolveDelivery
  call wbx#select('b')
  call s:wait('wbx#state().room.id ==# "b"')
  call s:unknown('b','two')
  call s:control('test.release',{})
  call assert_true(wbx#drafts#uncertain('a'),'changed selection invalidates the old native resolution intent')
  call assert_true(wbx#drafts#uncertain('b'),'ACK for a never clears b')
  call wbx#select('a')
  call s:wait('wbx#state().room.id ==# "a"')
  WebexResolveDelivery
  call s:unknown('a','newer')
  call s:control('test.release',{})
  call assert_true(wbx#drafts#uncertain('a'),'old ACK cannot erase newer evidence for the same room')
  WebexResolveDelivery
  call s:control('test.release',{})
  call assert_false(wbx#drafts#uncertain('a'),'exact acknowledged unchanged intent can resolve once')
  let requests=map(readfile($WBX_EDITOR_AUDIT),'json_decode(v:val)')
  call assert_equal([],filter(copy(requests),'v:val.method ==# "delivery.resolve"'),'never use unbound legacy resolution')
  call assert_equal(4,len(filter(copy(requests),'v:val.method ==# "delivery.resolveBound" && v:val.params.roomId ==# "a"')))
  call assert_equal([],filter(copy(requests),'v:val.method =~# "^messages.send\\|^rooms.read"'),'resolution never sends/replays/receipts')
catch
  call add(v:errors,v:exception.' at '.v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors':v:errors})],$WBX_EDITOR_RESULT)
qa!
