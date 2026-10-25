/**
 * Linear undo/redo over immutable snapshots. Consecutive commits with the same `key`
 * inside `coalesceMs` (e.g. scrubbing a slider) collapse into a single undo step.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | undefined;
  private lastAt = 0;

  constructor(
    private present: T,
    private readonly limit = 200,
    private readonly coalesceMs = 700,
  ) {}

  get value(): T {
    return this.present;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  commit(next: T, key?: string, now = Date.now()): T {
    const coalesce = key !== undefined && key === this.lastKey && now - this.lastAt < this.coalesceMs;
    if (!coalesce) {
      this.past.push(this.present);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.present = next;
    this.future = [];
    this.lastKey = key;
    this.lastAt = now;
    return next;
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev === undefined) return this.present;
    this.future.push(this.present);
    this.present = prev;
    this.lastKey = undefined;
    return prev;
  }

  redo(): T {
    const next = this.future.pop();
    if (next === undefined) return this.present;
    this.past.push(this.present);
    this.present = next;
    this.lastKey = undefined;
    return next;
  }

  /** Replace the present without recording history (e.g. a sync from another tab). */
  reset(value: T) {
    this.present = value;
    this.past = [];
    this.future = [];
    this.lastKey = undefined;
  }
}
