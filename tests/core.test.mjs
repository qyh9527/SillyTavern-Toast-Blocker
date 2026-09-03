import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCK_END,
  BLOCK_START,
  guardToastrMethods,
  hasManagedCss,
  normalizeMaxVisible,
  normalizeSettings,
  stripManagedCss,
  updateManagedCss,
} from '../dist/core.js';

test('settings default to enabled and normalize malformed values', () => {
  const allBlocked = { success: true, info: true, warning: true, error: true };
  assert.deepEqual(normalizeSettings(undefined), {
    enabled: true,
    blockedLevels: allBlocked,
    redrawEnabled: false,
    redrawMaxVisible: 6,
    logSuppressed: false,
    schemaVersion: 3,
  });
  assert.deepEqual(normalizeSettings({ enabled: 0, logSuppressed: 1 }), {
    enabled: false,
    blockedLevels: allBlocked,
    redrawEnabled: false,
    redrawMaxVisible: 6,
    logSuppressed: true,
    schemaVersion: 3,
  });
  assert.deepEqual(normalizeSettings({ blockedLevels: { success: false, error: 0 } }).blockedLevels, {
    success: false,
    info: true,
    warning: true,
    error: false,
  });
});

test('redraw limits are clamped and malformed values migrate safely', () => {
  assert.equal(normalizeMaxVisible('12'), 12);
  assert.equal(normalizeMaxVisible(99), 20);
  assert.equal(normalizeMaxVisible(0), 1);
  assert.equal(normalizeMaxVisible('nope'), 6);
});

test('managed CSS round-trip preserves user CSS exactly', () => {
  const userCss = '.mes { color: red; }\n/* 用户自己的注释 */';
  const installed = updateManagedCss(userCss, true);
  assert.equal(hasManagedCss(installed), true);
  assert.equal(stripManagedCss(installed), userCss);
  assert.equal(updateManagedCss(installed, true), installed);
  assert.equal(updateManagedCss(installed, false), userCss);
});

test('managed CSS targets only selected toast classes', () => {
  const installed = updateManagedCss('', true, {
    success: false,
    info: true,
    warning: false,
    error: true,
  });
  assert.match(installed, /\.toast-info/);
  assert.match(installed, /\.toast-error/);
  assert.doesNotMatch(installed, /\.toast-success/);
  assert.doesNotMatch(installed, /\.toast-warning/);
  assert.equal(updateManagedCss(installed, true, {
    success: false,
    info: false,
    warning: false,
    error: false,
  }), '');
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

test('toastr guard leaves unselected methods completely native', () => {
  const toastr = {
    success: message => `success:${message}`,
    info: message => `info:${message}`,
    warning: message => `warning:${message}`,
    error: message => `error:${message}`,
  };
  const guard = guardToastrMethods(toastr, { methods: ['error'], createResult: () => 'hidden' });
  assert.equal(guard.guardedCount, 1);
  assert.equal(toastr.success('visible'), 'success:visible');
  assert.equal(toastr.error('blocked'), 'hidden');
  guard.restore();
});

test('toastr guard can route calls while retaining the latest native fallback', () => {
  const toastr = { success: message => `original:${message}` };
  const guard = guardToastrMethods(toastr, {
    methods: ['success'],
    handleCall: ({ args, invokeOriginal }) => args[0] === 'native' ? invokeOriginal() : 'routed',
  });
  assert.equal(toastr.success('redraw'), 'routed');
  toastr.success = message => `replacement:${message}`;
  assert.equal(toastr.success('native'), 'replacement:native');
  guard.restore();
});
