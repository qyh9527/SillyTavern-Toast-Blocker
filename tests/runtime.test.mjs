import assert from 'node:assert/strict';
import test from 'node:test';
import { ToastRuntimeBlocker } from '../dist/runtime.js';

test('runtime blocker suppresses then restores toastr methods', () => {
  const nodes = new Map();
  const queriedSelectors = [];
  const rootClasses = new Set();
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalToastr = globalThis.toastr;
  const originalJQuery = globalThis.jQuery;

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  globalThis.document = {
    documentElement: {
      classList: {
        add(name) {
          rootClasses.add(name);
        },
      },
    },
    head: {
      append(node) {
        nodes.set(node.id, node);
      },
    },
    createElement() {
      return {
        id: '',
        textContent: '',
        remove() {
          nodes.delete(this.id);
        },
      };
    },
    getElementById(id) {
      return nodes.get(id) || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      queriedSelectors.push(selector);
      return [];
    },
  };
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.jQuery = () => ({ length: 0 });
  globalThis.toastr = {
    success: message => `success:${message}`,
    info: message => `info:${message}`,
    warning: message => `warning:${message}`,
    error: message => `error:${message}`,
  };

  try {
    let count = 0;
    const blocker = new ToastRuntimeBlocker({ onSuppressed: () => { count += 1; } });
    blocker.configure({
      blockerEnabled: true,
      blockedLevels: { success: false, info: false, warning: false, error: true },
      redrawEnabled: false,
      redrawMaxVisible: 6,
      redrawAggregateDuplicates: true,
      diagnosticsEnabled: false,
    });
    assert.deepEqual(globalThis.toastr.error('hidden'), { length: 0 });
    assert.equal(globalThis.toastr.success('visible'), 'success:visible');
    assert.equal(count, 1);
    assert.deepEqual(blocker.getStatus(), {
      enabled: true,
      redrawEnabled: false,
      blockedMethods: ['error'],
      guardedMethods: 1,
      auxiliaryMethods: 0,
      observingDom: true,
      runtimeStyle: true,
      redraw: {
        enabled: false,
        active: 0,
        adoptedActive: 0,
        pending: 0,
        rendered: 0,
        evicted: 0,
        fallbacks: 0,
        maxVisible: 6,
        aggregated: 0,
        pendingPeak: 0,
        visibilityPauses: 0,
        pausedForVisibility: 0,
        diagnosticsEnabled: false,
        frameSamples: 0,
        averageBatchMs: 0,
        maxBatchMs: 0,
        overBudgetBatches: 0,
        observedLongFrames: 0,
        maxObservedLongFrameMs: 0,
        observerType: null,
      },
    });
    assert.ok(queriedSelectors.includes('#toast-container > .toast-error'));
    assert.equal(queriedSelectors.includes('#toast-container > .toast-success'), false);

    blocker.renderer.show = (level, args) => `redraw:${level}:${args[0]}`;
    blocker.configure({
      blockerEnabled: true,
      blockedLevels: { success: false, info: false, warning: false, error: true },
      redrawEnabled: true,
      redrawMaxVisible: 4,
      redrawAggregateDuplicates: true,
      diagnosticsEnabled: false,
    });
    assert.deepEqual(globalThis.toastr.error('blocked wins'), { length: 0 });
    assert.equal(globalThis.toastr.info('redrawn'), 'redraw:info:redrawn');
    assert.equal(blocker.getStatus().guardedMethods, 4);
    assert.equal(blocker.getStatus().auxiliaryMethods, 2);
    assert.equal(rootClasses.has('qyh-toast-redraw-ready'), true);
    assert.ok(queriedSelectors.includes('#toast-container > .toast'));

    blocker.setEnabled(false);
    assert.equal(globalThis.toastr.error('redrawn after blocker closes'), 'redraw:error:redrawn after blocker closes');
    assert.equal(blocker.getStatus().runtimeStyle, false);

    blocker.configure({
      blockerEnabled: true,
      blockedLevels: { success: false, info: false, warning: false, error: false },
      redrawEnabled: false,
      redrawMaxVisible: 6,
      redrawAggregateDuplicates: true,
      diagnosticsEnabled: false,
    });
    assert.equal(globalThis.toastr.error('still visible'), 'error:still visible');
    assert.deepEqual(blocker.getStatus(), {
      enabled: true,
      redrawEnabled: false,
      blockedMethods: [],
      guardedMethods: 0,
      auxiliaryMethods: 0,
      observingDom: false,
      runtimeStyle: false,
      redraw: {
        enabled: false,
        active: 0,
        adoptedActive: 0,
        pending: 0,
        rendered: 0,
        evicted: 0,
        fallbacks: 0,
        maxVisible: 6,
        aggregated: 0,
        pendingPeak: 0,
        visibilityPauses: 0,
        pausedForVisibility: 0,
        diagnosticsEnabled: false,
        frameSamples: 0,
        averageBatchMs: 0,
        maxBatchMs: 0,
        overBudgetBatches: 0,
        observedLongFrames: 0,
        maxObservedLongFrameMs: 0,
        observerType: null,
      },
    });
  } finally {
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
    globalThis.toastr = originalToastr;
    globalThis.jQuery = originalJQuery;
  }
});

