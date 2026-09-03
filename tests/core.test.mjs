import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCK_END,
  BLOCK_START,
  guardToastrMethods,
  hasManagedCss,
  normalizeSettings,
  stripManagedCss,
  updateManagedCss,
} from '../dist/core.js';

test('settings default to enabled and normalize malformed values', () => {
  assert.deepEqual(normalizeSettings(undefined), { enabled: true, logSuppressed: false, schemaVersion: 1 });
  assert.deepEqual(normalizeSettings({ enabled: 0, logSuppressed: 1 }), {
    enabled: false,
    logSuppressed: true,
    schemaVersion: 1,
  });
});

test('managed CSS round-trip preserves user CSS exactly', () => {
  const userCss = '.mes { color: red; }\n/* 用户自己的注释 */';
  const installed = updateManagedCss(userCss, true);
  assert.equal(hasManagedCss(installed), true);
  assert.equal(stripManagedCss(installed), userCss);
  assert.equal(updateManagedCss(installed, true), installed);
  assert.equal(updateManagedCss(installed, false), userCss);
});

test('duplicate managed blocks are removed without touching surrounding rules', () => {
  const duplicate = `.a{}\n${BLOCK_START}\nold\n${BLOCK_END}\n.b{}\n${BLOCK_START}\nold2\n${BLOCK_END}\n.c{}`;
  const clean = stripManagedCss(duplicate);
  assert.equal(clean, '.a{}.b{}.c{}');
  assert.equal(hasManagedCss(clean), false);
});

test('toastr guard suppresses calls, accepts later replacements, then restores latest methods', () => {
  const calls = [];
  const original = message => `original:${message}`;
  const replacement = message => `replacement:${message}`;
  const toastr = { success: original, info: original, warning: original, error: original };
  const guard = guardToastrMethods(toastr, {
    onSuppressed: ({ level, args }) => calls.push([level, args[0]]),
    createResult: () => 'sentinel',
  });

  assert.equal(guard.guardedCount, 4);
  assert.equal(toastr.success('hidden'), 'sentinel');
  toastr.success = replacement;
  assert.equal(toastr.success('still hidden'), 'sentinel');
  assert.deepEqual(calls, [['success', 'hidden'], ['success', 'still hidden']]);

  guard.restore();
  assert.equal(toastr.success('visible'), 'replacement:visible');
  assert.equal(toastr.info('visible'), 'original:visible');
});

test('guard gracefully declines invalid targets', () => {
  assert.equal(guardToastrMethods(null), null);
});
