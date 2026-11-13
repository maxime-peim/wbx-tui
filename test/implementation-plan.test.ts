import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('implementation ledger retains every consolidated review finding and user request with an assigned phase', async () => {
  const text = await readFile('docs/implementation-plan.md', 'utf8');
  const ledger = text.split('## Coverage ledger\n')[1]?.split('## Verification and delivery rules\n')[0];
  assert.ok(ledger, 'the coverage ledger remains discoverable');
  const rows = [...ledger.matchAll(/^\| ((?:C|U|P|A|D)\d+|USER\d+) \|[^\n]*\| ([1-7]) \|$/gm)];
  const expected = [
    ...Array.from({ length: 7 }, (_, i) => `C${i}`),
    ...Array.from({ length: 9 }, (_, i) => `U${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `P${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `A${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `D${i + 1}`),
    ...Array.from({ length: 6 }, (_, i) => `USER${i + 1}`),
  ];
  assert.deepEqual(rows.map(row => row[1]!).sort(), expected.sort());
  const progress = await readFile('docs/implementation-progress.md', 'utf8');
  for (const id of expected) assert.match(progress, new RegExp(`\\b${id}\\b`), `${id} has an explicit execution record, not only a plan`);
});
