import assert from 'node:assert/strict';
import test from 'node:test';
import { createSelfCheckReport, copyReport } from '../dist/self-check.js';

test('self-check excludes private fields and explains missing guards and early CSS', () => {
  const secret = 'DO-NOT-EXPORT-CHAT-KEY-CSS';
  const report = createSelfCheckReport({
    secret, settings: { secret }, redraw: { secret, rendered: 2 }, guardedMethods: 0,
  }, 'context');
  assert.equal(report.includes(secret), false);
  const parsed = JSON.parse(report);
  assert.equal(parsed.runtime.rendered, 2);
  assert.ok(parsed.findings.some(line => line.includes('早期规则缺失')));
  assert.ok(parsed.findings.some(line => line.includes('方法守卫')));
  assert.equal(parsed.version, '1.4.1');
});

test('clipboard unavailable or denied returns false for manual selection', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    assert.equal(await copyReport('report'), false);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
    assert.equal(await copyReport('report'), false);
    let copied;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => { copied = text; } } } });
    assert.equal(await copyReport('report'), true); assert.equal(copied, 'report');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});
