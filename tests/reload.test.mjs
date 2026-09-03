import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleReloadScheduler } from '../dist/reload.js';

test('update reload is deferred and scheduled at most once', () => {
  const tasks = [];
  let reloads = 0;
  const schedule = createSingleReloadScheduler({
    defer: callback => tasks.push(callback),
    reload: () => { reloads += 1; },
  });

  assert.equal(schedule(), true);
  assert.equal(schedule(), false);
  assert.equal(reloads, 0);
  assert.equal(tasks.length, 1);
  tasks[0]();
  assert.equal(reloads, 1);
});
