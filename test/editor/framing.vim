" Exercise the actual transport with only primitive boundaries instrumented.
set encoding=utf-8 hidden noswapfile lines=60 columns=160
execute 'set rtp^=' . fnameescape($WBX_EDITOR_ROOT)
runtime plugin/wbx.vim
let s:measure = 0
let s:work = {}
let s:results = []
function! WbxFrameIndex(text, needle, ...) abort
  let from = a:0 ? a:1 : 0
  let found = stridx(a:text, a:needle, from)
  if s:measure | let s:work.scanned += (found < 0 ? strlen(a:text) : found + 1) - from | endif
  return found
endfunction
function! WbxFrameLength(text) abort
  let size = strlen(a:text)
  if s:measure | let s:work.scanned += size | endif
  return size
endfunction
function! WbxFramePart(text, start, ...) abort
  let result = a:0 ? strpart(a:text, a:start, a:1) : strpart(a:text, a:start)
  if s:measure | let s:work.substrings += strlen(result) | endif
  return result
endfunction
function! WbxFrameJoin(values, separator) abort
  let result = join(a:values, a:separator)
  if s:measure
    let s:work.joined += strlen(result)
    let s:work.max_join_parts = max([s:work.max_join_parts, len(a:values)])
  endif
  return result
endfunction
function! WbxFrameDecode(text) abort
  let start = reltime()
  try
    let decoded = json_decode(a:text)
    if type(decoded) == v:t_dict && type(get(decoded, 'result', 0)) == v:t_string && strlen(decoded.result) < 128
      let g:wbx_frame_unicode = decoded.result
    endif
    return decoded
  finally
    if s:measure
      let s:work.decode_us += float2nr(reltimefloat(reltime(start)) * 1000000)
      let s:work.records += 1
    endif
  endtry
endfunction
let s:directory = $WBX_EDITOR_RESULT . '.runtime'
call mkdir(s:directory . '/autoload/wbx', 'p', 0700)
let s:source = readfile($WBX_EDITOR_ROOT . '/autoload/wbx/transport.vim')
let s:copy = []
for line in s:source
  if $WBX_FRAMING_BENCH !=# '1'
    for [builtin, wrapper] in [['stridx', 'WbxFrameIndex'], ['strlen', 'WbxFrameLength'], ['strpart', 'WbxFramePart'], ['join', 'WbxFrameJoin'], ['json_decode', 'WbxFrameDecode']]
      let line = substitute(line, '\<' . builtin . '(', wrapper . '(', 'g')
    endfor
  endif
  call add(s:copy, line)
endfor
" The production algorithm is unchanged. Only test-local entry/inspection helpers
" are appended to the private copied autoload, never the checkout or installed one.
call extend(s:copy, ['function! wbx#transport#_frame_feed(text) abort', '  call s:consume(a:text)', 'endfunction',
      \ 'function! wbx#transport#_frame_pending() abort', '  return exists("s:frame_bytes") ? s:frame_bytes : strlen(s:buffer)', 'endfunction',
      \ 'function! wbx#transport#_frame_end() abort', '  if has("nvim") | call jobstop(s:job) | else | call job_stop(s:job) | endif', 'endfunction'])
call writefile(s:copy, s:directory . '/autoload/wbx/transport.vim')
execute 'set rtp^=' . fnameescape(s:directory)
let g:wbx_tui = {'mark_read_on_open': 0, 'images': 0, 'upcoming_meetings': 0}
let s:hold = [$WBX_NODE, '-e', 'process.stdin.resume()']
function! WaitFor(expression) abort
  let start = reltime()
  while reltimefloat(reltime(start)) < 5
    if eval(a:expression) | return | endif
    sleep 10m
  endwhile
  throw 'Timeout: ' . a:expression
