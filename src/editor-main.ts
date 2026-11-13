import { runEditorWorker } from './editor-worker.js';

// Dedicated editor entry point: no standalone UI, terminal probing or Chromium
// imports. Meeting launch attaches to the existing media engine only on request.
runEditorWorker(process.argv.slice(2)).catch(() => {
  process.stderr.write('wbx-tui editor backend failed. No provider details were logged.\n');
  process.exitCode = 1;
});
