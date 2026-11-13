/** One operation's admission, independent of intent/epoch and physical cleanup.
 * Cancellation revokes intent, NOT the slot: the owner releases after its work
 * (and any required native cleanup) settles. No queue, replay or domain state. */
export class OperationSlot {
  private owner?: AbortController;
  busy(): boolean { return this.owner !== undefined; }
  acquire(): AbortController {
    if (this.owner) throw new Error('Operation slot is occupied.');
    return this.owner = new AbortController();
  }
  cancel(): void { this.owner?.abort(); }
  release(owner: AbortController): boolean {
    if (this.owner !== owner) return false;
    this.owner = undefined;
    return true;
  }
}