endfunction
function! s:start() abort
  call wbx#transport#stop()
  call assert_true(wbx#transport#start(s:hold))
endfunction
function! s:begin() abort
  let s:work = {'scanned': 0, 'substrings': 0, 'joined': 0, 'records': 0, 'max_join_parts': 0, 'decode_us': 0}
  let s:measure = 1
endfunction
function! s:feed(wire, stride) abort
  " Input preparation is deliberately outside timing/work measurement: strpart
  " of a large fixture string is not work performed by the transport itself.
  let fragments = []
  for offset in range(0, strlen(a:wire) - 1, a:stride)
    call add(fragments, strpart(a:wire, offset, a:stride))
  endfor
  call s:begin()
  let start = reltime()
  try
    for fragment in fragments
      call wbx#transport#_frame_feed(fragment)
    endfor
  finally
    let s:measure = 0
    let s:work.total_us = float2nr(reltimefloat(reltime(start)) * 1000000)
  endtry
  return copy(s:work)
endfunction
function! s:wire(size, ...) abort
  let prefix = '{"jsonrpc":"2.0","id":2000000000,"result":{"data":"'
  let padding = a:size - strlen(prefix) - 3
  let payload = a:0 ? repeat('界', padding / 3) . repeat('a', padding % 3) : repeat('a', padding)
  return prefix . payload . '"}}'
endfunction
function! s:replace() abort
  let g:wbx_frame_events += 1
  if g:wbx_frame_replace
    let g:wbx_frame_replace = 0
    call wbx#transport#stop()
    call wbx#transport#start(s:hold)
  endif
endfunction
try
  let limits = json_decode(join(readfile($WBX_EDITOR_ROOT . '/test/contract-boundaries.json'), "\n")).limits
  call s:start()
  if $WBX_FRAMING_BENCH ==# '1'
    " Optional phase timing, with untouched production primitives. Never used as
    " a wall-clock CI threshold. Prepare inputs before starting each timer.
    let samples = []
    call wbx#transport#_frame_feed(s:wire(128) . "\n")
    for size in [65536, 1048576, 8388608]
      let record = s:wire(size)
      let wire = record . "\n"
      for iteration in range(1, 5)
        let work = s:feed(wire, 8192)
        let start = reltime()
        let decoded = json_decode(record)
        let decode_us = float2nr(reltimefloat(reltime(start)) * 1000000)
        unlet decoded
        call add(samples, {'bytes': size, 'framing_receive_us': work.total_us, 'json_decode_us': decode_us})
      endfor
    endfor
    call wbx#transport#stop()
    call writefile([json_encode({'errors': v:errors, 'samples': samples})], $WBX_EDITOR_RESULT)
    qa!
  endif
  let wire = s:wire(262144) . "\n"
  let work = s:feed(wire, 64)
  call assert_equal(1, work.records)
  call assert_true(work.scanned <= strlen(wire) * 5, 'fragmented prefix must never be rescanned: ' . string(work))
  call assert_true(work.substrings + work.joined <= strlen(wire) * 4, 'bounded block/record copies: ' . string(work))
  call assert_true(work.max_join_parts <= 4096, 'one-byte fragments cannot create unbounded metadata')
  call add(s:results, extend({'case': 'fragmented-base64', 'bytes': strlen(wire)}, work))
  if !empty(v:errors) | throw 'Independent framing work guard failed.' | endif

  let wire = s:wire(32768) . "\n"
  let work = s:feed(wire, 1)
  call assert_equal(1, work.records)
  call assert_true(work.scanned <= strlen(wire) * 5)
  call assert_true(work.max_join_parts <= 4096)
  call assert_true(work.substrings + work.joined <= strlen(wire) * 4)
  call add(s:results, extend({'case': 'one-byte-fragments', 'bytes': strlen(wire)}, work))

  let wire = repeat('{"jsonrpc":"2.0","id":2000000000,"result":"世界"}' . "\n", 2048)
  let work = s:feed(wire, strlen(wire))
  call assert_equal(2048, work.records)
  call assert_true(work.scanned <= strlen(wire) * 5, 'do not repeatedly scan a shrinking callback suffix')
  call assert_true(work.substrings + work.joined <= strlen(wire) * 4, 'do not repeatedly copy a shrinking callback suffix')
  call add(s:results, extend({'case': 'coalesced-records', 'bytes': strlen(wire)}, work))

  " Every byte is temporarily permitted to end inside a multibyte code point.
  let wire = json_encode({'jsonrpc': '2.0', 'id': 2000000000, 'result': '世界 👩🏽‍💻 é'}) . "\n"
  for split in range(0, strlen(wire))
    call s:begin()
    call wbx#transport#_frame_feed(strpart(wire, 0, split))
    call wbx#transport#_frame_feed('')
    call wbx#transport#_frame_feed(strpart(wire, split))
    let s:measure = 0
    call assert_equal(1, s:work.records)
    call assert_equal('世界 👩🏽‍💻 é', g:wbx_frame_unicode)
    call assert_true(wbx#transport#running())
  endfor
  let work = s:feed(wire, 1)
  call assert_equal(1, work.records)
  call assert_equal('世界 👩🏽‍💻 é', g:wbx_frame_unicode)
  call assert_equal(0, wbx#transport#_frame_pending())

  " Exact event ceiling excludes LF; both complete and incomplete overflow fail
  " before any oversized segment copy or JSON decode.
  for size in [limits.eventBytes - 1, limits.eventBytes]
    let record = size == limits.eventBytes - 1 ? s:wire(size, 1) : s:wire(size)
    call assert_equal(size, strlen(record), 'limit is UTF-8 bytes, not code points')
    let work = s:feed(record . "\n", 8192)
    call assert_equal(1, work.records)
    call assert_true(wbx#transport#running())
    call assert_true(work.scanned <= (size + 1) * 5)
    call assert_true(work.max_join_parts <= 4096)
    call add(s:results, extend({'case': 'event-limit', 'bytes': size}, work))
  endfor
  for suffix in ['', "\n"]
    call s:start()
    let work = s:feed(s:wire(limits.eventBytes + 1) . suffix, 9000000)
    call assert_false(wbx#transport#running())
    call assert_equal(0, work.records)
    call assert_equal(0, work.substrings, 'reject over-limit segment before copying it')
    call assert_equal(0, work.joined)
    call assert_equal(0, wbx#transport#_frame_pending())
  endfor

  " Frame admission/cleanup is per backend generation. A reentrant native hook
  " can replace the job during receive; remaining old-callback bytes must stop.
  call s:start()
  let g:wbx_frame_events = 0
  let g:wbx_frame_replace = 1
  augroup wbx_framing_generation
    autocmd!
    autocmd User WbxState call s:replace()
  augroup END
  let state = {'revision': 1000000, 'state': 'ready', 'mode': 'demo', 'rooms': [], 'room': v:null, 'messages': [], 'ready': v:false}
  let first = json_encode({'jsonrpc': '2.0', 'method': 'state', 'params': state}) . "\n"
  let state.revision += 1
  let second = json_encode({'jsonrpc': '2.0', 'method': 'state', 'params': state}) . "\n"
  call wbx#transport#_frame_feed(first . second)
  call assert_equal(1, g:wbx_frame_events, 'old callback cannot publish into a replacement generation')
  augroup wbx_framing_generation
    autocmd!
  augroup END
  call wbx#transport#_frame_feed('{"partial":')
  call assert_true(wbx#transport#_frame_pending() > 0)
  call s:start()
  call assert_equal(0, wbx#transport#_frame_pending())
  call wbx#transport#_frame_feed('{"partial":')
  call wbx#transport#_frame_end()
  call WaitFor('!wbx#transport#running()')
  call assert_equal(0, wbx#transport#_frame_pending())

  " Actual job callbacks still reconstruct fragmented UTF-8 and use real native
  " handshake, state validation and destination-bound draft preservation.
  let g:wbx_tui.backend = [$WBX_NODE, $WBX_EDITOR_ROOT . '/test/editor/backend-fixture.mjs']
  WebexDemo
  call WaitFor('len(wbx#state().rooms) == 1')
  call assert_equal('Unicode 世界 👩🏽‍💻 | let g:wbx_injected = 1', wbx#state().rooms[0].title)
  call assert_false(exists('g:wbx_injected'))
  call wbx#select('fixture-room')
  call WaitFor('wbx#state().ready')
  WebexCompose
  call setline(1, 'Preserved framing draft 世界 👩🏽‍💻')
  call wbx#transport#_frame_feed('not JSON' . "\n" . '{"jsonrpc":"2.0","id":1,"result":null}' . "\n")
  call assert_false(wbx#transport#running())
  call assert_equal('Preserved framing draft 世界 👩🏽‍💻', getline(1))
catch
  let s:measure = 0
  call add(v:errors, v:exception . ' at ' . v:throwpoint)
endtry
call wbx#shutdown()
call writefile([json_encode({'errors': v:errors, 'work': s:results})], $WBX_EDITOR_RESULT)
qa!
