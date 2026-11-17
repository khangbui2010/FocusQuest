import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageMutex } from '../../src/storage/storageMutex.ts';

test('StorageMutex executes concurrent tasks sequentially without race condition', async () => {
  const mutex = new StorageMutex();
  let counter = 0;
  const executionOrder: number[] = [];

  const runTask = (id: number) =>
    mutex.runExclusive(async () => {
      const current = counter;
      // Artificial delay to induce race conditions if uncoordinated
      await new Promise((resolve) => setTimeout(resolve, 10));
      counter = current + 1;
      executionOrder.push(id);
      return counter;
    });

  // Launch 15 tasks concurrently
  const promises = Array.from({ length: 15 }, (_, i) => runTask(i));
  const results = await Promise.all(promises);

  assert.strictEqual(counter, 15, 'Counter should be incremented exactly 15 times without lost updates');
  assert.strictEqual(executionOrder.length, 15, 'All 15 tasks should finish');
  assert.deepStrictEqual(
    executionOrder,
    Array.from({ length: 15 }, (_, i) => i),
    'Tasks should be executed in strict FIFO order'
  );
  assert.strictEqual(results[results.length - 1], 15);
});
