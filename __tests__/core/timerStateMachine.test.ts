import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerStateMachine } from '../../src/core/timer/timerStateMachine.ts';

test('TimerStateMachine allows all valid state transitions', () => {
  // IDLE -> START -> RUNNING
  const r1 = TimerStateMachine.transition('IDLE', 'START');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.nextStatus, 'RUNNING');

  // RUNNING -> PAUSE (1st pause)
  const r2 = TimerStateMachine.transition('RUNNING', 'PAUSE', { pauseCount: 0 });
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.nextStatus, 'PAUSED');

  // PAUSED -> RESUME -> RUNNING
  const r3 = TimerStateMachine.transition('PAUSED', 'RESUME');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.nextStatus, 'RUNNING');

  // RUNNING -> PAUSE (2nd pause)
  const r4 = TimerStateMachine.transition('RUNNING', 'PAUSE', { pauseCount: 1 });
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.nextStatus, 'PAUSED');

  // PAUSED -> AUTO_RESUME -> RUNNING
  const r5 = TimerStateMachine.transition('PAUSED', 'AUTO_RESUME');
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.nextStatus, 'RUNNING');

  // RUNNING -> FINISH -> COMPLETED
  const r6 = TimerStateMachine.transition('RUNNING', 'FINISH');
  assert.strictEqual(r6.success, true);
  assert.strictEqual(r6.nextStatus, 'COMPLETED');

  // COMPLETED -> RESET -> IDLE
  const r7 = TimerStateMachine.transition('COMPLETED', 'RESET');
  assert.strictEqual(r7.success, true);
  assert.strictEqual(r7.nextStatus, 'IDLE');

  // RUNNING -> GIVE_UP -> ABANDONED
  const r8 = TimerStateMachine.transition('RUNNING', 'GIVE_UP');
  assert.strictEqual(r8.success, true);
  assert.strictEqual(r8.nextStatus, 'ABANDONED');

  // PAUSED -> GIVE_UP -> ABANDONED
  const r9 = TimerStateMachine.transition('PAUSED', 'GIVE_UP');
  assert.strictEqual(r9.success, true);
  assert.strictEqual(r9.nextStatus, 'ABANDONED');

  // RUNNING -> INTERRUPT -> INTERRUPTED
  const r10 = TimerStateMachine.transition('RUNNING', 'INTERRUPT');
  assert.strictEqual(r10.success, true);
  assert.strictEqual(r10.nextStatus, 'INTERRUPTED');

  // PAUSED -> INTERRUPT -> INTERRUPTED
  const r11 = TimerStateMachine.transition('PAUSED', 'INTERRUPT');
  assert.strictEqual(r11.success, true);
  assert.strictEqual(r11.nextStatus, 'INTERRUPTED');
});

test('TimerStateMachine rejects 3rd pause attempt', () => {
  const result = TimerStateMachine.transition('RUNNING', 'PAUSE', { pauseCount: 2 });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.nextStatus, 'RUNNING');
  assert.ok(result.error?.includes('Maximum pause limit reached'));
});

test('TimerStateMachine rejects invalid transitions', () => {
  // Cannot pause when IDLE
  const r1 = TimerStateMachine.transition('IDLE', 'PAUSE');
  assert.strictEqual(r1.success, false);
  assert.strictEqual(r1.nextStatus, 'IDLE');

  // Cannot finish when IDLE
  const r2 = TimerStateMachine.transition('IDLE', 'FINISH');
  assert.strictEqual(r2.success, false);

  // Cannot start when already RUNNING
  const r3 = TimerStateMachine.transition('RUNNING', 'START');
  assert.strictEqual(r3.success, false);

  // Terminal states cannot pause or finish directly without reset
  const r4 = TimerStateMachine.transition('COMPLETED', 'PAUSE');
  assert.strictEqual(r4.success, false);

  const r5 = TimerStateMachine.transition('ABANDONED', 'START');
  assert.strictEqual(r5.success, false);
});
