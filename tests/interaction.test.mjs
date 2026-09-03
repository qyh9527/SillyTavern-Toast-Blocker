import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimedConfirmation } from '../dist/interaction.js';

test('dangerous action requires two activations inside the confirmation window', () => {
  const tasks = new Map();
  let nextId = 0;
  let expired = 0;
  const guard = createTimedConfirmation({
    onExpired: () => { expired += 1; },
    setTimer: callback => {
      const id = ++nextId;
      tasks.set(id, callback);
      return id;
    },
    clearTimer: id => tasks.delete(id),
  });

  assert.equal(guard.activate(), 'armed');
  assert.equal(guard.isArmed(), true);
  assert.equal(guard.activate(), 'confirmed');
  assert.equal(guard.isArmed(), false);
  assert.equal(tasks.size, 0);
  assert.equal(expired, 0);
});

test('confirmation expires and the next activation starts a new window', () => {
  let pending;
  let expired = 0;
  const guard = createTimedConfirmation({
    onExpired: () => { expired += 1; },
    setTimer: callback => {
      pending = callback;
      return 1;
    },
    clearTimer: () => { pending = undefined; },
  });

  assert.equal(guard.activate(), 'armed');
  pending();
  assert.equal(expired, 1);
  assert.equal(guard.isArmed(), false);
  assert.equal(guard.activate(), 'armed');
});
