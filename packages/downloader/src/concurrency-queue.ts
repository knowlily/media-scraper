/**
 * Concurrency queue that limits the number of parallel tasks
 * and optionally enforces a rate limit.
 */
export class ConcurrencyQueue {
  private concurrency: number;
  private rateLimit: number;
  private running = 0;
  private queue: Array<{
    task: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private lastReleaseTime = 0;

  constructor(concurrency: number, rateLimit: number = Infinity) {
    this.concurrency = concurrency;
    this.rateLimit = rateLimit;
  }

  /**
   * Add a task to the queue. Returns a promise that resolves when the task completes.
   */
  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.drain();
    });
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;
      this.executeTask(item).finally(() => {
        this.running--;
        this.drain();
      });
    }
  }

  private async executeTask(item: {
    task: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }): Promise<void> {
    try {
      // Rate limiting
      if (this.rateLimit !== Infinity) {
        const now = Date.now();
        const elapsed = now - this.lastReleaseTime;
        const minInterval = 1000 / this.rateLimit; // time per "byte" doesn't make sense for task-level, so rateLimit is tasks/sec
        if (elapsed < minInterval) {
          await new Promise((r) => setTimeout(r, minInterval - elapsed));
        }
        this.lastReleaseTime = Date.now();
      }

      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }
}