test('runtime observer targets the toast container only once it exists', () => {
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalToastr = globalThis.toastr;
  const originalJQuery = globalThis.jQuery;
  const observeTargets = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      observeTargets.push({ target, options, subtree: Boolean(options && options.subtree) });
    }
    disconnect() {}
  }

  let container = null;
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#toast-container' && container) return container;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
    createElement() {
      return { id: '', textContent: '' };
    },
    head: { append() {} },
    documentElement: { classList: { add() {} } },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: 'visible',
  };
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.toastr = {
    success: () => '',
    info: () => '',
    warning: () => '',
    error: () => '',
  };
  globalThis.jQuery = () => ({ length: 0 });

  try {
    const blocker = new ToastRuntimeBlocker({});
    blocker.configure({
      blockerEnabled: true,
      blockedLevels: { success: true, info: true, warning: true, error: true },
      redrawEnabled: false,
      redrawMaxVisible: 6,
      redrawAggregateDuplicates: true,
      diagnosticsEnabled: false,
    });
    assert.equal(blocker.getStatus().observingDom, true);
    assert.equal(blocker.bootObserving, true);
    // 容器缺失时应该监听整棵子树（documentElement），且只监听一次。
    const rootTargets = observeTargets.filter(entry => entry.subtree === true);
    assert.equal(rootTargets.length, 1);

    // 主文档下后来出现 #toast-container：看电视狗带容器回来时立刻换成定向监听。
    container = { id: 'toast-container', toastChildren: [] };
    const before = observeTargets.length;
    blocker.runWatchdogTick();
    const subtrees = observeTargets.slice(before).filter(entry => entry.subtree === true);
    assert.equal(subtrees.length, 0);
    assert.ok(observeTargets.slice(before).some(entry => entry.target === container));
    assert.equal(blocker.bootObserving, false);
    // 定向监听只关注容器 childList。
    const containerEntries = observeTargets.slice(before).filter(entry => entry.target === container);
    assert.deepEqual(containerEntries.map(entry => entry.options), [{ childList: true }]);
    blocker.stopWatchdog();
  } finally {
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
    globalThis.toastr = originalToastr;
    globalThis.jQuery = originalJQuery;
  }
});

test('delayed container retargets the same observer, cleans immediately and handles replacement', () => {
  const previousDocument = globalThis.document;
  const previousObserver = globalThis.MutationObserver;
  let container = null;
  let cleanups = 0;
  const root = {};
  const observations = [];
  const observers = [];
  globalThis.document = {
    documentElement: root,
    querySelector: () => container,
    querySelectorAll: () => { cleanups++; return []; },
  };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { observations.push({ target, options }); }
    disconnect() {}
  };
  const runtime = new ToastRuntimeBlocker();
  try {
    runtime.startObserver();
    assert.equal(observers.length, 1);
    assert.equal(observations[0].target, root);
    container = { isConnected: true };
    observers[0].callback();
    assert.equal(runtime.bootObserving, false);
    assert.equal(observations.at(-1).target, container);
    assert.equal(observations.at(-1).options.subtree, undefined);
    assert.ok(cleanups > 0);
    runtime.enabled = true;
    runtime.ensureRuntimeStyle = () => {};
    runtime.patchCurrentToastr = () => {};
    container.isConnected = false;
    container = { isConnected: true };
    runtime.runWatchdogTick();
    assert.equal(observations.at(-1).target, container);
    assert.equal(runtime.observedContainer, container);
  } finally {
    runtime.stopObserver(); runtime.stopWatchdog();
    globalThis.document = previousDocument; globalThis.MutationObserver = previousObserver;
  }
});

test('watchdog does not start while page is already hidden', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {} };
  const runtime = new ToastRuntimeBlocker();
  try { runtime.startWatchdog(); assert.equal(runtime.watchdog, null); }
  finally { runtime.stopWatchdog(); globalThis.document = previousDocument; }
});
