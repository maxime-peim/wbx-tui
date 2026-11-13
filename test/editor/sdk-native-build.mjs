// Finite private build: no installed SDK/config, checkout dist or production seams.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const output = resolve(process.argv[2]);
const root = fileURLToPath(new URL('../../', import.meta.url));
if (output === join(root, 'dist') || !process.argv[2]) throw new Error('Private output required');
await mkdir(join(output, 'dist'), { recursive: true, mode: 0o700 });
await writeFile(join(output, 'package.json'), '{"type":"module"}\n', { mode: 0o600 });
const common = { bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent', metafile: true };
const editor = await build({ ...common, entryPoints: [join(root, 'src/editor-main.ts')], outfile: join(output, 'dist/editor-main.js'),
  plugins: [{ name: 'private-setup-only', setup(builder) {
    builder.onLoad({ filter: /\/src\/editor-main\.ts$/ }, async args => ({
      contents: `import ${JSON.stringify(join(root, 'test/editor/sdk-native-setup.mjs'))};\n` + await readFile(args.path, 'utf8'),
      loader: 'ts', resolveDir: join(root, 'src'),
    }));
  } }] });
const source = await build({ ...common, entryPoints: [join(root, 'src/read-status-worker.ts')], outfile: join(output, 'dist/read-status-worker.js'),
  plugins: [{ name: 'synthetic-sdk-only', setup(builder) {
    builder.onLoad({ filter: /\/src\/read-status-sdk\.ts$/ }, () => ({
      contents: `export { createReadStatusSDK } from ${JSON.stringify(join(root, 'test/editor/sdk-native-sdk.mjs'))};`,
      loader: 'js', resolveDir: join(root, 'src'),
    }));
  } }] });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const originals = ['src/editor-main.ts', 'src/editor-worker.ts', 'src/editor-protocol.ts', 'src/editor-output.ts',
  'src/editor-engine.ts', 'src/backend-providers.ts', 'src/read-status.ts', 'src/read-status-worker.ts',
  'src/read-status-protocol.ts', 'src/read-source-lifecycle.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(originals.map(async name => [name, sha(await readFile(join(root, name)))])));
const inputs = result => Object.keys(result.metafile.inputs).map(name => name.replace(root, '')).sort();
await writeFile(join(output, 'build-proof.json'), JSON.stringify({
  entries: ['src/editor-main.ts', 'src/read-status-worker.ts'],
  substitutions: ['prepend-private-setup', 'synthetic-read-status-sdk'],
  sourceHashes, editorInputs: inputs(editor), sourceInputs: inputs(source),
  outputs: Object.fromEntries(await Promise.all(['editor-main.js', 'read-status-worker.js'].map(async name =>
    [name, sha(await readFile(join(output, 'dist', name)))]))),
}) + '\n', { mode: 0o600 });
