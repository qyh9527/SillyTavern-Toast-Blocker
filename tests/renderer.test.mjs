import assert from 'node:assert/strict';
import test from 'node:test';
import { LightweightToastRenderer, guardToastrAuxiliaryMethods } from '../dist/renderer.js';

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  add(...names) {
    for (const name of names) this.element.classes.add(name);
  }

  remove(...names) {
    for (const name of names) this.element.classes.delete(name);
  }

  contains(name) {
    return this.element.classes.has(name);
  }

  toggle(name, force) {
    const enabled = force ?? !this.contains(name);
    if (enabled) this.add(name);
    else this.element.classes.delete(name);
    return enabled;
  }
}

class FakeFragment {
  nodeType = 11;
  children = [];

  append(...nodes) {
    this.children.push(...nodes);
  }
}

class FakeElement {
  nodeType = 1;
  classes = new Set();
  children = [];
  attributes = new Map();
  events = new Map();
  isConnected = false;
  parentElement = null;
  styleValues = new Map();
  textContent = '';
  innerHTML = '';
  type = '';

  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList(this);
    this.style = { setProperty: (name, value) => this.styleValues.set(name, value) };
  }

  set className(value) {
    this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get className() {
    return [...this.classes].join(' ');
  }

  get childElementCount() {
    return this.children.length;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, listener) {
    const listeners = this.events.get(name) ?? [];
    listeners.push(listener);
    this.events.set(name, listeners);
  }

  append(...nodes) {
    this.insert(nodes, false);
  }

  prepend(...nodes) {
    this.insert(nodes, true);
  }

  insert(nodes, prepend) {
    const expanded = nodes.flatMap(node => node?.nodeType === 11 ? node.children : [node]);
    for (const node of expanded) {
      if (!node) continue;
      if (node.parentElement) {
        const oldIndex = node.parentElement.children.indexOf(node);
        if (oldIndex >= 0) node.parentElement.children.splice(oldIndex, 1);
      }
      node.parentElement = this;
      node.setConnected(this.isConnected);
    }
    if (prepend) this.children.unshift(...expanded);
    else this.children.push(...expanded);
  }

  setConnected(value) {
    this.isConnected = value;
    for (const child of this.children) child.setConnected(value);
  }

  remove() {
    if (this.parentElement) {
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
    this.setConnected(false);
  }

  contains(node) {
    return node === this || this.children.some(child => child.contains(node));
  }

  querySelector(selector) {
    if (!selector.startsWith('.')) return null;
    const className = selector.slice(1);
    const queue = [...this.children];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.classList.contains(className)) return current;
      queue.push(...current.children);
    }
    return null;
  }

  animate() {
    return { pause() {}, play() {}, cancel() {} };
  }
}

