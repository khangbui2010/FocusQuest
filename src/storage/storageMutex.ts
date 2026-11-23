/**
 * StorageMutex serializes async read-modify-write operations to prevent
 * lost updates and race conditions across concurrent callers.
 */
export class StorageMutex {
  private queue: Promise<void> = Promise.resolve();

  /**
   * Run a task within the mutex lock.
   * Tasks are guaranteed to execute sequentially in FIFO order.
   */
  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.queue;
    this.queue = this.queue.then(() => nextLock);

    try {
      await previousLock;
      return await task();
    } finally {
      releaseLock!();
    }
  }
}
