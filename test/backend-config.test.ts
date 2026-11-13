import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, loadEditorConfig, parseConfig, parseEditorConfig, readEditorOAuthClientSecret, readOAuthClientSecret, themes } from '../src/config.js';

const profile = { clientId: 'synthetic', redirectUri: 'http://127.0.0.1:53682/oauth/callback', scopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'] };
const secret = 'synthetic-private-secret';
const oauth = { ...profile, clientSecret: secret };

test('native config projects only runtime OAuth, ignoring invalid compatibility layouts, maps and themes without weakening compatibility validation', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-config-projections-'), path = join(directory, 'config.json');
  try {
    for (const compatibility of [{ layout: 'missing' }, { layouts: { broken: { source: 'not-a-source' } } },
      { keybindings: { q: 'not.an.action' } }, { messaging: { layouts: { broken: {} } } },
      { messaging: { keybindings: { insert: { x: 'send' } } } }, { theme: { muted: 'invalid' } }, { leader: [] }]) {
      const raw = { version: 1, oauth, ...compatibility };
      assert.throws(() => parseConfig(raw)); assert.deepEqual(parseEditorConfig(raw), { version: 1, oauth: profile });
      await writeFile(path, JSON.stringify(raw), { mode: 0o600 });
      await assert.rejects(loadConfig(path, true)); await assert.rejects(readOAuthClientSecret(path, profile));
      const native = await loadEditorConfig(path, true);
      assert.deepEqual(native, { version: 1, oauth: profile }); assert.ok(!JSON.stringify(native).includes(secret));
      assert.equal(await readEditorOAuthClientSecret(path, native.oauth!), secret);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('native config preserves bounded-file, private-permission, OAuth-field and expected-profile checks', async () => {
  const directory = await mkdtemp('/tmp/opencode/wbx-native-config-'), path = join(directory, 'config.json');
  try {
    assert.deepEqual(await loadEditorConfig(path), { version: 1 }); await assert.rejects(loadEditorConfig(path, true));
    await writeFile(path, JSON.stringify({ oauth }), { mode: 0o600 }); await chmod(path, 0o644);
    await assert.rejects(loadEditorConfig(path, true), /chmod 600/); await assert.rejects(readEditorOAuthClientSecret(path, profile), /owner-only/);
    await chmod(path, 0o600); assert.equal(await readEditorOAuthClientSecret(path, profile), secret);
    for (const expected of [{ ...profile, clientId: 'changed' }, { ...profile, redirectUri: 'http://127.0.0.1:53683/oauth/callback' },
      { ...profile, scopes: [...profile.scopes].reverse() }]) await assert.rejects(readEditorOAuthClientSecret(path, expected), /profile changed/);
    for (const raw of [null, [], { version: 2, oauth }, { oauth: { ...oauth, clientSecret: 'bad\nsecret' } },
      { oauth: { ...oauth, refreshToken: 'forbidden' } }, { oauth: { ...oauth, redirectUri: 'https://example.com/callback' } }]) {
      await writeFile(path, JSON.stringify(raw));
      await assert.rejects(loadEditorConfig(path, true)); await assert.rejects(readEditorOAuthClientSecret(path, profile));
    }
    await writeFile(path, `{"oauth":{"clientSecret":"${secret}"},BROKEN`);
    await assert.rejects(loadEditorConfig(path, true), error => /valid JSON/.test(String(error)) && !String(error).includes(secret));
    await writeFile(path, ' '.repeat(128_001)); await assert.rejects(loadEditorConfig(path, true), /128 KB/);
    await assert.rejects(loadEditorConfig(directory, true), /regular file/);
    await writeFile(path, JSON.stringify({ oauth: profile })); assert.equal(await readEditorOAuthClientSecret(path, profile), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('optional theme presets meet 4.5:1 muted-text contrast while explicit user colors are preserved', () => {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = hex.slice(1).match(/../g)!.map(byte => parseInt(byte, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * b;
  };
  for (const [name, theme] of Object.entries(themes)) {
    const a = luminance(theme.background), b = luminance(theme.muted);
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, name);
  }
  assert.equal(parseConfig({ theme: { muted: '#010101' } }).theme.muted, '#010101');
});
