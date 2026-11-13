import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EditorEngine } from '../src/editor-engine.js';
import { OAuthSession } from '../src/oauth.js';
import { WebexMessagingAPI } from '../src/messaging-api.js';

test('native editor startup and private-secret lookup ignore invalid unused compatibility layouts without opening a real browser', async t => {
  const directory = await mkdtemp('/tmp/opencode/wbx-editor-config-projection-');
  const config = join(directory, 'config.json');
  let browserOpens = 0, network = 0;
  const engine = new EditorEngine(async () => { browserOpens++; throw new Error('Browser forbidden.'); });
  await writeFile(config, JSON.stringify({ oauth: {
    clientId: 'synthetic-client', clientSecret: 'synthetic-secret', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:all', 'spark:kms'],
  }, messaging: { layout: false }, layouts: false, keybindings: false }), { mode: 0o600 });
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('Network forbidden.'); });
  t.mock.method(OAuthSession.prototype, 'authorize', async () => ({ token: 'synthetic', expiresAt: Date.now() + 3600_000, scope: 'spark:all spark:kms' }));
  t.mock.method(WebexMessagingAPI.prototype, 'rooms', async () => ({ items: [] }));
  try {
    await engine.start('live', config);
    assert.equal(engine.snapshot().state, 'ready');
    assert.equal(engine.snapshot().auth, 'oauth');
    assert.equal(browserOpens, 0);
    assert.equal(network, 0);
  } finally { engine.stop(); await rm(directory, { recursive: true, force: true }); }
});
