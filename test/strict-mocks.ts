import assert from 'node:assert/strict';
import type { ActionREST } from '../src/public-rest.js';

/** Production may translate a thrown assertion into an expected failure result.
 * Check recorded violations OUTSIDE that production catch, in test cleanup. */
export class StrictMocks {
  private violations: string[] = [];
  /** Keep replacement callbacks strict too; races often replace rest.call after
   * construction. Mutate only the test fixture, never the production owner. */
  track(rest: ActionREST): void {
    let call = this.wrap(rest.call);
    Object.defineProperty(rest, 'call', { configurable: true, enumerable: true,
      get: () => call, set: (work: ActionREST['call']) => { call = this.wrap(work); } });
  }
  wrap(work: ActionREST['call']): ActionREST['call'] {
    return async (...args) => {
      try { return await work(...args); }
      catch (error) {
        if (error instanceof assert.AssertionError) this.violations.push(error.stack ?? error.message);
        throw error;
      }
    };
  }
  verify(): void {
    const violations = this.violations.splice(0);
    assert.deepEqual(violations, [], 'Mock assertions were caught by production instead of satisfying the expected request contract');
  }
}
