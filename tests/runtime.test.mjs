import assert from 'node:assert/strict';
import test from 'node:test';
import { ToastRuntimeBlocker } from '../dist/runtime.js';

test('runtime blocker suppresses then restores toastr methods', () => {
  const nodes = new Map();
  const queriedSelectors = [];
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalToastr = globalThis.toastr;
  const originalJQuery = globalThis.jQuery;

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  globalThis.document = {
    documentElement: {},
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
    blocker.configure(true, { success: false, info: false, warning: false, error: true });
    assert.deepEqual(globalThis.toastr.error('hidden'), { length: 0 });
    assert.equal(globalThis.toastr.success('visible'), 'success:visible');
    assert.equal(count, 1);
    assert.deepEqual(blocker.getStatus(), {
      enabled: true,
      blockedMethods: ['error'],
      guardedMethods: 1,
      observingDom: true,
      runtimeStyle: true,
    });
    assert.ok(queriedSelectors.includes('#toast-container > .toast-error'));
    assert.equal(queriedSelectors.includes('#toast-container > .toast-success'), false);

    blocker.setEnabled(false);
    assert.equal(globalThis.toastr.error('visible'), 'error:visible');
    assert.equal(blocker.getStatus().runtimeStyle, false);

    blocker.configure(true, { success: false, info: false, warning: false, error: false });
    assert.equal(globalThis.toastr.error('still visible'), 'error:still visible');
    assert.deepEqual(blocker.getStatus(), {
      enabled: true,
      blockedMethods: [],
      guardedMethods: 0,
      observingDom: false,
      runtimeStyle: false,
    });
  } finally {
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
    globalThis.toastr = originalToastr;
    globalThis.jQuery = originalJQuery;
  }
});