function installFakeBrowser({ performanceObserver } = {}) {
  const originals = {
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    document: globalThis.document,
    jQuery: globalThis.jQuery,
    PerformanceObserver: globalThis.PerformanceObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const body = new FakeElement('body');
  body.setConnected(true);
  const frames = [];
  const documentEvents = new Map();
  const fakeDocument = {
    activeElement: null,
    body,
    hidden: false,
    visibilityState: 'visible',
    addEventListener(name, listener) {
      const listeners = documentEvents.get(name) ?? [];
      listeners.push(listener);
      documentEvents.set(name, listeners);
    },
    removeEventListener(name, listener) {
      const listeners = documentEvents.get(name) ?? [];
      documentEvents.set(name, listeners.filter(candidate => candidate !== listener));
    },
    createDocumentFragment: () => new FakeFragment(),
    createElement: tag => new FakeElement(tag),
    querySelector: selector => selector === 'body' ? body : null,
  };
  globalThis.document = fakeDocument;
  globalThis.jQuery = value => value === undefined ? { length: 0 } : { 0: value, length: 1 };
  if (performanceObserver) globalThis.PerformanceObserver = performanceObserver;
  globalThis.requestAnimationFrame = callback => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  return {
    body,
    frames,
    setVisibility(state) {
      fakeDocument.visibilityState = state;
      fakeDocument.hidden = state === 'hidden';
      for (const listener of documentEvents.get('visibilitychange') ?? []) listener();
    },
    restore() {
      globalThis.cancelAnimationFrame = originals.cancelAnimationFrame;
      globalThis.document = originals.document;
      globalThis.jQuery = originals.jQuery;
      globalThis.PerformanceObserver = originals.PerformanceObserver;
      globalThis.requestAnimationFrame = originals.requestAnimationFrame;
    },
  };
}

test('redraw renderer batches a burst into one frame and enforces its DOM ceiling', async () => {
  const browser = installFakeBrowser();
  try {
    let hidden = 0;
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 2);
    const options = { timeOut: 0, hideDuration: 0, onHidden: () => { hidden += 1; } };
    const first = renderer.show('info', ['one', '', options], () => 'fallback', {});
    renderer.show('success', ['two', '', options], () => 'fallback', {});
    const third = renderer.show('error', ['three', '', options], () => 'fallback', {});

    assert.equal(renderer.getStats().pending, 3);
    assert.equal(browser.body.children.length, 0);
    await Promise.resolve();
    assert.equal(browser.frames.length, 1);
    browser.frames.shift()(16);

    assert.equal(renderer.getStats().pending, 0);
    assert.equal(renderer.getStats().active, 2);
    assert.equal(renderer.getStats().rendered, 3);
    assert.equal(renderer.getStats().evicted, 1);
    assert.equal(hidden, 1);
    assert.equal(renderer.ownsHandle(first), false);
    assert.equal(renderer.ownsHandle(third), true);
    assert.equal(browser.body.children[0].children.length, 2);

    assert.equal(renderer.clear(third, { force: true, immediate: true }), true);
    assert.equal(renderer.getStats().active, 1);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('redraw renderer aggregates identical notifications into one counted card', async () => {
  const browser = installFakeBrowser();
  try {
    let shown = 0;
    let hidden = 0;
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6, { aggregateDuplicates: true });
    const options = {
      timeOut: 0,
      onShown: () => { shown += 1; },
      onHidden: () => { hidden += 1; },
    };
    const first = renderer.show('info', ['same', 'title', options], () => undefined, {});
    const second = renderer.show('info', ['same', 'title', options], () => undefined, {});

    assert.equal(first[0], second[0]);
    assert.equal(renderer.getStats().pending, 1);
    assert.equal(renderer.getStats().aggregated, 1);
    await Promise.resolve();
    browser.frames.shift()(16);
    assert.equal(renderer.getStats().active, 1);
    assert.equal(first[0].querySelector('.qyh-toast-redraw-count').textContent, '×2');
    assert.equal(shown, 2);

    renderer.show('info', ['same', 'title', options], () => undefined, {});
    assert.equal(renderer.getStats().aggregated, 2);
    assert.equal(first[0].querySelector('.qyh-toast-redraw-count').textContent, '×3');
    renderer.clear(first, { force: true, immediate: true });
    assert.equal(hidden, 3);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('duplicate aggregation can be disabled without changing redraw behavior', async () => {
  const browser = installFakeBrowser();
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6, { aggregateDuplicates: false });
    renderer.show('info', ['same', 'title', { timeOut: 0 }], () => undefined, {});
    renderer.show('info', ['same', 'title', { timeOut: 0 }], () => undefined, {});

    assert.equal(renderer.getStats().pending, 2);
    assert.equal(renderer.getStats().aggregated, 0);
    await Promise.resolve();
    browser.frames.shift()(16);
    assert.equal(renderer.getStats().active, 2);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('interactive duplicate notifications keep their independent click behavior', async () => {
  const browser = installFakeBrowser();
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6, { aggregateDuplicates: true });
    renderer.show('warning', ['same', 'title', { timeOut: 0, onclick() {} }], () => undefined, {});
    renderer.show('warning', ['same', 'title', { timeOut: 0, onclick() {} }], () => undefined, {});

    assert.equal(renderer.getStats().pending, 2);
    assert.equal(renderer.getStats().aggregated, 0);
    await Promise.resolve();
    browser.frames.shift()(16);
    assert.equal(renderer.getStats().active, 2);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('redraw timers freeze while the document is hidden and resume when visible', async () => {
  const browser = installFakeBrowser();
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6);
    const handle = renderer.show('success', ['timed', '', { timeOut: 5000, progressBar: true }], () => undefined, {});
    await Promise.resolve();
    browser.frames.shift()(16);

    browser.setVisibility('hidden');
    assert.equal(renderer.getStats().pausedForVisibility, 1);
    assert.equal(renderer.getStats().visibilityPauses, 1);
    browser.setVisibility('visible');
    assert.equal(renderer.getStats().pausedForVisibility, 0);
    assert.equal(renderer.clear(handle, { force: true, immediate: true }), true);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('local diagnostics use supported performance entries and can be reset', async () => {
  let instance;
  class FakePerformanceObserver {
    static supportedEntryTypes = ['longtask'];
    constructor(callback) {
      this.callback = callback;
      instance = this;
    }
    observe() {}
    disconnect() {}
    emit(entries) {
      this.callback({ getEntries: () => entries });
    }
  }
  const browser = installFakeBrowser({ performanceObserver: FakePerformanceObserver });
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6, { diagnosticsEnabled: true });
    renderer.show('info', ['diagnose', '', { timeOut: 0 }], () => undefined, {});
    await Promise.resolve();
    browser.frames.shift()(16);
    instance.emit([{ duration: 72 }]);

    assert.equal(renderer.getStats().observerType, 'longtask');
    assert.equal(renderer.getStats().frameSamples, 1);
    assert.equal(renderer.getStats().observedLongFrames, 1);
    assert.equal(renderer.getStats().maxObservedLongFrameMs, 72);
    renderer.resetDiagnostics();
    assert.equal(renderer.getStats().rendered, 0);
    assert.equal(renderer.getStats().observedLongFrames, 0);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('redraw renderer falls back synchronously for an invalid target', () => {
  const browser = installFakeBrowser();
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6);
    const result = renderer.show('warning', ['message', '', { target: '#missing' }], () => 'native', {});
    assert.equal(result, 'native');
    assert.equal(renderer.getStats().fallbacks, 1);
    assert.equal(renderer.getStats().pending, 0);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('redraw renderer caps each animation frame to twelve DOM creations', async () => {
  const browser = installFakeBrowser();
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 20);
    for (let index = 0; index < 13; index += 1) {
      renderer.show('info', [`message-${index}`, '', { timeOut: 0 }], () => undefined, {});
    }

    await Promise.resolve();
    browser.frames.shift()(16);
    assert.equal(renderer.getStats().active, 12);
    assert.equal(renderer.getStats().pending, 1);
    assert.equal(browser.frames.length, 1);

    browser.frames.shift()(32);
    assert.equal(renderer.getStats().active, 13);
    assert.equal(renderer.getStats().pending, 0);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('redraw cards remain click-dismissible when native tapToDismiss is false', async () => {
  const browser = installFakeBrowser();
  try {
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6);
    const handle = renderer.show('info', ['message', '', {
      tapToDismiss: false,
      timeOut: 0,
      hideDuration: 0,
    }], () => undefined, {});
    await Promise.resolve();
    browser.frames.shift()(16);

    const element = handle[0];
    assert.equal(element.classList.contains('interactable'), true);
    assert.equal(element.classList.contains('toast-non-interactable'), false);
    globalThis.document.activeElement = element;
    element.events.get('click')[0]({});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(renderer.getStats().active, 0);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('startup native toasts are moved intact into the redraw container and gain card dismissal', async () => {
  const browser = installFakeBrowser();
  try {
    const nativeContainer = new FakeElement('div');
    const nativeToast = new FakeElement('div');
    const originalLink = new FakeElement('a');
    nativeToast.className = 'toast toast-info toast-non-interactable';
    nativeToast.append(originalLink);
    nativeContainer.append(nativeToast);
    browser.body.append(nativeContainer);

    let dismissed = 0;
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6);
    const count = renderer.adoptNativeToasts([nativeToast], {}, element => {
      dismissed += 1;
      element.remove();
    });

    assert.equal(count, 1);
    assert.equal(nativeToast.parentElement.classList.contains('qyh-toast-redraw-container'), true);
    assert.equal(nativeToast.children[0], originalLink);
    assert.equal(nativeToast.classList.contains('qyh-toast-redraw'), true);
    assert.equal(nativeToast.classList.contains('interactable'), true);
    nativeToast.events.get('click')[0]({});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(dismissed, 1);
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('clear/remove compatibility guard recognizes asynchronous redraw handles', () => {
  const browser = installFakeBrowser();
  try {
    let nativeClears = 0;
    const renderer = new LightweightToastRenderer();
    renderer.configure(true, 6);
    const toastr = {
      clear: () => { nativeClears += 1; },
      remove: () => {},
    };
    const guard = guardToastrAuxiliaryMethods(toastr, renderer);
    const handle = renderer.show('info', ['pending', '', { timeOut: 0 }], () => undefined, {});
    toastr.clear(handle, { force: true });
    assert.equal(renderer.getStats().pending, 0);
    assert.equal(nativeClears, 0);
    toastr.clear();
    assert.equal(nativeClears, 1);
    guard.restore();
    renderer.stop();
  } finally {
    browser.restore();
  }
});

test('adopted and generated toasts share the visible ceiling and auxiliary removal never recurses', async () => {
  const browser = installFakeBrowser();
  const renderer = new LightweightToastRenderer();
  try {
    renderer.configure(true, 2);
    const native = [new FakeElement('div'), new FakeElement('div'), new FakeElement('div')];
    for (const element of native) { element.className = 'toast toast-info'; browser.body.append(element); }
    let nativeRemovals = 0;
    const toastr = { remove: handle => { nativeRemovals++; handle[0].remove(); } };
    const guard = guardToastrAuxiliaryMethods(toastr, renderer);
    renderer.adoptNativeToasts(native, { newestOnTop: false }, element => toastr.remove(globalThis.jQuery(element)));
    assert.equal(renderer.getStats().active, 2);
    assert.equal(renderer.getStats().adoptedActive, 2);
    assert.equal(native[0].isConnected, false);
    renderer.show('error', ['new', '', { timeOut: 0 }], () => {}, {});
    await Promise.resolve(); browser.frames.shift()(16);
    assert.equal(renderer.getStats().active, 2);
    assert.equal(renderer.getStats().adoptedActive, 1);
    toastr.remove(globalThis.jQuery(native[2]));
    assert.equal(renderer.getStats().adoptedActive, 0);
    assert.equal(nativeRemovals, 3);
    renderer.stop(); guard.restore();
    assert.equal(renderer.getStats().active, 0);
    assert.equal(browser.body.children.length, 0);
  } finally { renderer.stop(); browser.restore(); }
});

test('native timers may remove adopted nodes; pruning releases references without duplicate callbacks', () => {
  const browser = installFakeBrowser();
  const renderer = new LightweightToastRenderer();
  try {
    renderer.configure(true, 3);
    const native = new FakeElement('div'); native.className = 'toast toast-info'; browser.body.append(native);
    let dismissed = 0;
    renderer.adoptNativeToasts([native], {}, () => { dismissed++; });
    native.remove(); renderer.pruneDetachedToasts();
    assert.equal(renderer.getStats().active, 0);
    assert.equal(renderer.getStats().adoptedActive, 0);
    assert.equal(renderer.ownsHandle(globalThis.jQuery(native)), false);
    assert.equal(dismissed, 0);
    assert.equal(browser.body.children.length, 0);
  } finally { renderer.stop(); browser.restore(); }
});

test('empty startup adoption creates no persistent container', () => {
  const browser = installFakeBrowser(); const renderer = new LightweightToastRenderer();
  try {
    renderer.configure(true, 6); renderer.adoptNativeToasts([], {}, () => {});
    assert.equal(browser.body.children.length, 0);
  } finally { renderer.stop(); browser.restore(); }
});

test('performance sampling reuses observers, excludes buffered history and drains reset queues', () => {
  const instances = [];
  let drained = 0;
  class FakePerformanceObserver {
    static supportedEntryTypes = ['long-animation-frame'];
    constructor(callback) { this.callback = callback; instances.push(this); }
    observe(options) { this.options = options; }
    disconnect() {}
    takeRecords() { drained++; return [{ duration: 300 }]; }
    emit(entries) { this.callback({ getEntries: () => entries }); }
  }
  const browser = installFakeBrowser({ performanceObserver: FakePerformanceObserver });
  const renderer = new LightweightToastRenderer();
  try {
    renderer.configure(true, 6, { diagnosticsEnabled: true });
    const first = instances[0];
    assert.equal(first.options.buffered, false);
    first.emit([{ duration: 72 }]);
    renderer.configure(true, 4, { diagnosticsEnabled: true, aggregateDuplicates: false });
    assert.equal(instances.length, 1);
    assert.equal(renderer.getStats().observedLongFrames, 1);
    renderer.resetDiagnostics();
    assert.equal(drained, 1); assert.equal(renderer.getStats().observedLongFrames, 0);
    renderer.configure(true, 4, { diagnosticsEnabled: false });
    first.emit([{ duration: 900 }]);
    assert.equal(renderer.getStats().observedLongFrames, 0);
    renderer.configure(true, 4, { diagnosticsEnabled: true });
    assert.equal(instances.length, 2); assert.equal(instances[1].options.buffered, false);
    instances[1].emit([{ duration: 80 }]);
    assert.equal(renderer.getStats().observedLongFrames, 1);
  } finally { renderer.stop(); browser.restore(); }
});
