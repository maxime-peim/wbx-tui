import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('optional benchmark v1 keeps inherited live/editor flags out and reports distributions without latency thresholds', () => {
  const script = `
import os, runpy, tempfile
from pathlib import Path
m = runpy.run_path('scripts/editor-performance.py')
assert m['VERSION'] == 1
with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory:
    os.environ.update(WBX_READ_STATUS_SDK_TEST='1', WBX_CONFIG='/must-not-read',
                      DISPLAY='unavailable', VIMINIT='must-not-run', NODE_OPTIONS='must-not-run')
    env = m['environment'](Path(directory) / 'home', Path(directory) / 'copy', Path(directory) / 'result.json')
    assert not any(key in env for key in ['WBX_READ_STATUS_SDK_TEST', 'DISPLAY', 'VIMINIT', 'NODE_OPTIONS', 'TMUX'])
    assert env['WBX_CONFIG'] != '/must-not-read'
    assert Path(env['WBX_CONFIG']).read_text() == '{}\\n'
d = m['distribution']([7, 1, 3, 2, 5])
assert d == {'n': 5, 'min': 1, 'median': 3, 'p95': 7, 'max': 7}
assert set(m['GUARDS']) == {'projection-performance','structural-performance','paging-performance','status-performance'}
print('PASS')
`;
  assert.equal(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim(), 'PASS');
});

test('whole-editor fixture includes ordinary redraw in state and scroll probes and cannot start a live owner', async () => {
  const fixture = await readFile('test/editor/performance.vim', 'utf8');
  assert.match(fixture, /call s:publish\(s:state\)\n\s+redraw\n\s+call s:record\('unchanged_redraw'/);
  assert.match(fixture, /call s:publish\(s:state\)\n\s+redraw\n\s+call s:record\('structural_redraw'/);
  assert.match(fixture, /assert_false\(wbx#transport#running\(\)/);
  assert.doesNotMatch(fixture, /WebexDemo|WebexSend|WebexMarkRead|jobstart\(|job_start\(|system\(/);
});
