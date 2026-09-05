import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiagnosticView } from '../dist/diagnostics-view.js';

const sample = () => ({
  earlyRuleInstalled: true, runtimeStyle: true, guardedMethods: 4, auxiliaryMethods: 2,
  settings: { enabled: true, blockedLevels: { success: true, info: true, warning: true, error: false },
    redrawEnabled: true, redrawMaxVisible: 6, diagnosticsEnabled: true },
  redraw: { active: 0, pending: 0, adoptedActive: 0, frameSamples: 0, averageBatchMs: 0,
    maxBatchMs: 0, observerType: 'long-animation-frame', observedLongFrames: 152, maxObservedLongFrameMs: 587.4 },
});

test('device report with page long frames stays healthy and zero batches mean no samples', () => {
  const view = buildDiagnosticView(sample(), 'mixed');
  assert.equal(view.summary, '通知链路正常');
  assert.equal(view.tone, 'ok');
  assert.equal(view.adapter, '混合适配 · 正常');
  assert.equal(view.batch, '暂无批次样本');
  assert.equal(view.page, '152 次');
  assert.equal(view.pageNote, '最长 587.4 ms');
  assert.equal(view.budget, 0);
});

test('missing guard shows a warning and measured batches use bounded budget bars', () => {
  const status = sample(); status.guardedMethods = 2;
  status.redraw.frameSamples = 3; status.redraw.averageBatchMs = 30;
  const view = buildDiagnosticView(status, 'context');
  assert.equal(view.tone, 'warning'); assert.equal(view.guards, '2 / 4');
  assert.equal(view.batch, '30.00 ms'); assert.equal(view.budget, 100);
});

test('disabled diagnostics and missing page support are distinct from zero-cost measurements', () => {
  const status = sample(); status.settings.diagnosticsEnabled = false;
  status.redraw.observerType = null; status.redraw.observedLongFrames = 0;
  assert.equal(buildDiagnosticView(status, 'legacy').page, '尚未采集');
  status.settings.diagnosticsEnabled = true;
  assert.equal(buildDiagnosticView(status, 'legacy').page, '当前环境不支持');
});
