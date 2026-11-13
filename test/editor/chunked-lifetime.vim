" Physical sink admission survives cancel/disconnect/backend replacement until exit.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
let s:private = $WBX_EDITOR_RESULT . '.runtime'
call mkdir(s:private . '/autoload/wbx', 'p', 0700)
let s:helper = $WBX_EDITOR_RESULT . '.stubborn.mjs'
let s:source = readfile($WBX_EDITOR_ROOT . '/autoload/wbx/attachment_stream.vim')
for index in range(0, len(s:source) - 1)
  if s:source[index] =~# '^let s:helper ='
    let s:source[index] = 'let s:helper = ' . string(s:helper)
  endif
endfor
" The actual owner/state machine, with only its fixed helper path replaced in a
" private runtime copy. No installed/check-out autoload or helper is overwritten.
call writefile(s:source, s:private . '/autoload/wbx/attachment_stream.vim')
execute 'set rtp^=' . fnameescape(s:private)
let s:stub =<< trim END
  import {appendFileSync,existsSync,readFileSync} from 'node:fs';
  const audit=process.env.WBX_EDITOR_RESULT+'.sinks', release=process.env.WBX_EDITOR_RESULT+'.release';
  let overlap=false;
  if(existsSync(audit))for(const line of readFileSync(audit,'utf8').trim().split('\n')){
    try{process.kill(JSON.parse(line).pid,0);overlap=true;}catch{}
  }
  appendFileSync(audit,JSON.stringify({pid:process.pid,overlap})+'\n');
  process.on('SIGTERM',()=>{});
  process.stdin.on('data',()=>{});process.stdin.on('end',()=>{});process.stdin.resume();
  process.stdout.write('{"type":"ready","version":1}\n');
  setInterval(()=>{if(existsSync(release))process.exit(0);},10);
END
call writefile(s:stub, s:helper)
runtime plugin/wbx.vim
let g:wbx_tui = {'images': 0, 'mark_read_on_open': 0, 'notifications': 0, 'upcoming_meetings': 0,
      \ 'backend': [$WBX_NODE, '--import', 'tsx', $WBX_EDITOR_ROOT . '/test/attachment-resolve-fixture.ts', '--chunks']}
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 6
    if eval(a:expression) | return | endif
    sleep 5m
  endwhile
  throw 'Timeout: ' . a:expression . ' | ' . execute('messages')
endfunction
function! s:open() abort
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call wbx#select('room', 1, 0)
  call WaitFor('get(b:, "wbx_kind", "") ==# "history" && get(wbx#state(), "ready", 0)')
  call cursor(b:wbx_message_blocks[0].body, 1)
endfunction
try
  call s:open()
  WebexAttachment 1
  call wbx#compose()
  call WaitFor('filereadable($WBX_EDITOR_RESULT . ".sinks")')
  call assert_true(wbx#attachment_stream#busy(), 'revoked sink still physically owns admission')
  call wbx#transport#stop()
  call s:open()
  for attempt in range(1, 3)
    WebexAttachment 1
    sleep 30m
  endfor
  call assert_equal(1, len(readfile($WBX_EDITOR_RESULT . '.sinks')), 'restart cannot spawn a replacement behind stubborn old helper')
  call writefile(['release'], $WBX_EDITOR_RESULT . '.release')
  call WaitFor('!wbx#attachment_stream#busy()')
  WebexAttachment 1
  call WaitFor('len(readfile($WBX_EDITOR_RESULT . ".sinks")) == 2')
  call WaitFor('!wbx#attachment_stream#busy()')
  call assert_equal([v:false, v:false], map(readfile($WBX_EDITOR_RESULT . '.sinks'), 'json_decode(v:val).overlap'))
catch
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call writefile(['release'], $WBX_EDITOR_RESULT . '.release')
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors})], $WBX_EDITOR_RESULT)
qa!
