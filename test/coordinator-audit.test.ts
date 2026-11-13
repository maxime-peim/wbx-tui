import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCoordinators, partitionErrors, typescriptInventory, vimInventory } from '../scripts/audit-coordinators.js';

test('bounded coordinator audit maps every field/routine/projection exactly once with existing trace and coverage anchors', async () => {
  const report = await auditCoordinators();
  assert.deepEqual(report.errors, []);
  assert.equal(report.responsibilities, 30);
  assert.ok(report.projectedFields > 25);
  assert.equal(report.checklist.filter(item => item.kind === 'confirmed-defect').length, 2);
  assert.equal(report.checklist.filter(item => item.kind === 'coverage-gap').length, 2);
  assert.equal(report.checklist.filter(item => item.kind === 'external-acceptance').length, 3);
  assert.equal(report.checklist.find(item => item.id === 'C2')?.status, 'closed');
  assert.equal(report.checklist.find(item => item.id === 'C1')?.status, 'closed');
  assert.equal(report.checklist.find(item => item.id === 'C3')?.status, 'closed');
  assert.equal(report.checklist.find(item => item.id === 'C4')?.status, 'closed');
  assert.deepEqual(report.checklist.filter(item => item.status === 'open'), []);
});

test('audit inventories constructor-injected fields and hidden native callback state rather than counting only top-level lets', () => {
  assert.deepEqual(typescriptInventory('fixture.ts', `class Owner {
    private active = false;
    constructor(readonly physical: object, ignored: string) {}
    snapshot() { return {}; }
  }
  function runOwner() {}`, 'Owner'), { fields: ['active', 'physical'], methods: ['constructor', 'snapshot'], moduleFunctions: ['runOwner'] });
  assert.deepEqual(vimInventory(`let s:owner = {}
function! s:later() abort
  let local = 1
  let s:hidden = {}
  let s:owner.ready = 1
  let g:payload = {}
endfunction`), { fields: ['s:owner', 's:hidden', 'g:payload'], methods: ['s:later'], moduleFunctions: [] });
});

test('audit rejects new, removed or multiply assigned responsibilities instead of silently accepting inventory drift', () => {
  const actual = { fields: ['newState'], methods: ['newMethod'], moduleFunctions: [] };
  assert.deepEqual(partitionErrors(actual, []), ['Unmapped fields: newState', 'Unmapped methods: newMethod']);
  assert.deepEqual(partitionErrors({ fields: [], methods: [], moduleFunctions: [] }, [
    { fields: [{ names: ['stale'], lifetime: 'never' }], methods: [], moduleFunctions: [] } as any,
  ]), ['Stale fields: stale']);
  assert.deepEqual(partitionErrors({ fields: ['shared'], methods: [], moduleFunctions: [] }, [
    { fields: [{ names: ['shared', 'shared'], lifetime: 'never' }], methods: [] } as any,
  ]), ['Duplicate fields: shared']);
});
