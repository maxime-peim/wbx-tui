import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build the complete set used by owners, viewers and isolated workers together. */
export async function buildArtifacts(directory = 'dist'): Promise<void> {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    build({ entryPoints: ['src/browser/main.ts'], outfile: join(directory, 'browser.js'), bundle: true,
      platform: 'browser', format: 'iife', target: 'chrome120', sourcemap: true }),
    ...['cli', 'editor-main', 'read-status-worker', 'oauth-worker'].map(name => build({
      entryPoints: [`src/${name}.ts`], outfile: join(directory, `${name}.js`), bundle: true,
      platform: 'node', format: 'esm', packages: 'external', target: 'node22', sourcemap: true,
    })),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildArtifacts();
