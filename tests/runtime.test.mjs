import assert from 'node:assert/strict';
import test from 'node:test';
import { ToastRuntimeBlocker } from '../dist/runtime.js';

test('runtime blocker suppresses then restores toastr methods', () => {
  const nodes = new Map();
  const removedContainers = [];
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
    querySelectorAll() {
      return removedContainers;
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
    blocker.setEnabled(true);
    assert.deepEqual(globalThis.toastr.error('hidden'), { length: 0 });
    assert.equal(count, 1);
    assert.deepEqual(blocker.getStatus(), {
      enabled: true,
      guardedMethods: 4,
      observingDom: true,
      runtimeStyle: true,
    });

    blocker.setEnabled(false);
    assert.equal(globalThis.toastr.error('visible'), 'error:visible');
    assert.equal(blocker.getStatus().runtimeStyle, false);
  } finally {
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
    globalThis.toastr = originalToastr;
    globalThis.jQuery = originalJQuery;
  }
});
