/**
 * Minimal FIFO queue for in-process background jobs (catalog imports and
 * inventory bulk edits). Bounds how many heavy jobs run at once so N
 * simultaneous uploads cannot exhaust CPU/memory: excess jobs stay in DB
 * status "queued" and start automatically when a slot frees up.
 *
 * In-process by design — this deployment runs a single Node server that both
 * serves the API and executes jobs. If the app ever runs as multiple
 * replicas, replace with an external queue (e.g. BullMQ + Redis).
 */

type JobRunner = () => Promise<void>;

export class BackgroundJobQueue {
  private readonly waiting: Array<{ id: string; run: JobRunner }> = [];
  private readonly active = new Set<string>();
  private readonly waitingIds = new Set<string>();

  constructor(private readonly concurrency: number) {}

  /** Enqueue a job by id. Duplicate ids (already waiting or running) are ignored. */
  enqueue(id: string, run: JobRunner): void {
    if (this.active.has(id) || this.waitingIds.has(id)) return;
    this.waiting.push({ id, run });
    this.waitingIds.add(id);
    this.drain();
  }

  /** True while the job is waiting for a slot or currently running. */
  has(id: string): boolean {
    return this.active.has(id) || this.waitingIds.has(id);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  private drain(): void {
    while (this.active.size < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      this.waitingIds.delete(next.id);
      this.active.add(next.id);
      next
        .run()
        .catch((e) => console.error(`Background job ${next.id} crashed:`, e))
        .finally(() => {
          this.active.delete(next.id);
          this.drain();
        });
    }
  }
}

/**
 * Global cap across ALL heavy background jobs (catalog + inventory). Two at a
 * time keeps memory bounded while still overlapping I/O-heavy phases (image
 * downloads/uploads) of one job with the CPU phase of another.
 */
const GLOBAL_JOB_CONCURRENCY = 2;

export const backgroundJobQueue = new BackgroundJobQueue(GLOBAL_JOB_CONCURRENCY);
