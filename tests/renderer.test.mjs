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
    return { pause() {}, cancel() {} };
  }
}

function installFakeBrowser() {
  const originals = {
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    document: globalThis.document,
    jQuery: globalThis.jQuery,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const body = new FakeElement('body');
  body.setConnected(true);
  const frames = [];
  globalThis.document = {
    activeElement: null,
    body,
    createDocumentFragment: () => new FakeFragment(),
    createElement: tag => new FakeElement(tag),
    querySelector: selector => selector === 'body' ? body : null,
  };
  globalThis.jQuery = value => value === undefined ? { length: 0 } : { 0: value, length: 1 };
  globalThis.requestAnimationFrame = callback => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  return {
    body,
    frames,
    restore() {
      globalThis.cancelAnimationFrame = originals.cancelAnimationFrame;
      globalThis.document = originals.document;
      globalThis.jQuery = originals.jQuery;
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
