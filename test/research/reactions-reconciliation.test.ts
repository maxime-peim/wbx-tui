/** Research simulation, NOT a provider adapter or runtime feature.
 * Synthetic normalized summaries below are assumptions, not Webex wire schemas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

class Simulation {
  epoch = 0; account = ''; room = '';
  rows = new Map<string, { counts: Record<string, number>; own: string[]; at: number; dirty: boolean }>();
  hints = new Set<string>();
  saturated = false;
  mutations = new Map<string, { identity: string; status: 'unknown' | 'changed' | 'resolved'; target: string }>();
  writes = 0;
  // Deliberately not connected to message creation/unread/receipt owners.
  evidence = Object.freeze({ creations: 0, unread: 0, receipts: 0 });
  select(account: string, room: string) {
    this.epoch++; this.account = account; this.room = room; this.rows.clear(); this.hints.clear(); this.saturated = false;
  }
  capture(message: string) { return { epoch: this.epoch, account: this.account, room: this.room, message, hints: this.hints.size }; }
  summary(binding: ReturnType<Simulation['capture']>, counts: Record<string, number>, own: string[], at: number) {
    if (this.saturated || binding.epoch !== this.epoch || binding.room !== this.room || binding.account !== this.account
      || binding.hints !== this.hints.size || Object.keys(counts).length > 16 || own.length > 16
      || Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0)) return false;
    if (!this.rows.has(binding.message) && this.rows.size >= 64) return false;
    this.rows.set(binding.message, { counts: { ...counts }, own: [...own], at, dirty: false }); return true;
  }
  hint(event: string, message: string) {
    if (this.hints.has(event)) return;
    // Overflow requires discarding the sample, never count arithmetic/replay.
    if (this.hints.size >= 256) { this.saturated = true; for (const row of this.rows.values()) row.dirty = true; return; }
    this.hints.add(event);
    const row = this.rows.get(message); if (row) row.dirty = true;
  }
  ownRemoval(message: string, reaction: string, now: number) {
    const row = this.rows.get(message);
    return !!row && !row.dirty && now >= row.at && now - row.at < 30000 && row.own.includes(reaction);
  }
  mutate(request: string, target: string, operation: string, result: 'unknown' | 'changed') {
    const identity = JSON.stringify([this.account,this.room,target,operation]), key = JSON.stringify([this.account,request]);
    const boundTarget = JSON.stringify([this.account,this.room,target]), old = this.mutations.get(key);
    if (old) { if (old.identity !== identity) throw new Error('conflicting reuse'); return old.status; }
    if (this.mutations.size >= 32 || [...this.mutations.values()].some(item => item.target === boundTarget && item.status === 'unknown')) throw new Error('unavailable');
    this.writes++; this.mutations.set(key, { identity, status:result, target:boundTarget }); return result;
  }
  resolve(request: string, target: string, operation: string, checked: boolean): boolean {
    const value = this.mutations.get(JSON.stringify([this.account,request]));
    if (!checked || !value || value.status !== 'unknown' || value.identity !== JSON.stringify([this.account,this.room,target,operation])) return false;
    value.status = 'resolved'; return true; // checked uncertainty, NOT a server success.
  }
}
test('research simulation: summaries replace counts; duplicate/out-of-order hints only invalidate, never imply message/read evidence', () => {
  const s = new Simulation(); s.select('account', 'room');
  assert.ok(s.summary(s.capture('root'), { heart: 4 }, ['own-root-reaction'], 1000));
  assert.ok(s.summary(s.capture('reply'), { heart: 1 }, ['own-reply-reaction'], 1000));
  const pending = s.capture('root');
  s.hint('newer', 'root'); s.hint('older', 'root'); s.hint('older', 'root');
  assert.deepEqual(s.rows.get('root')!.counts, { heart: 4 }, 'no optimistic plus/minus counts on opaque events');
  assert.equal(s.hints.size, 2);
  assert.equal(s.summary(pending, { heart: 2 }, [], 2000), false, 'late response cannot overwrite a hint observed after admission');
  assert.ok(s.summary(s.capture('root'), { heart: 3 }, ['own-root-reaction'], 2000));
  assert.deepEqual(s.rows.get('root')!.counts, { heart: 3 }, 'new sample replaces, never adds to stale summary');
  assert.equal(s.ownRemoval('root', 'own-reply-reaction', 2100), false);
  assert.equal(s.ownRemoval('reply', 'own-reply-reaction', 2100), true, 'reply maps to its own activity, not thread root');
  assert.deepEqual(s.evidence, { creations: 0, unread: 0, receipts: 0 });
});
test('research simulation: own versus other removal, stale counts, unknown add/undo races and no replay', () => {
  const s = new Simulation(); s.select('account', 'room');
  s.summary(s.capture('root'), { heart: 2 }, ['exact-own'], 1000);
  assert.equal(s.ownRemoval('root', 'other-person-reaction', 1100), false);
  assert.equal(s.ownRemoval('root', 'exact-own', 31000), false);
  assert.equal(s.mutate('add', 'root', 'heart', 'unknown'), 'unknown');
  assert.equal(s.mutate('add', 'root', 'heart', 'changed'), 'unknown', 'replayed request returns retained outcome, not new write');
  assert.throws(() => s.mutate('new-id', 'root', 'delete:exact-own', 'changed'), 'unknown add prevents an automatic undo/delete');
  assert.equal(s.writes, 1);
  s.hint('removed', 'root');
  assert.equal(s.ownRemoval('root', 'exact-own', 1100), false, 'freshness cannot override invalidation');
  assert.throws(() => s.mutate('add', 'reply', 'heart', 'changed'));
});
test('research simulation: account/room switches fence pending summaries and reset own-ID caches, all budgets remain bounded', () => {
  const s = new Simulation(); s.select('first', 'room');
  const pending = s.capture('root'); s.select('second', 'room');
  assert.equal(s.summary(pending, { heart: 99 }, ['foreign-account-reaction'], 1000), false);
  const second = s.capture('root'); s.select('second', 'another-room');
  assert.equal(s.summary(second, { heart: 99 }, [], 1000), false);
  for (let i = 0; i < 64; i++) assert.ok(s.summary(s.capture('message-' + i), {}, [], 1000));
  assert.equal(s.summary(s.capture('overflow'), {}, [], 1000), false);
  for (let i = 0; i < 1000; i++) s.hint('event-' + i, 'message-0');
  assert.equal(s.hints.size, 256); assert.equal(s.rows.size, 64);
  assert.equal(s.summary(s.capture('message-0'), { heart: 99 }, [], 1000), false, 'saturation cannot turn a late sample into fresh own-reaction authority');
  for (let i = 0; i < 32; i++) s.mutate('id-' + i, 'target-' + i, 'heart', 'changed');
  assert.throws(() => s.mutate('overflow', 'another-target', 'heart', 'changed'));
  assert.equal(s.writes, 32);
  assert.deepEqual(s.evidence, { creations: 0, unread: 0, receipts: 0 });
});
test('research simulation: changing the visible room/account cannot erase retained unknown mutation admission', () => {
  const s = new Simulation(); s.select('first','room');
  assert.equal(s.mutate('original','root','heart','unknown'),'unknown');
  s.select('first','another-room');
  s.select('first','room');
  assert.throws(() => s.mutate('different-id','root','heart','changed'),'room reopen cannot authorize an implicit retry');
  s.select('second','room');
  assert.equal(s.mutate('original','root','heart','changed'),'changed','another account has a different target/request namespace');
  s.select('first','room');
  assert.equal(s.mutate('original','root','heart','changed'),'unknown','switching back retains the original uncertain outcome');
  assert.throws(() => s.mutate('remove','root','delete:exact-own','changed'),'uncertain add also blocks an automatic undo');
  assert.equal(s.writes,2);
});
test('research simulation: resolution is correlated inspection, never replay or fabricated success; full ledger refuses instead of evicting', () => {
  const s = new Simulation(); s.select('account','room');
  s.mutate('original','root','heart','unknown');
  for (const [request,target,operation,checked] of [
    ['original','root','heart',false],['other','root','heart',true],['original','reply','heart',true],['original','root','delete:own',true],
  ] as const) assert.equal(s.resolve(request,target,operation,checked),false);
  s.select('account','elsewhere'); assert.equal(s.resolve('original','root','heart',true),false);
  s.select('other-account','room'); assert.equal(s.resolve('original','root','heart',true),false);
  s.select('account','room');
  assert.equal(s.resolve('original','root','heart',true),true); assert.equal(s.writes,1);
  assert.equal(s.mutate('original','root','heart','changed'),'resolved','same request ID never becomes a new write');
  assert.equal(s.mutate('new-explicit','root','heart','changed'),'changed');
  s.mutate('retained-unknown','reply','heart','unknown');
  for (let i=0;i<29;i++) s.mutate('fill-'+i,'another-'+i,'heart','changed');
  s.select('account','elsewhere'); s.select('account','room');
  assert.throws(() => s.mutate('overflow','fresh','heart','changed'));
  assert.equal(s.mutate('retained-unknown','reply','heart','changed'),'unknown','saturation does not evict uncertain identity');
  assert.equal(s.writes,32);
});
