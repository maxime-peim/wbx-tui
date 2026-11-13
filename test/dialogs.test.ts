import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('native confirmations use distinct mnemonic keys and keep Cancel as the default', async () => {
  const found: string[] = [];
  for (const name of await readdir('autoload/wbx')) {
    if (!name.endsWith('.vim')) continue;
    const source = await readFile(`autoload/wbx/${name}`, 'utf8');
    for (const match of source.matchAll(/confirm\([^\n]*,\s*"([^"]*\\n[^"]*)",\s*(\d+)\)/g)) {
      const buttons = match[1]!.split('\\n');
      const keys = buttons.map(button => /&(.)/.exec(button)?.[1]?.toLowerCase());
      assert.ok(keys.every(Boolean), `${name}: each confirmation choice needs a mnemonic`);
      assert.equal(new Set(keys).size, keys.length, `${name}: duplicate confirmation keys`);
      assert.equal(buttons[0], '&Cancel', `${name}: cancellation stays first`);
      assert.equal(match[2], '1', `${name}: cancellation stays the default`);
      found.push(name);
    }
  }
  assert.deepEqual(found.sort(), ['conversations.vim', 'message_actions.vim', 'productivity.vim',
    'reactions.vim', 'rich.vim', 'saved_drafts.vim', 'sections.vim', 'uploads.vim'],
  'all native confirmation call sites are covered, including Detach and saved-text Discard');
});

test('drawn native confirmation acceptance uses real consent and private keyboard input, not headless defaults', async () => {
  const fixture = await readFile('test/editor/native-confirmations.vim', 'utf8');
  for (const owner of ['reactions', 'message_actions', 'rich', 'conversations', 'uploads', 'productivity', 'saved_drafts'])
    assert.ok(fixture.includes(`'${owner}'`), `${owner}: real helper is exercised`);
  for (const command of ['WebexSend', 'WebexEditSubmit', 'WebexDelete', 'WebexReactionAdd', 'WebexReactionResolve'])
    assert.ok(fixture.includes(command), `${command}: cancellation reaches a production action path`);
  assert.match(fixture, /wbx#sections#action\('clear'/, 'the inline confirmation owner is exercised too');
  assert.doesNotMatch(fixture, /function!.*_confirm\(|return g:(?:wbx_confirm|reaction_confirm)\b/, 'consent helpers must not be replaced');
  assert.match(fixture, /keyboard acceptance requires drawn mode/, 'headless defaults are not keyboard acceptance');
  assert.match(fixture, /assert_equal\(42,s:dialogs\)/);
  assert.match(fixture, /assert_equal\(7,s:positive\)/, 'positive controls prevent an always-Cancel false pass');
  const driver = await readFile('test/editor/drawn.py', 'utf8');
  assert.match(driver, /args\.fixture == "native-confirmations"/);
  assert.match(driver, /PRIVATE controlling PTY/);
  assert.match(driver, /operator_observed_assistive_readout.*NOT RUN/);
});
